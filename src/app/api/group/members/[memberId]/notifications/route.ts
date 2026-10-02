import { NextResponse } from "next/server";
import { z } from "zod";
import {
  compterTresoriersNotifies,
  estResponsable,
  recupererRoleMembre,
} from "@/lib/groupServer";
import { recupererContexteGroupe } from "@/lib/sessionServeur";
import { pool } from "@/lib/baseDeDonnees";
import { verifierOrigineRequete } from "@/lib/api/securiteRequetes";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";

const schemaCorps = z.object({ recoit: z.boolean() }).strict();

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

/** Active ou désactive la réception des e-mails de notes de frais pour ce trésorier. */
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
    if (membre.role !== "owner")
      return NextResponse.json(
        { error: "Seul un trésorier peut recevoir ces e-mails" },
        { status: 400 },
      );

    const corps = schemaCorps.safeParse(await requete.json().catch(() => null));
    if (!corps.success)
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

    if (!corps.data.recoit) {
      const autresTresoriersNotifies = await compterTresoriersNotifies(
        identifiantOrganisation,
        membre.userId,
      );
      if (autresTresoriersNotifies === 0)
        return NextResponse.json(
          { error: "Au moins un trésorier doit recevoir les mails." },
          { status: 400 },
        );
      await pool.query(
        `DELETE FROM scouticket_notification_tresorerie
          WHERE user_id = $1 AND organization_id = $2`,
        [membre.userId, identifiantOrganisation],
      );
    } else {
      await pool.query(
        `INSERT INTO scouticket_notification_tresorerie (user_id, organization_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [membre.userId, identifiantOrganisation],
      );
    }

    return NextResponse.json({ success: true, recoit: corps.data.recoit });
  });
}
