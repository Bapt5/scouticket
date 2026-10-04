import { NextResponse } from "next/server";
import { z } from "zod";
import { validerUnites } from "@/lib/group";
import {
  appliquerUnites,
  estResponsable as isAdmin,
  recupererGroupeActif,
  recupererRoleMembre,
  recupererUnitesAutoriseesMembre,
} from "@/lib/groupServer";
import { recupererContexteGroupe } from "@/lib/sessionServeur";
import { pool } from "@/lib/baseDeDonnees";
import { recupererPostes } from "@/lib/budgetServer";
import { verifierOrigineRequete } from "@/lib/api/securiteRequetes";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";

const bodySchema = z.object({
  units: z.unknown(),
});

/** Récupère la configuration et les droits de l'utilisateur pour son groupe actif. */
export async function GET(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const { identifiantOrganisation, identifiantUtilisateur } =
      await recupererContexteGroupe();
    if (!identifiantOrganisation || !identifiantUtilisateur)
      return NextResponse.json(
        { error: "Sélectionnez un groupe" },
        { status: 400 },
      );
    const group = await recupererGroupeActif(identifiantOrganisation);
    const role = await recupererRoleMembre(
      identifiantUtilisateur,
      identifiantOrganisation,
    );
    const preference = await pool.query<{ unit_id: string }>(
      // Cette préférence est propre à l'utilisateur, contrairement aux unités du groupe.
      `SELECT unit_id FROM scouticket_user_unit_preference
        WHERE user_id = $1 AND organization_id = $2`,
      [identifiantUtilisateur, identifiantOrganisation],
    );
    // Un membre simple ne doit se voir proposer que les unités qui lui sont
    // attribuées ; un responsable (owner/admin) voit toujours tout le groupe.
    const unitesVisibles = isAdmin(role)
      ? group.unites
      : await (async () => {
          const autorisees = await recupererUnitesAutoriseesMembre(
            identifiantUtilisateur,
            identifiantOrganisation,
          );
          return group.unites.filter((unite) => autorisees.has(unite.id));
        })();
    // Postes budgétaires : proposés dans les formulaires quand le suivi est actif.
    const postes = group.parametres.budgetActif
      ? await recupererPostes(identifiantOrganisation)
      : null;
    return NextResponse.json({
      groupName: group.organisation.name,
      units: unitesVisibles,
      postesBudgetaires: postes
        ? {
            depense: postes.filter((poste) => poste.domaine === "depense"),
            recette: postes.filter((poste) => poste.domaine === "recette"),
          }
        : undefined,
      nomenclature: group.nomenclature,
      parametres: group.parametres,
      configured: Boolean(group.unites.length),
      aTresorier: group.emailsTresoriers.length > 0,
      isAdmin: isAdmin(role),
      unitPreference: unitesVisibles.some(
        (unite) => unite.id === preference.rows[0]?.unit_id,
      )
        ? preference.rows[0].unit_id
        : "",
    });
  });
}

/** Enregistre la configuration des unités du groupe. */
export async function POST(req: Request) {
  return executerRouteAvecLogs(req, async () => {
    const { identifiantOrganisation, identifiantUtilisateur } =
      await recupererContexteGroupe();
    const role =
      identifiantOrganisation && identifiantUtilisateur
        ? await recupererRoleMembre(
            identifiantUtilisateur,
            identifiantOrganisation,
          )
        : null;
    if (!identifiantOrganisation || !isAdmin(role))
      return NextResponse.json(
        { error: "Accès réservé aux responsables du groupe" },
        { status: 403 },
      );
    // Empêche qu'un autre site déclenche cette modification au nom d'un administrateur.
    const originError = verifierOrigineRequete(req);
    if (originError) return originError;

    // Récupération des paramètres de la requête.
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    const units = parsed.success ? validerUnites(parsed.data.units) : null;
    if (!parsed.success || !units)
      return NextResponse.json(
        { error: "Configuration invalide" },
        { status: 400 },
      );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // La ligne du groupe peut ne pas exister encore.
      await client.query(
        `INSERT INTO scouticket_group_data (organization_id)
       VALUES ($1)
       ON CONFLICT (organization_id) DO NOTHING`,
        [identifiantOrganisation],
      );
      // Garantit qu'un trésorier (souvent le créateur du groupe, à sa
      // première configuration) reçoit les mails par défaut dès qu'il passe
      // par cette étape, sans dépendre d'une promotion via /role.
      if (role === "owner")
        await client.query(
          `INSERT INTO scouticket_notification_tresorerie (user_id, organization_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
          [identifiantUtilisateur, identifiantOrganisation],
        );
      await appliquerUnites(client, identifiantOrganisation, units);
      await client.query("COMMIT");
    } catch (erreur) {
      await client.query("ROLLBACK");
      throw erreur;
    } finally {
      client.release();
    }
    return NextResponse.json({ success: true });
  });
}
