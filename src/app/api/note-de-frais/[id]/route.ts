import { NextResponse } from "next/server";
import { recupererSession } from "@/lib/sessionServeur";
import { verifierSignataireAttendu } from "@/lib/ndfSignature/signer";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { jsonError } from "@/lib/api/utils";

/** Résumé pour l'écran de signature : jamais le PDF ni les octets bruts. */
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

    const { note, etape } = verification;
    return NextResponse.json({
      etape,
      // Le signataire attendu de l'étape courante EST l'utilisateur connecté
      // (vérifié ci-dessus) : son nom vient donc directement de sa session.
      signataireNom: session.user.name?.trim() || session.user.email,
      demandeur: note.donneesNdf.emailUtilisateur,
      branche: note.donneesNdf.branche,
      montant: note.donneesNdf.montant,
      date: note.donneesNdf.date,
      ribDisponible: Boolean(note.donneesNdf.rib),
    });
  });
}
