import { jsonError } from "@/lib/api/utils";
import { estTypeMimePieceJointeAutorise } from "@/lib/attachments";
import {
  type PieceJointeDepense,
  type DetailDepense,
  type LigneDepense,
  TYPES_ENVOI,
} from "@/constants/piecesJointes";
import {
  MAX_ATTACHMENT_COUNT,
  MAX_LIGNES_PAR_JUSTIFICATIF,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_TOTAL_ATTACHMENTS_SIZE_BYTES,
} from "@/constants/piecesJointes";

import type { DonneesEmailDepense } from "@/lib/email";
import type { NextResponse } from "next/server";
import { z } from "zod";
import {
  LIBELLES_CATEGORIES_COMPTABLES,
  MOYENS_PAIEMENT_GROUPE,
} from "@/constants/configDepenses";
import { totalDetails } from "@/lib/depenses";
import { analyserDateIso } from "@/lib/nomenclature";
import { journal } from "@/lib/logger";

const expressionBase64Sure = /^[A-Za-z0-9+/=]+$/;

type ResultatPiece =
  { piece: PieceJointeDepense; taille: number } | { error: NextResponse };

// Valide une pièce jointe brute (justificatif ou RIB) ; `nom` sert aux messages.
function validerPieceJointe(brute: unknown, nom: string): ResultatPiece {
  if (!brute || typeof brute !== "object") {
    return { error: jsonError(`${nom} invalide`, 400) };
  }
  const pieceJointe = brute as Record<string, unknown>;
  const nomAffiche = String(pieceJointe.displayName ?? "").trim();
  const typeMime = String(pieceJointe.mimeType ?? "")
    .trim()
    .toLowerCase();
  const donneesBase64 = String(pieceJointe.base64Data ?? "")
    .trim()
    .replace(/\s+/g, "");
  const nomFichierOriginal = String(
    pieceJointe.originalFileName ?? pieceJointe.displayName ?? "",
  ).trim();

  if (!nomAffiche || !typeMime || !donneesBase64 || !nomFichierOriginal) {
    return { error: jsonError(`${nom} incomplet`, 400) };
  }
  if (!estTypeMimePieceJointeAutorise(typeMime)) {
    return { error: jsonError(`Type de fichier non supporté (${nom})`, 400) };
  }
  if (!expressionBase64Sure.test(donneesBase64)) {
    return { error: jsonError(`Fichier encodé invalide (${nom})`, 400) };
  }
  let taille: number;
  try {
    taille = Buffer.from(donneesBase64, "base64").length;
  } catch {
    return { error: jsonError(`Fichier corrompu (${nom})`, 400) };
  }
  if (taille <= 0) {
    return { error: jsonError(`Fichier vide (${nom})`, 400) };
  }
  if (taille > MAX_ATTACHMENT_SIZE_BYTES) {
    return { error: jsonError(`Fichier trop volumineux (${nom})`, 400) };
  }
  return {
    piece: {
      nomAffiche,
      typeMime,
      donneesBase64,
      nomFichierOriginal,
      nomFichierNormalise: nomFichierOriginal,
    },
    taille,
  };
}

export function validerCorpsRequete(body: unknown): {
  donneesEmail?: DonneesEmailDepense;
  error?: NextResponse;
} {
  const bodyParsed = z
    .object({
      userEmail: z.string().email(),
      unitId: z.string().min(1),
      envoiType: z.enum(TYPES_ENVOI),
      expenses: z.array(
        z.object({
          date: z.string(),
          paymentMethod: z.string().optional(),
          activity: z.string().optional(),
          description: z.string().optional(),
          lines: z
            .array(
              z.object({
                category: z.string(),
                amount: z.union([z.string(), z.number()]),
              }),
            )
            .min(1)
            .max(MAX_LIGNES_PAR_JUSTIFICATIF),
        }),
      ),
      attachments: z.array(z.any()).optional(),
      rib: z.any().optional(),
    })
    .safeParse(body);

  if (!bodyParsed.success) {
    journal.avertissement("depense.corps_invalide", {
      categorie: "depense",
      codeErreur: "CORPS_INVALIDE",
      details: {
        nombreErreursValidation: bodyParsed.error.issues.length,
      },
    });
    return { error: jsonError("Données manquantes ou incorrecte", 400) };
  }

  const b = bodyParsed.data;
  const estNoteDeFrais = b.envoiType === "note-de-frais";

  // ─── Pièces jointes ───
  const piecesJointesBrutes: unknown[] = b.attachments ?? [];

  if (piecesJointesBrutes.length === 0) {
    return { error: jsonError("Aucun justificatif fourni", 400) };
  }

  if (estNoteDeFrais && piecesJointesBrutes.length > MAX_ATTACHMENT_COUNT) {
    return {
      error: jsonError(
        `Trop de fichiers (maximum ${MAX_ATTACHMENT_COUNT})`,
        400,
      ),
    };
  }
  if (!estNoteDeFrais && piecesJointesBrutes.length > 1) {
    return {
      error: jsonError(
        "Une dépense avec moyen de paiement du groupe ne comporte qu'un seul justificatif",
        400,
      ),
    };
  }

  // ─── Validation de chaque pièce jointe ───
  let tailleTotale = 0;
  const piecesJointesNormalisees: PieceJointeDepense[] = [];
  const volumeAutorise = (taille: number) => {
    tailleTotale += taille;
    return tailleTotale <= MAX_TOTAL_ATTACHMENTS_SIZE_BYTES;
  };
  const erreurVolume = () =>
    jsonError("Volume total des pièces jointes trop élevé", 400);

  for (let i = 0; i < piecesJointesBrutes.length; i++) {
    const resultat = validerPieceJointe(
      piecesJointesBrutes[i],
      `Justificatif #${i + 1}`,
    );
    if ("error" in resultat) return { error: resultat.error };
    if (!volumeAutorise(resultat.taille)) return { error: erreurVolume() };
    piecesJointesNormalisees.push(resultat.piece);
  }

  // ─── RIB (note de frais uniquement, facultatif) ───
  let rib: PieceJointeDepense | undefined;
  if (b.rib !== undefined && b.rib !== null) {
    if (!estNoteDeFrais) {
      return {
        error: jsonError(
          "Le RIB n'est accepté que pour une note de frais",
          400,
        ),
      };
    }
    const resultat = validerPieceJointe(b.rib, "RIB");
    if ("error" in resultat) return { error: resultat.error };
    if (!volumeAutorise(resultat.taille)) return { error: erreurVolume() };
    rib = resultat.piece;
  }

  const estCategorieValide = (categorie: string) =>
    LIBELLES_CATEGORIES_COMPTABLES.includes(categorie);
  const estMoyenPaiementValide = (moyen: string) =>
    (MOYENS_PAIEMENT_GROUPE as readonly string[]).includes(moyen);

  // Un élément de `expenses` par justificatif, dans le même ordre.
  if (b.expenses.length !== piecesJointesNormalisees.length) {
    return { error: jsonError("Détails des dépenses incomplets", 400) };
  }

  const detailsDepenses: DetailDepense[] = [];
  for (let i = 0; i < b.expenses.length; i++) {
    const depense = b.expenses[i];
    if (!analyserDateIso(depense.date)) {
      return { error: jsonError(`Date invalide (#${i + 1})`, 400) };
    }
    const modePaiement = depense.paymentMethod ?? "";
    const activite = (depense.activity ?? "").trim();
    if (estNoteDeFrais) {
      if (modePaiement) {
        return {
          error: jsonError(
            `Moyen de paiement non autorisé pour une note de frais (#${i + 1})`,
            400,
          ),
        };
      }
      if (!activite) {
        return { error: jsonError(`Activité liée manquante (#${i + 1})`, 400) };
      }
    } else if (!estMoyenPaiementValide(modePaiement)) {
      return {
        error: jsonError(`Moyen de paiement invalide (#${i + 1})`, 400),
      };
    }
    const lignes: LigneDepense[] = [];
    for (const ligne of depense.lines) {
      const montantLigne = Number(ligne.amount);
      if (
        !estCategorieValide(ligne.category) ||
        !Number.isFinite(montantLigne) ||
        montantLigne <= 0
      ) {
        return { error: jsonError(`Dépense invalide (#${i + 1})`, 400) };
      }
      lignes.push({ categorie: ligne.category, montant: montantLigne });
    }
    detailsDepenses.push({
      date: depense.date,
      modePaiement,
      activite: estNoteDeFrais ? activite : "",
      description: (depense.description ?? "").trim(),
      lignes,
    });
  }

  // Date de référence (objet du mail, nomenclature) : la plus ancienne.
  const dateReference = detailsDepenses
    .map((detail) => detail.date)
    .reduce((plusAncienne, date) =>
      date < plusAncienne ? date : plusAncienne,
    );

  return {
    donneesEmail: {
      typeEnvoi: b.envoiType,
      emailUtilisateur: b.userEmail,
      date: dateReference,
      branche: b.unitId,
      montant: totalDetails(detailsDepenses),
      piecesJointes: piecesJointesNormalisees,
      detailsDepenses,
      rib,
    },
  };
}
