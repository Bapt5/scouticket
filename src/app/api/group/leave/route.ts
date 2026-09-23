import { NextResponse } from "next/server";
import { APIError } from "better-auth/api";
import { auth } from "@/lib/auth";
import { recupererSession } from "@/lib/sessionServeur";
import { pool } from "@/lib/baseDeDonnees";
import { verifierOrigineRequete } from "@/lib/api/securiteRequetes";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";

/** Permet à un membre de quitter un groupe (interdit s'il en est l'unique responsable). */
export async function POST(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const session = await recupererSession();
    if (!session)
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const erreurOrigine = verifierOrigineRequete(requete);
    if (erreurOrigine) return erreurOrigine;

    const corps = (await requete.json().catch(() => null)) as {
      organizationId?: unknown;
    } | null;
    const organizationId =
      typeof corps?.organizationId === "string" ? corps.organizationId : "";
    if (!organizationId)
      return NextResponse.json(
        { error: "Identifiant de groupe manquant" },
        { status: 400 },
      );

    const membre = await pool.query<{ userId: string }>(
      `SELECT "userId" FROM member WHERE "userId" = $1 AND "organizationId" = $2`,
      [session.user.id, organizationId],
    );
    if (membre.rows.length === 0)
      return NextResponse.json(
        { error: "Vous n'êtes pas membre de ce groupe" },
        { status: 404 },
      );

    try {
      await auth.api.leaveOrganization({
        headers: requete.headers,
        body: { organizationId },
      });
    } catch (erreur) {
      if (
        erreur instanceof APIError &&
        erreur.body?.code ===
          "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER"
      )
        return NextResponse.json(
          {
            error:
              "Impossible de quitter le groupe : vous êtes le seul responsable. Nommez un autre responsable avant de partir.",
          },
          { status: 403 },
        );
      throw erreur;
    }

    await pool.query(
      `DELETE FROM scouticket_acces_unite_membre
        WHERE user_id = $1 AND organization_id = $2`,
      [session.user.id, organizationId],
    );

    return NextResponse.json({ success: true });
  });
}
