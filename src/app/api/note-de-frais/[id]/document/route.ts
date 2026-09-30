import { recupererSession } from "@/lib/sessionServeur";
import { verifierSignataireAttendu } from "@/lib/ndfSignature/signer";
import { recupererPdf } from "@/lib/ndfSignature/repository";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { jsonError } from "@/lib/api/utils";

/**
 * Sert le PDF immuable en streaming, uniquement au signataire attendu de
 * l'étape courante, tant que `pdf_document` n'a pas été purgé (circuit non
 * résolu). Jamais mis en cache par le navigateur ni le service worker.
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

    const pdf = await recupererPdf(id);
    if (!pdf) return jsonError("Document indisponible", 404);

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=note-de-frais.pdf",
        "Cache-Control": "no-store",
      },
    });
  });
}
