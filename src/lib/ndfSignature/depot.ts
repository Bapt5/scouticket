import type { DonneesEmailDepense } from "@/lib/email";
import { resoudreSignataires } from "@/lib/ndfSignature/circuit";
import { genererPdfNoteDeFrais } from "@/lib/sgdf/genererPagePdf";
import type { PieceJustificativePourPdf } from "@/lib/sgdf/remplirModele";
import {
  assemblerDocumentInitial,
  hasherDocument,
} from "@/lib/ndfSignature/document";
import {
  creerDepot,
  creerCodeVerification,
  type DonneesNdfPourEnvoi,
} from "@/lib/ndfSignature/repository";
import {
  DUREE_VALIDITE_CODE_MINUTES,
  genererCode,
  hasherCode,
} from "@/lib/ndfSignature/codesVerification";
import {
  envoyerEmailCodeVerification,
  envoyerEmailTourDeSigner,
} from "@/lib/emailSignatureNdf";
import { journal } from "@/lib/logger";
import { recupererLogoGroupeEnDataUri } from "@/lib/logoGroupe";

function versDateAffichee(dateIso: string): string {
  const [annee, mois, jour] = dateIso.split("-");
  return jour && mois && annee ? `${jour}/${mois}/${annee}` : dateIso;
}

export type ResultatDepot =
  { statut: "depose"; id: string } | { statut: "aucun_signataire_disponible" };

/**
 * Dépose une note de frais dans le circuit de signature : génère et hache le
 * PDF initial (page SGDF + justificatifs + 3 pages de signature vides), résout les signataires
 * responsable/trésorier (règle de conflit d'intérêt), persiste
 * l'enregistrement, puis invite le bénéficiaire à signer sa propre note
 * (1re étape du circuit) : le code de vérification n'est envoyé que lorsque
 * le bénéficiaire clique sur « Envoyer le code » depuis la page de
 * signature, pas automatiquement au dépôt.
 */
export async function deposerNoteDeFraisSignee(params: {
  identifiantOrganisation: string;
  beneficiaireUserId: string;
  beneficiaireNom: string;
  donneesEmail: DonneesEmailDepense;
}): Promise<ResultatDepot> {
  const signataires = await resoudreSignataires(
    params.identifiantOrganisation,
    params.beneficiaireUserId,
  );
  if (!signataires) return { statut: "aucun_signataire_disponible" };

  const pieces: PieceJustificativePourPdf[] =
    params.donneesEmail.detailsDepenses.map((detail, index) => ({
      numero: index + 1,
      date: versDateAffichee(detail.date),
      activite: detail.activite,
      description: detail.description,
      lignes: detail.lignes,
    }));

  const logoDataUri = await recupererLogoGroupeEnDataUri(
    params.identifiantOrganisation,
  );

  const pageNdf = await genererPdfNoteDeFrais({
    groupe: params.donneesEmail.groupe ?? "",
    demandeur: params.beneficiaireNom,
    unite: params.donneesEmail.branche,
    pieces,
    responsableNom: signataires.responsable.nom,
    tresorierNom: signataires.tresorier.nom,
    logoDataUri,
  });

  const documentInitial = await assemblerDocumentInitial(
    pageNdf,
    params.donneesEmail.piecesJointes,
    [
      { etape: "beneficiaire", nom: params.beneficiaireNom },
      { etape: "responsable", nom: signataires.responsable.nom },
      { etape: "tresorier", nom: signataires.tresorier.nom },
    ],
  );
  const documentHash = hasherDocument(documentInitial);

  const donneesNdf: DonneesNdfPourEnvoi = {
    emailUtilisateur: params.donneesEmail.emailUtilisateur,
    date: params.donneesEmail.date,
    branche: params.donneesEmail.branche,
    couleur: params.donneesEmail.couleur,
    groupe: params.donneesEmail.groupe ?? "",
    montant: params.donneesEmail.montant,
    detailsDepenses: params.donneesEmail.detailsDepenses,
    emailsTresoriers: params.donneesEmail.emailsTresoriers ?? [],
    rib: params.donneesEmail.rib,
  };

  const id = await creerDepot({
    organizationId: params.identifiantOrganisation,
    beneficiaireUserId: params.beneficiaireUserId,
    responsableSignataireUserId: signataires.responsable.userId,
    tresorierSignataireUserId: signataires.tresorier.userId,
    donneesNdf,
    documentHash,
    pdf: documentInitial,
  });

  await envoyerEmailTourDeSigner({
    destinataire: params.donneesEmail.emailUtilisateur,
    noteDeFraisId: id,
    etape: "beneficiaire",
    groupe: donneesNdf.groupe,
    demandeur: params.beneficiaireNom,
    montant: `${params.donneesEmail.montant.toFixed(2)} €`,
  });

  journal.info("ndf_signee.deposee", {
    categorie: "note-de-frais-signee",
    details: { noteDeFraisId: id },
  });

  return { statut: "depose", id };
}

/** Génère, persiste (hashé) et envoie un nouveau code de vérification. */
export async function envoyerCodeVerification(
  noteDeFraisId: string,
  etape: "beneficiaire" | "responsable" | "tresorier",
  userId: string,
  destinataireEmail: string,
) {
  const code = genererCode();
  await creerCodeVerification({
    noteDeFraisId,
    etape,
    userId,
    codeHash: hasherCode(code),
    expireLe: new Date(Date.now() + DUREE_VALIDITE_CODE_MINUTES * 60_000),
  });
  await envoyerEmailCodeVerification({
    destinataire: destinataireEmail,
    code,
    dureeValiditeMinutes: DUREE_VALIDITE_CODE_MINUTES,
  });
}
