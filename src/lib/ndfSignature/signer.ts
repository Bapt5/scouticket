import {
  cloturerCircuit,
  enregistrerPdfSigne,
  incrementerTentativeCode,
  marquerCodeUtilise,
  recupererDernierCode,
  recupererNoteDeFrais,
  recupererPdf,
  recupererUtilisateur,
  type NoteDeFraisSignee,
  type StatutNoteDeFraisSignee,
} from "@/lib/ndfSignature/repository";
import type { EtapeSignature } from "@/lib/ndfSignature/circuit";
import {
  codeCorrespond,
  NOMBRE_MAX_TENTATIVES_CODE,
} from "@/lib/ndfSignature/codesVerification";
import {
  envoyerEmailRefusNoteDeFrais,
  envoyerEmailTourDeSigner,
} from "@/lib/emailSignatureNdf";
import { envoyerCodeVerification } from "@/lib/ndfSignature/depot";
import { construireDossierPreuve } from "@/lib/ndfSignature/dossierPreuve";
import { signerChamp } from "@/lib/ndfSignature/pdfSignature";
import { CATEGORIE_COMPTABLE_KILOMETRES } from "@/lib/depenses";
import { envoyerEmailDepense, type DonneesEmailDepense } from "@/lib/email";
import { envoyerAvecNomenclature } from "@/lib/envoiNomenclature";
import { dedoublonnerNomsFichiers } from "@/lib/nomenclature";
import { assainirSegmentNomFichier } from "@/lib/attachments";
import { recupererGroupeActif } from "@/lib/groupServer";
import {
  LIBELLES_TYPES_ENVOI,
  type DetailDepense,
  type PieceJointeDepense,
} from "@/constants/piecesJointes";
import { journal } from "@/lib/logger";

/** Moyen de paiement affiché pour la note de frais signée envoyée finale (le remboursement a été fait par virement du groupe). */
const MODE_PAIEMENT_NOTE_DE_FRAIS_SIGNEE = "Virement du groupe";

const ETAPE_PAR_STATUT: Partial<
  Record<StatutNoteDeFraisSignee, EtapeSignature>
> = {
  en_attente_beneficiaire: "beneficiaire",
  en_attente_responsable: "responsable",
  en_attente_tresorier: "tresorier",
};

function utilisateurAttendu(note: NoteDeFraisSignee, etape: EtapeSignature) {
  if (etape === "beneficiaire") return note.beneficiaireUserId;
  if (etape === "responsable") return note.responsableSignataireUserId;
  return note.tresorierSignataireUserId;
}

export type ResultatSignature =
  | {
      type: "ok";
      nouveauStatut: StatutNoteDeFraisSignee | "validee" | "refusee";
    }
  | { type: "introuvable" }
  | { type: "deja_traitee" }
  | { type: "etape_incorrecte" }
  | { type: "non_autorise" }
  | { type: "code_non_demande" }
  | { type: "code_expire" }
  | { type: "trop_de_tentatives" }
  | { type: "code_invalide" }
  | { type: "date_virement_requise" };

/** Vérifie que l'utilisateur courant est bien le signataire attendu à l'étape courante. Renvoie l'étape/la note si oui. */
export async function verifierSignataireAttendu(
  noteDeFraisId: string,
  userId: string,
): Promise<
  | { ok: true; note: NoteDeFraisSignee; etape: EtapeSignature }
  | { ok: false; erreur: "introuvable" | "deja_traitee" | "non_autorise" }
> {
  const note = await recupererNoteDeFrais(noteDeFraisId);
  if (!note) return { ok: false, erreur: "introuvable" };
  const etape = ETAPE_PAR_STATUT[note.statut];
  if (!etape) return { ok: false, erreur: "deja_traitee" };
  if (utilisateurAttendu(note, etape) !== userId)
    return { ok: false, erreur: "non_autorise" };
  return { ok: true, note, etape };
}

export async function demanderCodeVerification(
  noteDeFraisId: string,
  userId: string,
): Promise<
  { type: "ok" } | { type: "introuvable" | "deja_traitee" | "non_autorise" }
> {
  const verification = await verifierSignataireAttendu(noteDeFraisId, userId);
  if (!verification.ok) return { type: verification.erreur };
  const utilisateur = await recupererUtilisateur(userId);
  if (!utilisateur) return { type: "non_autorise" };
  await envoyerCodeVerification(
    noteDeFraisId,
    verification.etape,
    userId,
    utilisateur.email,
  );
  return { type: "ok" };
}

export async function traiterSignature(params: {
  noteDeFraisId: string;
  userId: string;
  decision: "signee" | "refusee";
  code: string;
  adresseIp: string | null;
  userAgent: string | null;
  dateVirement?: string;
  motifRefus?: string;
}): Promise<ResultatSignature> {
  const verification = await verifierSignataireAttendu(
    params.noteDeFraisId,
    params.userId,
  );
  if (!verification.ok) {
    if (verification.erreur === "introuvable") return { type: "introuvable" };
    if (verification.erreur === "deja_traitee") return { type: "deja_traitee" };
    return { type: "non_autorise" };
  }
  const { note, etape } = verification;

  if (
    etape === "tresorier" &&
    params.decision === "signee" &&
    !params.dateVirement
  ) {
    return { type: "date_virement_requise" };
  }

  const dernierCode = await recupererDernierCode(
    params.noteDeFraisId,
    etape,
    params.userId,
  );
  if (!dernierCode || dernierCode.utilise) return { type: "code_non_demande" };
  if (dernierCode.expireLe.getTime() < Date.now())
    return { type: "code_expire" };
  if (dernierCode.tentatives >= NOMBRE_MAX_TENTATIVES_CODE)
    return { type: "trop_de_tentatives" };
  if (!codeCorrespond(params.code, dernierCode.codeHash)) {
    await incrementerTentativeCode(dernierCode.id);
    return { type: "code_invalide" };
  }
  const codeVerifieLe = new Date();

  if (params.decision === "refusee") {
    if (!(await marquerCodeUtilise(dernierCode.id)))
      return { type: "code_non_demande" };
    await cloturerCircuit(params.noteDeFraisId);
    journal.info("ndf_signee.cloturee", {
      categorie: "note-de-frais-signee",
      details: { noteDeFraisId: params.noteDeFraisId, issue: "refusee", etape },
    });
    const beneficiaire = await recupererUtilisateur(note.beneficiaireUserId);
    if (beneficiaire)
      await envoyerEmailRefusNoteDeFrais({
        destinataire: beneficiaire.email,
        etape,
        motif: params.motifRefus ?? null,
      }).catch((erreur) =>
        journal.erreur("ndf_signee.email_refus_echoue", {
          categorie: "note-de-frais-signee",
          erreur,
        }),
      );
    return { type: "ok", nouveauStatut: "refusee" };
  }

  // On remplit et signe le champ de l'étape dans le PDF stocké (ajout
  // incrémental, voir pdfSignature.ts) AVANT de consommer le code : un échec
  // de signature (certificat absent, PDF invalide) ne brûle donc pas le code.
  const pdfCourant = await recupererPdf(params.noteDeFraisId);
  if (!pdfCourant) return { type: "introuvable" };
  const signataire = await recupererUtilisateur(params.userId);
  const pdfSigne = await signerChamp(pdfCourant, {
    etape,
    nom: signataire?.nom ?? params.userId,
    lignesDossier: construireDossierPreuve({
      noteDeFraisId: params.noteDeFraisId,
      etape,
      userId: params.userId,
      nom: signataire?.nom ?? params.userId,
      email: signataire?.email ?? "",
      adresseIp: params.adresseIp,
      userAgent: params.userAgent,
      codeEnvoyeLe: dernierCode.creeLe,
      codeVerifieLe,
      nombreSaisiesCode: dernierCode.tentatives + 1,
      documentHash: note.documentHash,
      dateVirement: etape === "tresorier" ? params.dateVirement : null,
    }),
    date: codeVerifieLe,
  });
  if (!(await marquerCodeUtilise(dernierCode.id)))
    return { type: "code_non_demande" };

  if (etape === "beneficiaire") {
    if (
      !(await enregistrerPdfSigne(
        params.noteDeFraisId,
        pdfSigne,
        "en_attente_beneficiaire",
        "en_attente_responsable",
      ))
    )
      return { type: "deja_traitee" };
    const responsable = await recupererUtilisateur(
      note.responsableSignataireUserId,
    );
    if (responsable)
      await envoyerEmailTourDeSigner({
        destinataire: responsable.email,
        noteDeFraisId: params.noteDeFraisId,
        etape: "responsable",
        groupe: note.donneesNdf.groupe,
        demandeur: note.donneesNdf.emailUtilisateur,
        montant: `${note.donneesNdf.montant.toFixed(2)} €`,
      });
    return { type: "ok", nouveauStatut: "en_attente_responsable" };
  }

  if (etape === "responsable") {
    if (
      !(await enregistrerPdfSigne(
        params.noteDeFraisId,
        pdfSigne,
        "en_attente_responsable",
        "en_attente_tresorier",
      ))
    )
      return { type: "deja_traitee" };
    const tresorier = await recupererUtilisateur(
      note.tresorierSignataireUserId,
    );
    if (tresorier)
      await envoyerEmailTourDeSigner({
        destinataire: tresorier.email,
        noteDeFraisId: params.noteDeFraisId,
        etape: "tresorier",
        groupe: note.donneesNdf.groupe,
        demandeur: note.donneesNdf.emailUtilisateur,
        montant: `${note.donneesNdf.montant.toFixed(2)} €`,
        rib: note.donneesNdf.rib,
      });
    return { type: "ok", nouveauStatut: "en_attente_tresorier" };
  }

  // Étape trésorier, décision "signee" : validation finale. Le PDF qui vient
  // d'être signé porte les 3 signatures et leurs dossiers de preuve : il est
  // envoyé tel quel (toute réécriture invaliderait les signatures).
  const documentFinal = pdfSigne;

  // Une fois les 3 signatures obtenues et le virement fait, le remboursement
  // est traité comme une dépense avec moyen de paiement du groupe (l'argent
  // du groupe est sorti) : même nomenclature, mêmes informations dans
  // l'e-mail qu'une dépense de groupe classique, un seul justificatif (le
  // PDF final signé, qui contient déjà la note de frais, les justificatifs
  // et les 3 signatures). Le RIB ne sert plus ici : il a déjà été transmis au
  // trésorier au moment de sa signature (voir emailSignatureNdf.ts).
  const dateEnvoi = params.dateVirement ?? note.donneesNdf.date;
  const nomFichierBase = `Note de frais signee - ${note.donneesNdf.branche}`;
  const detailFinal: DetailDepense = {
    date: dateEnvoi,
    modePaiement: MODE_PAIEMENT_NOTE_DE_FRAIS_SIGNEE,
    activite: "",
    description: `Remboursement note de frais signée de ${note.donneesNdf.emailUtilisateur}`,
    lignes: [
      ...note.donneesNdf.detailsDepenses.flatMap((detail) => detail.lignes),
      ...(note.donneesNdf.kilometrage
        ? [
            {
              categorie: CATEGORIE_COMPTABLE_KILOMETRES,
              montant: note.donneesNdf.kilometrage.montant,
            },
          ]
        : []),
    ],
  };
  const pieceFinale: PieceJointeDepense = {
    nomAffiche: nomFichierBase,
    typeMime: "application/pdf",
    donneesBase64: documentFinal.toString("base64"),
    nomFichierOriginal: `${nomFichierBase}.pdf`,
    nomFichierNormalise: `${nomFichierBase}.pdf`,
  };
  const donneesEmailFinal: DonneesEmailDepense = {
    typeEnvoi: "depense-groupe",
    libelleTypeAffiche: LIBELLES_TYPES_ENVOI["note-de-frais"],
    emailUtilisateur: note.donneesNdf.emailUtilisateur,
    date: dateEnvoi,
    branche: note.donneesNdf.branche,
    montant: note.donneesNdf.montant,
    piecesJointes: [pieceFinale],
    detailsDepenses: [detailFinal],
    groupe: note.donneesNdf.groupe,
    couleur: note.donneesNdf.couleur,
    emailsTresoriers: note.donneesNdf.emailsTresoriers,
  };

  const groupe = await recupererGroupeActif(note.organizationId);
  const { format } = groupe.nomenclature.depense;
  if (format) {
    await envoyerAvecNomenclature(
      donneesEmailFinal,
      note.organizationId,
      format,
      groupe.nomenclature.anneeComptable,
    );
  } else {
    const [nomNormalise] = dedoublonnerNomsFichiers([
      assainirSegmentNomFichier(pieceFinale.nomFichierOriginal),
    ]);
    donneesEmailFinal.piecesJointes = [
      { ...pieceFinale, nomFichierNormalise: nomNormalise },
    ];
    await envoyerEmailDepense(donneesEmailFinal);
  }

  await cloturerCircuit(params.noteDeFraisId);
  journal.info("ndf_signee.cloturee", {
    categorie: "note-de-frais-signee",
    details: { noteDeFraisId: params.noteDeFraisId, issue: "validee" },
  });

  return { type: "ok", nouveauStatut: "validee" };
}
