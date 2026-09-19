import { NextResponse } from "next/server";
import { pool } from "@/lib/baseDeDonnees";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { journal } from "@/lib/logger";
import { recupererSession } from "@/lib/sessionServeur";

const erreurInvitationInutilisable =
  "Cette invitation est invalide, expirée ou ne vous est pas destinée.";

export async function GET(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const identifiantInvitation = new URL(requete.url).searchParams.get("id");
    if (!identifiantInvitation)
      return NextResponse.json(
        { error: "Invitation invalide" },
        { status: 400 },
      );

    const session = await recupererSession();
    if (!session)
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const resultat = await pool.query<{
      name: string;
      email: string;
      status: string;
      expiresAt: Date;
      estMembre: boolean;
    }>(
      `SELECT organization.name, invitation.email, invitation.status,
              invitation."expiresAt",
              EXISTS (
                SELECT 1
                  FROM member
                 WHERE member."organizationId" = invitation."organizationId"
                   AND member."userId" = $2
              ) AS "estMembre"
        FROM invitation
        JOIN organization ON organization.id = invitation."organizationId"
        WHERE invitation.id = $1`,
      [identifiantInvitation, session.user.id],
    );
    const invitation = resultat.rows[0];
    if (!invitation) {
      journal.avertissement("invitation.consultation_rejetee", {
        categorie: "invitation",
        identifiantUtilisateur: session.user.id,
        codeErreur: "INVITATION_INTROUVABLE",
      });
      return NextResponse.json(
        { error: erreurInvitationInutilisable },
        { status: 404 },
      );
    }

    // la table invitation stocke l'id des utilisateurs via un email, pas un id.
    if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
      journal.avertissement("invitation.consultation_rejetee", {
        categorie: "invitation",
        identifiantUtilisateur: session.user.id,
        codeErreur: "INVITATION_DESTINATAIRE_INCORRECT",
      });
      return NextResponse.json(
        { error: erreurInvitationInutilisable },
        { status: 404 },
      );
    }

    if (invitation.status === "pending" && invitation.expiresAt > new Date())
      return NextResponse.json({
        nomGroupe: invitation.name,
        statut: "en_attente",
      });

    if (invitation.status === "accepted" && invitation.estMembre)
      return NextResponse.json({
        nomGroupe: invitation.name,
        statut: "deja_acceptee",
      });

    journal.avertissement("invitation.consultation_rejetee", {
      categorie: "invitation",
      identifiantUtilisateur: session.user.id,
      codeErreur:
        invitation.status === "pending"
          ? "INVITATION_EXPIREE"
          : "INVITATION_STATUT_NON_ACTIONNABLE",
    });
    return NextResponse.json(
      { error: erreurInvitationInutilisable },
      { status: 404 },
    );
  });
}
