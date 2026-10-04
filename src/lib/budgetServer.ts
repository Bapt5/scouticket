import type { PoolClient } from "pg";
import {
  DOMAINES_BUDGET,
  LIBELLE_NON_AFFECTE,
  POSTES_PAR_DEFAUT,
  type DomaineBudget,
  type LigneSuiviBudget,
  type PosteBrouillon,
  type PosteBudgetaire,
} from "./budget";
import { intervalleAnneeComptable } from "./historique";
import { pool } from "@/lib/baseDeDonnees";

type Executeur = Pick<PoolClient, "query">;

/** Postes du groupe, dans l'ordre d'affichage (dépenses puis recettes). */
export async function recupererPostes(
  identifiantOrganisation: string,
  executeur: Executeur = pool,
): Promise<PosteBudgetaire[]> {
  const resultat = await executeur.query<PosteBudgetaire>(
    `SELECT id, domaine, label FROM scouticket_postes_budgetaires
      WHERE organization_id = $1
      ORDER BY domaine ASC, ordre ASC`,
    [identifiantOrganisation],
  );
  return resultat.rows;
}

/**
 * Remplace les postes d'un groupe : attribue un id aux nouveaux (id `null`),
 * met à jour les existants (l'historique référence leur id) et supprime ceux
 * qui ont disparu. Leurs écritures passent en « Non affecté » (la FK remet
 * `poste_id` à NULL, la copie texte du libellé est conservée).
 */
export async function appliquerPostes(
  client: Executeur,
  identifiantOrganisation: string,
  postes: PosteBrouillon[],
): Promise<PosteBudgetaire[]> {
  const enregistres: PosteBudgetaire[] = postes.map((poste) => ({
    ...poste,
    id: poste.id ?? crypto.randomUUID(),
  }));
  await client.query(
    `DELETE FROM scouticket_postes_budgetaires
      WHERE organization_id = $1 AND NOT (id = ANY($2::text[]))`,
    [identifiantOrganisation, enregistres.map((poste) => poste.id)],
  );
  const ordreParDomaine: Record<DomaineBudget, number> = {
    depense: 0,
    recette: 0,
  };
  for (const poste of enregistres) {
    await client.query(
      `INSERT INTO scouticket_postes_budgetaires
         (organization_id, id, domaine, label, ordre)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, id) DO UPDATE
         SET label = EXCLUDED.label, ordre = EXCLUDED.ordre
         WHERE scouticket_postes_budgetaires.domaine = EXCLUDED.domaine`,
      [
        identifiantOrganisation,
        poste.id,
        poste.domaine,
        poste.label,
        ordreParDomaine[poste.domaine]++,
      ],
    );
  }
  return enregistres;
}

/** Crée les postes par défaut si le groupe n'en a aucun (activation du suivi). */
export async function initialiserPostesParDefaut(
  client: Executeur,
  identifiantOrganisation: string,
): Promise<void> {
  const existants = await client.query(
    "SELECT 1 FROM scouticket_postes_budgetaires WHERE organization_id = $1 LIMIT 1",
    [identifiantOrganisation],
  );
  if ((existants.rowCount ?? 0) > 0) return;
  await appliquerPostes(client, identifiantOrganisation, POSTES_PAR_DEFAUT);
}

/**
 * Enregistre les budgets d'une année comptable : un montant `null` supprime
 * le budget du poste. Les postes inconnus du groupe sont ignorés par la FK
 * (la requête ne sélectionne que les postes existants).
 */
export async function enregistrerBudgets(
  client: Executeur,
  identifiantOrganisation: string,
  anneeDebut: number,
  budgets: { posteId: string; montant: number | null }[],
): Promise<void> {
  for (const { posteId, montant } of budgets) {
    if (montant === null) {
      await client.query(
        `DELETE FROM scouticket_budgets_postes
          WHERE organization_id = $1 AND poste_id = $2 AND annee_debut = $3`,
        [identifiantOrganisation, posteId, anneeDebut],
      );
      continue;
    }
    await client.query(
      `INSERT INTO scouticket_budgets_postes
         (organization_id, poste_id, annee_debut, montant)
       SELECT organization_id, id, $3, $4
         FROM scouticket_postes_budgetaires
        WHERE organization_id = $1 AND id = $2
       ON CONFLICT (organization_id, poste_id, annee_debut)
         DO UPDATE SET montant = EXCLUDED.montant`,
      [identifiantOrganisation, posteId, anneeDebut, montant],
    );
  }
}

export interface SuiviBudgetaire {
  anneeDebut: number;
  du: string;
  au: string;
  depense: LigneSuiviBudget[];
  recette: LigneSuiviBudget[];
}

/**
 * Budget et réalisé par poste sur une année comptable. Le réalisé est la
 * somme de `montant_total` des lignes d'historique du poste dont la date
 * tombe dans l'année ; les lignes sans poste forment « Non affecté ».
 */
export async function calculerSuiviBudgetaire(
  identifiantOrganisation: string,
  anneeDebut: number,
  debut: { mois: number; jour: number },
): Promise<SuiviBudgetaire> {
  const { du, au } = intervalleAnneeComptable(anneeDebut, debut);
  const [postes, budgets, realises] = await Promise.all([
    recupererPostes(identifiantOrganisation),
    pool.query<{ poste_id: string; montant: number }>(
      `SELECT poste_id, montant::float8 AS montant
         FROM scouticket_budgets_postes
        WHERE organization_id = $1 AND annee_debut = $2`,
      [identifiantOrganisation, anneeDebut],
    ),
    pool.query<{ poste_id: string | null; recette: boolean; total: number }>(
      `SELECT poste_id, (type = 'recette') AS recette,
              COALESCE(SUM(montant_total), 0)::float8 AS total
         FROM scouticket_historique
        WHERE organization_id = $1 AND date BETWEEN $2 AND $3
        GROUP BY poste_id, (type = 'recette')`,
      [identifiantOrganisation, du, au],
    ),
  ]);

  const budgetParPoste = new Map(
    budgets.rows.map((ligne) => [ligne.poste_id, ligne.montant]),
  );
  const arrondir = (valeur: number) => Math.round(valeur * 100) / 100;
  const suivi: SuiviBudgetaire = {
    anneeDebut,
    du,
    au,
    depense: [],
    recette: [],
  };
  for (const domaine of DOMAINES_BUDGET) {
    const estRecette = domaine === "recette";
    const realiseDuDomaine = realises.rows.filter(
      (ligne) => ligne.recette === estRecette,
    );
    const lignes: LigneSuiviBudget[] = postes
      .filter((poste) => poste.domaine === domaine)
      .map((poste) => ({
        id: poste.id,
        label: poste.label,
        budget: budgetParPoste.get(poste.id) ?? null,
        realise: arrondir(
          realiseDuDomaine
            .filter((ligne) => ligne.poste_id === poste.id)
            .reduce((somme, ligne) => somme + ligne.total, 0),
        ),
      }));
    const idsConnus = new Set(lignes.map((ligne) => ligne.id));
    const nonAffecte = realiseDuDomaine
      .filter((ligne) => !ligne.poste_id || !idsConnus.has(ligne.poste_id))
      .reduce((somme, ligne) => somme + ligne.total, 0);
    if (nonAffecte !== 0)
      lignes.push({
        id: null,
        label: LIBELLE_NON_AFFECTE,
        budget: null,
        realise: arrondir(nonAffecte),
      });
    suivi[domaine] = lignes;
  }
  return suivi;
}

/** Nombre de postes et de lignes d'historique affectées (message de confirmation). */
export async function compterDonneesBudget(
  identifiantOrganisation: string,
): Promise<{ postes: number; ecritures: number }> {
  const [postes, ecritures] = await Promise.all([
    pool.query<{ total: string }>(
      "SELECT COUNT(*) AS total FROM scouticket_postes_budgetaires WHERE organization_id = $1",
      [identifiantOrganisation],
    ),
    pool.query<{ total: string }>(
      "SELECT COUNT(*) AS total FROM scouticket_historique WHERE organization_id = $1 AND poste_id IS NOT NULL",
      [identifiantOrganisation],
    ),
  ]);
  return {
    postes: Number(postes.rows[0]?.total ?? 0),
    ecritures: Number(ecritures.rows[0]?.total ?? 0),
  };
}

/**
 * Contrôle les postes d'un envoi : obligatoires et existants dans le bon
 * domaine quand le suivi est actif (message d'erreur), sans effet sinon.
 */
export async function verifierPostesEnvoi(
  identifiantOrganisation: string,
  budgetActif: boolean,
  domaine: DomaineBudget,
  ids: readonly (string | null | undefined)[],
): Promise<string | null> {
  if (!budgetActif) return null;
  if (ids.some((id) => !id)) return "Poste budgétaire manquant";
  const uniques = [...new Set(ids as string[])];
  const resultat = await pool.query(
    `SELECT 1 FROM scouticket_postes_budgetaires
      WHERE organization_id = $1 AND domaine = $2 AND id = ANY($3::text[])`,
    [identifiantOrganisation, domaine, uniques],
  );
  return (resultat.rowCount ?? 0) === uniques.length
    ? null
    : "Poste budgétaire invalide";
}
