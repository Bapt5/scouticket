import type { UniteBrouillon, UniteGroupe } from "./group";
import {
  PARAMETRES_ANNEE_COMPTABLE_PAR_DEFAUT,
  type FormatAnneeComptable,
  type ReservationNumeros,
} from "./nomenclature";
import type { ParametresGroupe } from "./parametresGroupe";
import { MOYENS_PAIEMENT_PAR_DEFAUT } from "@/constants/configDepenses";
import { pool } from "@/lib/baseDeDonnees";
import type { PoolClient } from "pg";

export async function recupererGroupeActif(identifiantOrganisation: string) {
  const resultat = await pool.query<{
    name: string;
    nomenclature_format: string | null;
    nomenclature_format_recette: string | null;
    annee_comptable_debut_mois: number | null;
    annee_comptable_debut_jour: number | null;
    annee_comptable_format: FormatAnneeComptable | null;
    scan_justificatifs_actif: boolean | null;
    convertir_justificatifs_pdf: boolean | null;
    moyens_paiement: string[] | null;
    ndf_signee_actif: boolean | null;
  }>(
    `SELECT organization.name, donnees.nomenclature_format,
            donnees.nomenclature_format_recette,
            donnees.annee_comptable_debut_mois,
            donnees.annee_comptable_debut_jour,
            donnees.annee_comptable_format,
            donnees.scan_justificatifs_actif,
            donnees.convertir_justificatifs_pdf,
            donnees.moyens_paiement,
            donnees.ndf_signee_actif
       FROM organization
       LEFT JOIN scouticket_group_data donnees
         ON donnees.organization_id = organization.id
      WHERE organization.id = $1`,
    [identifiantOrganisation],
  );
  const groupe = resultat.rows[0];
  if (!groupe) throw new Error("ORGANISATION_INTRouvable");

  const [unites, tresoriers] = await Promise.all([
    pool.query<UniteGroupe>(
      `SELECT id, label, color FROM scouticket_unites
        WHERE organization_id = $1 ORDER BY ordre ASC`,
      [identifiantOrganisation],
    ),
    pool.query<{ email: string }>(
      `SELECT "user".email
         FROM member
         JOIN "user" ON "user".id = member."userId"
         JOIN scouticket_notification_tresorerie notif
           ON notif.user_id = member."userId"
          AND notif.organization_id = member."organizationId"
        WHERE member."organizationId" = $1 AND member.role = 'owner'`,
      [identifiantOrganisation],
    ),
  ]);

  return {
    organisation: { id: identifiantOrganisation, name: groupe.name },
    unites: unites.rows,
    emailsTresoriers: tresoriers.rows.map((ligne) => ligne.email),
    nomenclature: {
      anneeComptable: {
        mois:
          groupe.annee_comptable_debut_mois ??
          PARAMETRES_ANNEE_COMPTABLE_PAR_DEFAUT.mois,
        jour:
          groupe.annee_comptable_debut_jour ??
          PARAMETRES_ANNEE_COMPTABLE_PAR_DEFAUT.jour,
        format:
          groupe.annee_comptable_format ??
          PARAMETRES_ANNEE_COMPTABLE_PAR_DEFAUT.format,
      },
      depense: { format: groupe.nomenclature_format },
      recette: { format: groupe.nomenclature_format_recette },
    },
    parametres: {
      scanJustificatifsActif: groupe.scan_justificatifs_actif ?? false,
      convertirJustificatifsEnPdf: groupe.convertir_justificatifs_pdf ?? false,
      moyensPaiement: groupe.moyens_paiement ?? [...MOYENS_PAIEMENT_PAR_DEFAUT],
      ndfSigneeActif: groupe.ndf_signee_actif ?? false,
    } satisfies ParametresGroupe,
  };
}

/** Nom des colonnes de compteurs, selon le domaine (dépense ou recette). */
function colonnesCompteurs(domaine: "depense" | "recette") {
  return domaine === "recette"
    ? {
        compteurGlobal: "compteur_global_recette",
        compteursComptables: "compteurs_comptables_recette",
      }
    : {
        compteurGlobal: "compteur_global",
        compteursComptables: "compteurs_comptables",
      };
}

/**
 * Réserve des numéros dans la transaction du client (verrou de ligne sur le
 * groupe) et renvoie le premier numéro attribué pour chaque compteur. Les
 * compteurs ne sont définitifs qu'au COMMIT : un envoi échoué ne crée donc
 * aucun trou dans la numérotation.
 */
export async function reserverNumeros(
  client: PoolClient,
  identifiantOrganisation: string,
  reservation: ReservationNumeros,
  domaine: "depense" | "recette" = "depense",
): Promise<{ premierGlobal?: number; premierComptable?: number }> {
  const { compteurGlobal: colGlobal, compteursComptables: colComptables } =
    colonnesCompteurs(domaine);
  const resultat = await client.query<{
    compteur_global: number;
    compteurs_comptables: Record<string, number>;
  }>(
    `SELECT ${colGlobal} AS compteur_global, ${colComptables} AS compteurs_comptables
       FROM scouticket_group_data
      WHERE organization_id = $1 FOR UPDATE`,
    [identifiantOrganisation],
  );
  const ligne = resultat.rows[0];
  if (!ligne) throw new Error("GROUPE_NON_CONFIGURE");

  const compteurs = { ...ligne.compteurs_comptables };
  let compteurGlobal = ligne.compteur_global;
  const attribues: { premierGlobal?: number; premierComptable?: number } = {};

  if (reservation.global > 0) {
    attribues.premierGlobal = compteurGlobal + 1;
    compteurGlobal += reservation.global;
  }
  if (reservation.comptable) {
    const cle = String(reservation.comptable.annee);
    const dernier = compteurs[cle] ?? 0;
    attribues.premierComptable = dernier + 1;
    compteurs[cle] = dernier + reservation.comptable.nombre;
  }
  await client.query(
    `UPDATE scouticket_group_data
        SET ${colGlobal} = $2, ${colComptables} = $3::jsonb
      WHERE organization_id = $1`,
    [identifiantOrganisation, compteurGlobal, JSON.stringify(compteurs)],
  );
  return attribues;
}

export async function recupererRoleMembre(
  identifiantUtilisateur: string,
  identifiantOrganisation: string,
) {
  const resultat = await pool.query<{ role: string }>(
    'SELECT role FROM member WHERE "userId" = $1 AND "organizationId" = $2',
    [identifiantUtilisateur, identifiantOrganisation],
  );
  return resultat.rows[0]?.role ?? null;
}

/** Un responsable (owner/admin) a toujours accès à toutes les unités de son groupe. */
export function estResponsable(role: string | null) {
  return role === "admin" || role === "owner";
}

/**
 * Nombre de trésoriers (rôle owner) qui reçoivent actuellement les mails de
 * notes de frais/dépenses/recettes dans ce groupe, hors le membre exclu le
 * cas échéant (pour vérifier l'invariant avant de le désactiver lui-même).
 */
export async function compterTresoriersNotifies(
  identifiantOrganisation: string,
  identifiantUtilisateurExclu?: string,
): Promise<number> {
  const resultat = await pool.query<{ count: string }>(
    `SELECT COUNT(*)
       FROM member
       JOIN scouticket_notification_tresorerie notif
         ON notif.user_id = member."userId"
        AND notif.organization_id = member."organizationId"
      WHERE member."organizationId" = $1 AND member.role = 'owner'
        AND ($2::text IS NULL OR member."userId" != $2)`,
    [identifiantOrganisation, identifiantUtilisateurExclu ?? null],
  );
  return Number(resultat.rows[0]?.count ?? 0);
}

/** Membre potentiellement signataire, tel qu'exposé par l'API. */
export interface MembreSignataire {
  id: string;
  nom: string;
  email: string;
}

async function recupererListeSignataires(
  identifiantOrganisation: string,
  role: "admin" | "owner",
): Promise<{ retenus: MembreSignataire[]; nonRetenus: MembreSignataire[] }> {
  const resultat = await pool.query<{
    id: string;
    nom: string;
    email: string;
    ordre: number | null;
  }>(
    `SELECT member.id, "user".name AS nom, "user".email, signataires.ordre
       FROM member
       JOIN "user" ON "user".id = member."userId"
       LEFT JOIN scouticket_signataires signataires
         ON signataires.user_id = member."userId"
        AND signataires.organization_id = member."organizationId"
      WHERE member."organizationId" = $1 AND member.role = $2
      ORDER BY signataires.ordre IS NULL, signataires.ordre ASC,
               "user".name ASC, "user".email ASC`,
    [identifiantOrganisation, role],
  );
  const retenus: MembreSignataire[] = [];
  const nonRetenus: MembreSignataire[] = [];
  for (const { ordre, ...membre } of resultat.rows)
    (ordre === null ? nonRetenus : retenus).push(membre);
  return { retenus, nonRetenus };
}

/** Signataire retenu du circuit, identifié par son id utilisateur (Better Auth). */
export interface SignatairePriorite {
  userId: string;
  nom: string;
  email: string;
}

/**
 * Liste de priorité (retenus uniquement) des signataires d'une catégorie,
 * identifiés par `userId`, utilisé pour résoudre le circuit de signature
 * (contrairement à `MembreSignataire.id`, qui est un id de membre destiné à
 * l'UI de gestion des signataires).
 */
export async function recupererOrdreSignatairesUserId(
  identifiantOrganisation: string,
  role: "admin" | "owner",
): Promise<SignatairePriorite[]> {
  const resultat = await pool.query<SignatairePriorite>(
    `SELECT signataires.user_id AS "userId", "user".name AS nom, "user".email
       FROM scouticket_signataires signataires
       JOIN member ON member."userId" = signataires.user_id
        AND member."organizationId" = signataires.organization_id
       JOIN "user" ON "user".id = signataires.user_id
      WHERE signataires.organization_id = $1 AND member.role = $2
      ORDER BY signataires.ordre ASC`,
    [identifiantOrganisation, role],
  );
  return resultat.rows;
}

/**
 * Liste de priorité des signataires du groupe pour les Responsables (rôle
 * admin) et les Trésoriers (rôle owner), avec les membres non retenus dans
 * chaque catégorie (rôle admin/owner mais exclus du circuit de signature).
 */
export async function recupererSignataires(identifiantOrganisation: string) {
  const [responsables, tresoriers] = await Promise.all([
    recupererListeSignataires(identifiantOrganisation, "admin"),
    recupererListeSignataires(identifiantOrganisation, "owner"),
  ]);
  return { responsables, tresoriers };
}

/**
 * Prochain rang disponible pour ajouter un signataire en fin de liste d'une
 * catégorie (rôle admin ou owner) donnée. Utilisé aussi bien pour une
 * première insertion (promotion) que pour replacer un signataire qui change
 * de catégorie (ex. admin devenu owner), afin d'éviter un rang dupliqué avec
 * un signataire déjà présent dans la nouvelle catégorie.
 */
export async function prochainOrdreSignataire(
  executeur: { query: typeof pool.query },
  identifiantOrganisation: string,
  role: "admin" | "owner",
): Promise<number> {
  const resultat = await executeur.query<{ prochain: number }>(
    `SELECT COALESCE(MAX(signataires.ordre), 0) + 1 AS prochain
       FROM scouticket_signataires signataires
       JOIN member ON member."userId" = signataires.user_id
        AND member."organizationId" = signataires.organization_id
      WHERE member."organizationId" = $1 AND member.role = $2`,
    [identifiantOrganisation, role],
  );
  return Number(resultat.rows[0]?.prochain ?? 1);
}

/** Unités qu'un membre simple est explicitement autorisé à utiliser. */
export async function recupererUnitesAutoriseesMembre(
  identifiantUtilisateur: string,
  identifiantOrganisation: string,
): Promise<Set<string>> {
  const resultat = await pool.query<{ unite_id: string }>(
    `SELECT unite_id FROM scouticket_acces_unite_membre
      WHERE user_id = $1 AND organization_id = $2`,
    [identifiantUtilisateur, identifiantOrganisation],
  );
  return new Set(resultat.rows.map((ligne) => ligne.unite_id));
}

/**
 * Remplace les unités d'un groupe : attribue un id opaque aux unités pas
 * encore enregistrées (id `null`), met à jour/insère les unités toujours
 * présentes (sans perdre leur identité, donc sans casser les accès membres
 * qui référencent leur id) et supprime uniquement celles qui ont disparu.
 * Renvoie la liste enregistrée (avec ses ids définitifs) pour resynchroniser
 * l'état d'édition côté client.
 */
export async function appliquerUnites(
  client: PoolClient,
  identifiantOrganisation: string,
  unites: UniteBrouillon[],
): Promise<UniteGroupe[]> {
  const unitesEnregistrees: UniteGroupe[] = unites.map((unite) => ({
    ...unite,
    id: unite.id ?? crypto.randomUUID(),
  }));

  const idsConserves = unitesEnregistrees.map((unite) => unite.id);
  await client.query(
    `DELETE FROM scouticket_unites
      WHERE organization_id = $1 AND NOT (id = ANY($2::text[]))`,
    [identifiantOrganisation, idsConserves],
  );
  for (const [index, unite] of unitesEnregistrees.entries()) {
    await client.query(
      `INSERT INTO scouticket_unites (organization_id, id, label, color, ordre)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, id) DO UPDATE
         SET label = EXCLUDED.label, color = EXCLUDED.color, ordre = EXCLUDED.ordre`,
      [identifiantOrganisation, unite.id, unite.label, unite.color, index],
    );
  }
  return unitesEnregistrees;
}
