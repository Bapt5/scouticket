import { NextResponse } from "next/server";
import { z } from "zod";
import { recupererSession } from "@/lib/sessionServeur";
import { traiterSignature } from "@/lib/ndfSignature/signer";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { jsonError } from "@/lib/api/utils";
import {
  reponseRateLimit,
  verifierOrigineRequete,
  verifierRateLimit,
} from "@/lib/api/securiteRequetes";

const schemaCorps = z
  .object({
    decision: z.enum(["signee", "refusee"]),
    code: z.string().regex(/^\d{6}$/),
    dateVirement: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    motifRefus: z.string().trim().max(500).optional(),
  })
  .strict();

function adresseIp(requete: Request): string | null {
  const entete = requete.headers.get("x-forwarded-for");
  return entete ? entete.split(",")[0].trim() : null;
}

const MESSAGES_ERREUR: Record<string, string> = {
  introuvable: "Note de frais introuvable",
  deja_traitee: "Cette note de frais a déjà été traitée",
  etape_incorrecte: "Ce n'est pas encore l'étape de cette note de frais",
  non_autorise: "Vous n'êtes pas le signataire attendu à cette étape",
  code_non_demande: "Demandez d'abord un code de vérification",
  code_expire: "Le code de vérification a expiré, demandez-en un nouveau",
  trop_de_tentatives: "Trop de tentatives avec ce code, demandez-en un nouveau",
  code_invalide: "Code de vérification incorrect",
  date_virement_requise: "Indiquez la date du virement",
};

/** Signe ou refuse une note de frais à l'étape courante, après vérification du code reçu par e-mail. */
export async function POST(
  requete: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return executerRouteAvecLogs(requete, async () => {
    const session = await recupererSession();
    if (!session) return jsonError("Non authentifié", 401);

    const erreurOrigine = verifierOrigineRequete(requete);
    if (erreurOrigine) return erreurOrigine;

    const limite = verifierRateLimit(
      `ndf-signature:${session.user.id}`,
      10,
      10 * 60 * 1000,
    );
    if (!limite.autorise) return reponseRateLimit(limite.attenteSecondes);

    const corps = schemaCorps.safeParse(await requete.json().catch(() => null));
    if (!corps.success) return jsonError("Requête invalide", 400);

    const { id } = await params;
    const resultat = await traiterSignature({
      noteDeFraisId: id,
      userId: session.user.id,
      decision: corps.data.decision,
      code: corps.data.code,
      adresseIp: adresseIp(requete),
      userAgent: requete.headers.get("user-agent"),
      dateVirement: corps.data.dateVirement,
      motifRefus: corps.data.motifRefus,
    });

    if (resultat.type !== "ok") {
      const status =
        resultat.type === "introuvable"
          ? 404
          : resultat.type === "deja_traitee"
            ? 410
            : resultat.type === "non_autorise"
              ? 403
              : 400;
      return jsonError(MESSAGES_ERREUR[resultat.type], status);
    }

    return NextResponse.json({ success: true, statut: resultat.nouveauStatut });
  });
}
