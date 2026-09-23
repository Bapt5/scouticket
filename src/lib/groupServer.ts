import type { UniteBrouillon, UniteGroupe } from "./group";
import type { ValidationTresorerie } from "./treasuryVerification";
import { pool } from "@/lib/baseDeDonnees";
import type { PoolClient } from "pg";

export async function recupererGroupeActif(identifiantOrganisation: string) {
  const resultat = await pool.query<{
    name: string;
    treasury_email: string | null;
    treasury_verification: unknown;
  }>(
    `SELECT organization.name, donnees.treasury_email,
            donnees.treasury_verification
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
  };
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
