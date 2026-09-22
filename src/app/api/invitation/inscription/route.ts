import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pool } from "@/lib/baseDeDonnees";
import { recupererInvitationValide } from "@/lib/api/invitationLookup";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import {
  reponseRateLimit,
  verifierOrigineRequete,
  verifierRateLimit,
} from "@/lib/api/securiteRequetes";
import { journal } from "@/lib/logger";

const erreurInvitationInutilisable =
  "Cette invitation est invalide, expirée ou ne vous est pas destinée.";
const erreurCompteExistant =
  "Un compte existe déjà avec cette adresse. Connectez-vous plutôt avec ce compte pour rejoindre ce groupe.";

type CorpsInscriptionInvitation = {
  invitationId?: unknown;
  email?: unknown;
  password?: unknown;
};

export async function POST(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const erreurOrigine = verifierOrigineRequete(requete);
    if (erreurOrigine) return erreurOrigine;

    const corps = (await requete
      .json()
      .catch(() => null)) as CorpsInscriptionInvitation | null;
    if (
      !corps ||
      typeof corps.invitationId !== "string" ||
      !corps.invitationId ||
      typeof corps.email !== "string" ||
      !corps.email ||
      typeof corps.password !== "string" ||
      !corps.password
    )
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

    const { invitationId, email, password } = corps;

    const limiteCourte = verifierRateLimit(
      `invitation-inscription:${invitationId}:15-minutes`,
      5,
      15 * 60 * 1000,
    );
    if (!limiteCourte.autorise)
      return reponseRateLimit(limiteCourte.attenteSecondes);
    const limiteLongue = verifierRateLimit(
      `invitation-inscription:${invitationId}:24-heures`,
      10,
      24 * 60 * 60 * 1000,
    );
    if (!limiteLongue.autorise)
      return reponseRateLimit(limiteLongue.attenteSecondes);

    const invitation = await recupererInvitationValide(invitationId);
    if (!invitation)
      return NextResponse.json(
        { error: erreurInvitationInutilisable },
        { status: 404 },
      );

    if (invitation.email.toLowerCase() !== email.toLowerCase())
      return NextResponse.json(
        { error: erreurInvitationInutilisable },
        { status: 400 },
      );

    const utilisateurExistant = await pool.query(
      `SELECT 1 FROM "user" WHERE lower(email) = lower($1)`,
      [email],
    );
    if ((utilisateurExistant.rowCount ?? 0) > 0)
      return NextResponse.json(
        { error: erreurCompteExistant, code: "COMPTE_EXISTANT" },
        { status: 409 },
      );

    let identifiantUtilisateur: string;
    try {
      const resultatInscription = await auth.api.signUpEmail({
        headers: requete.headers,
        body: {
          name: email,
          email,
          password,
          callbackURL: `/invitation?id=${invitationId}`,
        },
      });
      identifiantUtilisateur = resultatInscription.user.id;
    } catch (erreur) {
      journal.avertissement("invitation.inscription_echouee", {
        categorie: "invitation",
        codeErreur: "INSCRIPTION_ECHOUEE",
        erreur,
      });
      return NextResponse.json(
        { error: erreurCompteExistant, code: "COMPTE_EXISTANT" },
        { status: 409 },
      );
    }

    await pool.query(
      `UPDATE "user" SET "emailVerified" = true, "updatedAt" = now() WHERE id = $1`,
      [identifiantUtilisateur],
    );

    await auth.api.signInEmail({
      headers: requete.headers,
      body: { email, password, rememberMe: true },
    });

    return NextResponse.json({ success: true });
  });
}
