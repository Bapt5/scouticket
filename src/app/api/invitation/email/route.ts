import { NextResponse } from "next/server";
import { recupererInvitationValide } from "@/lib/api/invitationLookup";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import {
  reponseRateLimit,
  verifierRateLimit,
} from "@/lib/api/securiteRequetes";

const erreurInvitationInutilisable = "Invitation invalide ou expirée.";

export async function GET(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const identifiantInvitation = new URL(requete.url).searchParams.get("id");
    if (!identifiantInvitation)
      return NextResponse.json(
        { error: erreurInvitationInutilisable },
        { status: 400 },
      );

    const limiteInvitation = verifierRateLimit(
      `invitation-email:${identifiantInvitation}`,
      20,
      15 * 60 * 1000,
    );
    if (!limiteInvitation.autorise)
      return reponseRateLimit(limiteInvitation.attenteSecondes);

    const invitation = await recupererInvitationValide(identifiantInvitation);
    if (!invitation)
      return NextResponse.json(
        { error: erreurInvitationInutilisable },
        { status: 404 },
      );

    return NextResponse.json({ email: invitation.email });
  });
}
