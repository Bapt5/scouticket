import { NextResponse } from "next/server";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import {
  compterTresoriersNotifies,
  estResponsable,
  prochainOrdreSignataire,
  recupererRoleMembre,
} from "@/lib/groupServer";
import { recupererContexteGroupe } from "@/lib/sessionServeur";
import { pool } from "@/lib/baseDeDonnees";
import { verifierOrigineRequete } from "@/lib/api/securiteRequetes";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";

const schemaCorps = z.object({ role: z.enum(["member", "admin", "owner"]) });

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

/** Modifie le rôle d'un membre (interdit sur soi-même). */
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
    if (membre.userId === identifiantUtilisateur)
      return NextResponse.json(
        { error: "Vous ne pouvez pas modifier votre propre rôle" },
        { status: 403 },
      );

    const corps = schemaCorps.safeParse(await requete.json().catch(() => null));
    if (!corps.success)
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

    const retrogradeTresorier =
      membre.role === "owner" && corps.data.role !== "owner";
    if (retrogradeTresorier) {
      const autresTresoriersNotifies = await compterTresoriersNotifies(
        identifiantOrganisation,
        membre.userId,
      );
      if (autresTresoriersNotifies === 0)
        return NextResponse.json(
          {
            error:
              "Impossible de retirer ce rôle : il doit rester au moins un trésorier qui reçoit les mails.",
          },
          { status: 400 },
        );
    }

    try {
      await auth.api.updateMemberRole({
        headers: requete.headers,
        body: {
          memberId,
          role: corps.data.role,
          organizationId: identifiantOrganisation,
        },
      });
    } catch (erreur) {
      if (
        erreur instanceof APIError &&
        erreur.body?.code === "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER"
      )
        return NextResponse.json(
          {
            error:
              "Seul un responsable peut modifier le rôle d’un autre responsable ou promouvoir un membre au rang de responsable.",
          },
          { status: 403 },
        );
      throw erreur;
    }

    if (retrogradeTresorier)
      await pool.query(
        `DELETE FROM scouticket_notification_tresorerie
          WHERE user_id = $1 AND organization_id = $2`,
        [membre.userId, identifiantOrganisation],
      );
    else if (membre.role !== "owner" && corps.data.role === "owner")
      await pool.query(
        `INSERT INTO scouticket_notification_tresorerie (user_id, organization_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [membre.userId, identifiantOrganisation],
      );

    // Synchronise le circuit de signature des notes de frais : sortie
    // définitive si le membre n'est plus responsable ni trésorier, ajout en
    // fin de liste s'il le devient (nouvelle entrée ou changement de
    // catégorie admin <-> owner, pour éviter un rang dupliqué avec un
    // signataire déjà présent dans la nouvelle catégorie).
    if (estResponsable(membre.role) && !estResponsable(corps.data.role))
      await pool.query(
        `DELETE FROM scouticket_signataires
          WHERE user_id = $1 AND organization_id = $2`,
        [membre.userId, identifiantOrganisation],
      );
    else if (estResponsable(corps.data.role) && membre.role !== corps.data.role) {
      const ordre = await prochainOrdreSignataire(
        pool,
        identifiantOrganisation,
        corps.data.role as "admin" | "owner",
      );
      await pool.query(
        `INSERT INTO scouticket_signataires (organization_id, user_id, ordre)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, user_id) DO UPDATE SET ordre = EXCLUDED.ordre`,
        [identifiantOrganisation, membre.userId, ordre],
      );
    }

    return NextResponse.json({ success: true, role: corps.data.role });
  });
}
