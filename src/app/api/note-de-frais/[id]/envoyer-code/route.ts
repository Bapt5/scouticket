import { NextResponse } from "next/server";
import { recupererSession } from "@/lib/sessionServeur";
import { demanderCodeVerification } from "@/lib/ndfSignature/signer";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { jsonError } from "@/lib/api/utils";
import {
  reponseRateLimit,
  verifierOrigineRequete,
  verifierRateLimit,
} from "@/lib/api/securiteRequetes";

/** Envoie un nouveau code de vérification au signataire attendu de l'étape courante. */
export async function POST(
  requete: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return executerRouteAvecLogs(requete, async () => {
    const session = await recupererSession();
    if (!session) return jsonError("Non authentifié", 401);

    const erreurOrigine = verifierOrigineRequete(requete);
    if (erreurOrigine) return erreurOrigine;

    // Max 3 envois de code par minute et par utilisateur.
    const limite = verifierRateLimit(
      `ndf-signature-code:${session.user.id}`,
      3,
      60 * 1000,
    );
    if (!limite.autorise) return reponseRateLimit(limite.attenteSecondes);

    const { id } = await params;
    const resultat = await demanderCodeVerification(id, session.user.id);
    if (resultat.type === "introuvable")
      return jsonError("Note de frais introuvable", 404);
    if (resultat.type === "deja_traitee")
      return jsonError("Cette note de frais a déjà été traitée", 410);
    if (resultat.type === "non_autorise")
      return jsonError(
        "Vous n'êtes pas le signataire attendu à cette étape",
        403,
      );

    return NextResponse.json({ success: true });
  });
}
