import { NextResponse } from "next/server";
import { z } from "zod";
import { estResponsable, recupererRoleMembre } from "@/lib/groupServer";
import { recupererContexteGroupe } from "@/lib/sessionServeur";
import { pool } from "@/lib/baseDeDonnees";
import { verifierOrigineRequete } from "@/lib/api/securiteRequetes";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";

const schemaCorps = z.object({ uniteIds: z.array(z.string()) });

async function resoudreMembreCible(
  memberId: string,
  identifiantOrganisation: string,
) {
  const resultat = await pool.query<{ userId: string; role: string }>(
    `SELECT "userId", role FROM member WHERE id = $1 AND "organizationId" = $2`,
    [memberId, identifiantOrganisation],
  );
  return resultat.rows[0] ?? null;
}

/** Renvoie les unités du groupe et celles autorisées pour ce membre. */
export async function GET(
  requete: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  return executerRouteAvecLogs(requete, async () => {
    const { identifiantOrganisation, identifiantUtilisateur } =
      await recupererContexteGroupe();
    const roleAppelant =
      identifiantOrganisation && identifiantUtilisateur
        ? await recupererRoleMembre(
            identifiantUtilisateur,
            identifiantOrganisation,
          )
        : null;
    if (!identifiantOrganisation || !estResponsable(roleAppelant))
      return NextResponse.json(
        { error: "Accès réservé aux responsables du groupe" },
        { status: 403 },
      );

    const { memberId } = await params;
    const membre = await resoudreMembreCible(memberId, identifiantOrganisation);
    if (!membre)
      return NextResponse.json(
        { error: "Membre introuvable" },
        { status: 404 },
      );

    const unites = await pool.query<{
      id: string;
      label: string;
      color: string;
    }>(
      `SELECT id, label, color FROM scouticket_unites
        WHERE organization_id = $1 ORDER BY ordre ASC`,
      [identifiantOrganisation],
    );
    const accesTotal = estResponsable(membre.role);
    const uniteIdsAutorisees = accesTotal
      ? unites.rows.map((unite) => unite.id)
      : (
          await pool.query<{ unite_id: string }>(
            `SELECT unite_id FROM scouticket_acces_unite_membre
              WHERE user_id = $1 AND organization_id = $2`,
            [membre.userId, identifiantOrganisation],
          )
        ).rows.map((ligne) => ligne.unite_id);

    return NextResponse.json({
      role: membre.role,
      accesTotal,
      unites: unites.rows,
      uniteIdsAutorisees,
    });
  });
}

/** Remplace les unités autorisées pour ce membre. */
export async function PATCH(
  requete: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  return executerRouteAvecLogs(requete, async () => {
    const { identifiantOrganisation, identifiantUtilisateur } =
      await recupererContexteGroupe();
    const roleAppelant =
      identifiantOrganisation && identifiantUtilisateur
        ? await recupererRoleMembre(
            identifiantUtilisateur,
            identifiantOrganisation,
          )
        : null;
    if (!identifiantOrganisation || !estResponsable(roleAppelant))
      return NextResponse.json(
        { error: "Accès réservé aux responsables du groupe" },
        { status: 403 },
      );

    const erreurOrigine = verifierOrigineRequete(requete);
    if (erreurOrigine) return erreurOrigine;

    const { memberId } = await params;
    const membre = await resoudreMembreCible(memberId, identifiantOrganisation);
    if (!membre)
      return NextResponse.json(
        { error: "Membre introuvable" },
        { status: 404 },
      );
    if (estResponsable(membre.role))
      return NextResponse.json(
        { error: "Ce membre a déjà accès à toutes les unités" },
        { status: 400 },
      );

    const corps = schemaCorps.safeParse(await requete.json().catch(() => null));
    if (!corps.success)
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

    // Ne garde que des unités appartenant réellement au groupe.
    const unitesValides = await pool.query<{ id: string }>(
      `SELECT id FROM scouticket_unites
        WHERE organization_id = $1 AND id = ANY($2::text[])`,
      [identifiantOrganisation, corps.data.uniteIds],
    );
    const idsValides = unitesValides.rows.map((ligne) => ligne.id);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM scouticket_acces_unite_membre
          WHERE user_id = $1 AND organization_id = $2`,
        [membre.userId, identifiantOrganisation],
      );
      for (const uniteId of idsValides) {
        await client.query(
          `INSERT INTO scouticket_acces_unite_membre (user_id, organization_id, unite_id)
           VALUES ($1, $2, $3)`,
          [membre.userId, identifiantOrganisation, uniteId],
        );
      }
      await client.query("COMMIT");
    } catch (erreur) {
      await client.query("ROLLBACK");
      throw erreur;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true, uniteIdsAutorisees: idsValides });
  });
}
