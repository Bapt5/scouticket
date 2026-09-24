import type { UniteBrouillon, UniteGroupe } from "./group";
import type { ValidationTresorerie } from "./treasuryVerification";
import {
  PARAMETRES_ANNEE_COMPTABLE_PAR_DEFAUT,
  type FormatAnneeComptable,
  type ReservationNumeros,
} from "./nomenclature";
import { pool } from "@/lib/baseDeDonnees";
import type { PoolClient } from "pg";

export async function recupererGroupeActif(identifiantOrganisation: string) {
  const resultat = await pool.query<{
    name: string;
    treasury_email: string | null;
    treasury_verification: unknown;
    nomenclature_format: string | null;
    annee_comptable_debut_mois: number | null;
    annee_comptable_debut_jour: number | null;
    annee_comptable_format: FormatAnneeComptable | null;
  }>(
    `SELECT organization.name, donnees.treasury_email,
            donnees.treasury_verification, donnees.nomenclature_format,
            donnees.annee_comptable_debut_mois,
            donnees.annee_comptable_debut_jour,
            donnees.annee_comptable_format
       FROM organization
       LEFT JOIN scouticket_group_data donnees
         ON donnees.organization_id = organization.id
      WHERE organization.id = $1`,
    [identifiantOrganisation],
  );
  const groupe = resultat.rows[0];
  if (!groupe) throw new Error("ORGANISATION_INTRouvable");

  const unites = await pool.query<UniteGroupe>(
    `SELECT id, label, color FROM scouticket_unites
      WHERE organization_id = $1 ORDER BY ordre ASC`,
    [identifiantOrganisation],
  );

  return {
    organisation: { id: identifiantOrganisation, name: groupe.name },
    unites: unites.rows,
    emailTresorerie: groupe.treasury_email ?? "",
    validation: (groupe.treasury_verification ?? {
      status: "pending",
    }) as ValidationTresorerie,
    nomenclature: {
      format: groupe.nomenclature_format,
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
    },
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
): Promise<{ premierGlobal?: number; premierComptable?: number }> {
  const resultat = await client.query<{
    compteur_global: number;
    compteurs_comptables: Record<string, number>;
  }>(
    `SELECT compteur_global, compteurs_comptables
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
        SET compteur_global = $2, compteurs_comptables = $3::jsonb
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
