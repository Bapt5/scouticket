import { recupererSession } from "@/lib/sessionServeur";
import { verifierSignataireAttendu } from "@/lib/ndfSignature/signer";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { jsonError } from "@/lib/api/utils";

/**
 * Sert le RIB joint à la note de frais, pour que le trésorier puisse
 * effectuer le virement avant de signer (le RIB n'est sinon envoyé qu'avec
 * l'e-mail final, trop tard pour ça). Réservé au signataire attendu de
 * l'étape courante.
 */
export async function GET(
  requete: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return executerRouteAvecLogs(requete, async () => {
    const session = await recupererSession();
    if (!session) return jsonError("Non authentifié", 401);

    const { id } = await params;
    const verification = await verifierSignataireAttendu(id, session.user.id);
    if (!verification.ok) {
      if (verification.erreur === "introuvable")
        return jsonError("Note de frais introuvable", 404);
      if (verification.erreur === "deja_traitee")
        return jsonError("Cette note de frais a déjà été traitée", 410);
      return jsonError(
        "Vous n'êtes pas le signataire attendu à cette étape",
        403,
      );
    }

    const rib = verification.note.donneesNdf.rib;
    if (!rib) return jsonError("Aucun RIB n'a été joint", 404);

    return new Response(
      new Uint8Array(Buffer.from(rib.donneesBase64, "base64")),
      {
        headers: {
          "Content-Type": rib.typeMime,
          "Content-Disposition": `inline; filename="${rib.nomFichierNormalise}"`,
          "Cache-Control": "no-store",
        },
      },
    );
  });
}
