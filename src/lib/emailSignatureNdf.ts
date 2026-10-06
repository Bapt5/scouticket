import { echapperHtml, envoyerMail } from "@/lib/email";
import type { PieceJointeDepense } from "@/constants/piecesJointes";
import type { EtapeSignature } from "@/lib/ndfSignature/circuit";

function urlSignature(noteDeFraisId: string): URL {
  const urlApplication = process.env.APP_URL?.replace(/\/+$/, "");
  if (!urlApplication) throw new Error("APP_URL_UNDEFINED");
  return new URL(`/note-de-frais/${noteDeFraisId}/signature`, urlApplication);
}

const LIBELLES_ETAPE: Record<EtapeSignature, string> = {
  beneficiaire: "bénéficiaire",
  responsable: "approbateur",
  tresorier: "trésorier",
};

/** « le »/« l' » selon le mot qui suit (élision devant une voyelle) : « le bénéficiaire », « l'approbateur », « le trésorier ». */
function articleDefini(mot: string): string {
  return /^[aeiouhAEIOUH]/.test(mot) ? "l'" : "le ";
}

/** « que »/« qu' » selon le mot qui suit : « en tant que trésorier », « en tant qu'approbateur ». */
function queElide(mot: string): string {
  return /^[aeiouhAEIOUH]/.test(mot) ? "qu'" : "que ";
}

function enteteHtml(titre: string) {
  return `<div style="background-color: #1E3A8A; color: #ffffff; padding: 20px; text-align: center;"><h1 style="margin: 0; font-size: 24px;">Scoutréso</h1><p style="margin: 10px 0 0; opacity: 0.9;">${echapperHtml(titre)}</p></div>`;
}

/**
 * Notifie le signataire attendu que c'est son tour de signer une note de
 * frais. Pour le bénéficiaire lui-même (1re étape, juste après le dépôt),
 * le message l'invite à signer sa propre note plutôt que de parler de
 * quelqu'un d'autre.
 */
export async function envoyerEmailTourDeSigner(parametres: {
  destinataire: string;
  noteDeFraisId: string;
  etape: EtapeSignature;
  groupe: string;
  demandeur: string;
  montant: string;
  /** Joint uniquement à l'étape trésorier : il doit effectuer le virement avant de signer. */
  rib?: Pick<
    PieceJointeDepense,
    "typeMime" | "donneesBase64" | "nomFichierNormalise"
  >;
}) {
  const url = urlSignature(parametres.noteDeFraisId);
  const estBeneficiaire = parametres.etape === "beneficiaire";
  const estTresorier = parametres.etape === "tresorier";
  const verbe = parametres.etape === "tresorier" ? "traiter" : "signer";
  const sujet = estBeneficiaire
    ? `Signez votre note de frais : ${parametres.groupe}`
    : `Note de frais à ${verbe} : ${parametres.demandeur}`;
  const phraseIntro = estBeneficiaire
    ? `Le groupe <strong>${echapperHtml(parametres.groupe)}</strong> vous invite à signer votre note de frais (<strong>${echapperHtml(parametres.montant)}</strong>).`
    : `Une note de frais de <strong>${echapperHtml(parametres.demandeur)}</strong> (<strong>${echapperHtml(parametres.montant)}</strong>) attend votre ${verbe === "traiter" ? "traitement" : "signature"} en tant ${queElide(LIBELLES_ETAPE[parametres.etape])}<strong>${echapperHtml(LIBELLES_ETAPE[parametres.etape])}</strong>.`;
  const phraseIntroTexte = estBeneficiaire
    ? `Le groupe ${parametres.groupe} vous invite à signer votre note de frais (${parametres.montant}).`
    : `Une note de frais de ${parametres.demandeur} (${parametres.montant}) attend votre ${verbe === "traiter" ? "traitement" : "signature"} en tant ${queElide(LIBELLES_ETAPE[parametres.etape])}${LIBELLES_ETAPE[parametres.etape]}.`;

  const noteRib =
    estTresorier && parametres.rib
      ? `\n\nLe RIB du bénéficiaire est joint à cet e-mail : effectuez le virement avant de signer, la signature atteste que le virement a été fait.`
      : "";
  const noteRibHtml =
    estTresorier && parametres.rib
      ? `<p style="color: #374151; line-height: 1.5;">Le RIB du bénéficiaire est joint à cet e-mail : <strong>effectuez le virement avant de signer</strong>, la signature atteste que le virement a été fait.</p>`
      : "";

  await envoyerMail({
    to: parametres.destinataire,
    subject: sujet,
    text: `Bonjour,\n\n${phraseIntroTexte}${noteRib}\n\nConsultez-la et signez ici :\n${url}\n\nCe circuit de signature est nominatif : seul votre compte peut valider cette étape.`,
    html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      ${enteteHtml("Note de frais à signer")}
      <div style="padding: 30px; background-color: #f9f9f9;">
        <p style="color: #374151; line-height: 1.5;">Bonjour,</p>
        <p style="color: #374151; line-height: 1.5;">${phraseIntro}</p>
        ${noteRibHtml}
        <div style="text-align: center; margin: 24px 0;">
          <a href="${echapperHtml(url.toString())}" style="display: inline-block; background-color: #1E3A8A; color: #ffffff; padding: 12px 20px; border-radius: 6px; font-weight: bold; text-decoration: none;">Consulter et signer</a>
        </div>
        <p style="color: #6B7280; font-size: 14px; line-height: 1.5;">Ce circuit de signature est nominatif : seul votre compte peut valider cette étape.</p>
      </div>
    </div>`,
    ...(estTresorier && parametres.rib
      ? {
          attachments: [
            {
              filename: parametres.rib.nomFichierNormalise,
              content: Buffer.from(parametres.rib.donneesBase64, "base64"),
              contentType: parametres.rib.typeMime,
            },
          ],
        }
      : {}),
  });
}

/** Code de vérification à usage unique, envoyé au moment de l'acte de signature. */
export async function envoyerEmailCodeVerification(parametres: {
  destinataire: string;
  code: string;
  dureeValiditeMinutes: number;
}) {
  await envoyerMail({
    to: parametres.destinataire,
    subject: "Votre code de vérification Scoutréso",
    text: `Votre code de vérification pour signer cette note de frais : ${parametres.code}\n\nCe code est valable ${parametres.dureeValiditeMinutes} minutes et à usage unique. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`,
    html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      ${enteteHtml("Code de vérification")}
      <div style="padding: 30px; background-color: #f9f9f9; text-align: center;">
        <p style="color: #374151; line-height: 1.5;">Voici votre code de vérification pour confirmer votre signature :</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #1E3A8A; margin: 20px 0;">${echapperHtml(parametres.code)}</p>
        <p style="color: #6B7280; font-size: 14px;">Valable ${parametres.dureeValiditeMinutes} minutes, à usage unique.</p>
        <p style="color: #6B7280; font-size: 14px; margin-top: 24px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
      </div>
    </div>`,
  });
}

/** Notifie le bénéficiaire qu'une étape a refusé sa note de frais (circuit annulé). */
export async function envoyerEmailRefusNoteDeFrais(parametres: {
  destinataire: string;
  etape: EtapeSignature;
  motif: string | null;
}) {
  await envoyerMail({
    to: parametres.destinataire,
    subject: "Votre note de frais a été refusée",
    text: `Bonjour,\n\nVotre note de frais a été refusée par ${articleDefini(LIBELLES_ETAPE[parametres.etape])}${LIBELLES_ETAPE[parametres.etape]}${parametres.motif ? ` (motif : ${parametres.motif})` : ""}.\n\nLe circuit de signature est annulé. Vous pouvez soumettre une nouvelle note de frais corrigée depuis l'application.`,
    html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      ${enteteHtml("Note de frais refusée")}
      <div style="padding: 30px; background-color: #f9f9f9;">
        <p style="color: #374151; line-height: 1.5;">Bonjour,</p>
        <p style="color: #374151; line-height: 1.5;">Votre note de frais a été refusée par ${articleDefini(LIBELLES_ETAPE[parametres.etape])}<strong>${echapperHtml(LIBELLES_ETAPE[parametres.etape])}</strong>${parametres.motif ? ` avec le motif suivant : « ${echapperHtml(parametres.motif)} »` : ""}.</p>
        <p style="color: #374151; line-height: 1.5;">Le circuit de signature est annulé. Vous pouvez soumettre une nouvelle note de frais corrigée depuis l'application.</p>
      </div>
    </div>`,
  });
}
