import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "@/lib/baseDeDonnees";
import { lienHistorique } from "@/lib/historiqueLien";
import {
  montantTotalEntree,
  type ContexteHistorique,
  type EntreeHistorique,
} from "@/lib/historique";

/**
 * Enregistre les entrées d'un envoi dans l'historique, dans la transaction du
 * client : si l'insertion échoue, l'appelant annule tout (ROLLBACK), donc
 * aucun numéro de nomenclature n'est consommé et aucun e-mail n'est envoyé.
 * Sans effet quand l'historique est désactivé pour le groupe.
 * Renvoie les identifiants des entrées créées (vide si rien n'a été écrit).
 */
export async function enregistrerHistorique(
  client: PoolClient,
  identifiantOrganisation: string,
  contexte: ContexteHistorique,
  entrees: readonly EntreeHistorique[],
): Promise<string[]> {
  if (entrees.length === 0) return [];
  const parametre = await client.query<{
    historique_actif: boolean;
    budget_actif: boolean;
  }>(
    `SELECT historique_actif, budget_actif FROM scouticket_group_data
      WHERE organization_id = $1`,
    [identifiantOrganisation],
  );
  if (!parametre.rows[0]?.historique_actif) return [];

  // Postes demandés : seuls ceux qui existent dans le bon domaine (dépense ou
  // recette) sont enregistrés, avec une copie texte du libellé.
  const postes = new Map<string, { label: string; domaine: string }>();
  const idsPostes = [
    ...new Set(
      entrees.flatMap((entree) =>
        entree.posteBudgetaireId ? [entree.posteBudgetaireId] : [],
      ),
    ),
  ];
  if (parametre.rows[0].budget_actif && idsPostes.length > 0) {
    const trouves = await client.query<{
      id: string;
      label: string;
      domaine: string;
    }>(
      `SELECT id, label, domaine FROM scouticket_postes_budgetaires
        WHERE organization_id = $1 AND id = ANY($2::text[])`,
      [identifiantOrganisation, idsPostes],
    );
    for (const poste of trouves.rows) postes.set(poste.id, poste);
  }

  const identifiantEnvoi = randomUUID();
  const identifiants: string[] = [];
  for (const entree of entrees) {
    const identifiant = randomUUID();
    identifiants.push(identifiant);
    const poste = entree.posteBudgetaireId
      ? postes.get(entree.posteBudgetaireId)
      : undefined;
    const domaineEntree = entree.type === "recette" ? "recette" : "depense";
    const posteValide = poste?.domaine === domaineEntree ? poste : undefined;
    await client.query(
      `INSERT INTO scouticket_historique
         (id, organization_id, envoi_id, type, date, unite_id, unite_label,
          unite_couleur, reference, mode_paiement, activite, description,
          montant_total, lignes, auteur_user_id, poste_id, poste_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
               $14::jsonb, $15, $16, $17)`,
      [
        identifiant,
        identifiantOrganisation,
        identifiantEnvoi,
        entree.type,
        entree.date,
        contexte.uniteId,
        contexte.uniteLabel,
        contexte.uniteCouleur,
        entree.reference,
        entree.modePaiement,
        entree.activite,
        entree.description,
        montantTotalEntree(entree),
        JSON.stringify(entree.lignes),
        contexte.auteurUserId,
        posteValide ? entree.posteBudgetaireId : null,
        posteValide?.label ?? null,
      ],
    );
  }
  return identifiants;
}

/** Entrées d'historique d'un envoi, avec son contexte (unité, auteur). */
export interface HistoriqueEnvoi {
  contexte: ContexteHistorique;
  entrees: EntreeHistorique[];
}

/**
 * Envoi sans nomenclature (donc sans numéro à réserver) : l'historique est
 * tout de même écrit avant l'envoi dans une transaction, validée seulement
 * si l'e-mail est parti. Même garantie que `envoyerAvecNomenclature`.
 * `envoyer` reçoit le lien vers l'historique à mettre dans l'e-mail (absent si
 * l'historique est désactivé).
 */
export async function envoyerAvecHistorique<R>(
  identifiantOrganisation: string,
  historique: HistoriqueEnvoi,
  envoyer: (lienDansEmail?: string) => Promise<R>,
): Promise<R> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const identifiants = await enregistrerHistorique(
      client,
      identifiantOrganisation,
      historique.contexte,
      historique.entrees,
    );
    const resultat = await envoyer(lienHistorique(identifiants));
    await client.query("COMMIT");
    return resultat;
  } catch (erreur) {
    await client.query("ROLLBACK");
    throw erreur;
  } finally {
    client.release();
  }
}
