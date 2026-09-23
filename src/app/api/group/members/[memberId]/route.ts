import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { estResponsable, recupererRoleMembre } from "@/lib/groupServer";
import { recupererContexteGroupe } from "@/lib/sessionServeur";
import { pool } from "@/lib/baseDeDonnees";
import { verifierOrigineRequete } from "@/lib/api/securiteRequetes";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";

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

/** Retire un membre du groupe (interdit pour un responsable/owner). */
export async function DELETE(
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
    if (membre.role === "owner")
      return NextResponse.json(
        { error: "Impossible de retirer un responsable du groupe" },
        { status: 403 },
      );

    await auth.api.removeMember({
      headers: requete.headers,
      body: {
        // Better Auth n'accepte pas l'userId ici : `memberIdOrEmail` désigne
        // soit un email, soit l'id de la ligne `member` (celui de la route).
        memberIdOrEmail: memberId,
        organizationId: identifiantOrganisation,
      },
    });
    await pool.query(
      `DELETE FROM scouticket_acces_unite_membre
        WHERE user_id = $1 AND organization_id = $2`,
      [membre.userId, identifiantOrganisation],
    );

    return NextResponse.json({ success: true });
  });
}
