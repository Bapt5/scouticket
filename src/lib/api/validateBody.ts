import { jsonError } from "@/lib/api/utils";
import { estTypeMimePieceJointeAutorise } from "@/lib/attachments";
import {
  type PieceJointeDepense,
  type DetailDepense,
  type LigneDepense,
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
  MODES_PAIEMENT,
} from "@/constants/configDepenses";
import { totalDetails } from "@/lib/depenses";
import { journal } from "@/lib/logger";

export function validerCorpsRequete(body: unknown): {
  donneesEmail?: DonneesEmailDepense;
  error?: NextResponse;
} {
  const bodyParsed = z
    .object({
      userEmail: z.string().email(),
      date: z.string(),
      unitId: z.string().min(1),
      description: z.string().optional(),
      expenses: z.array(
        z.object({
          paymentMethod: z.string(),
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
      imageBase64: z.string().optional(),
      fileName: z.string().optional(),
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

  // ─── Pièces jointes ───
  let piecesJointesBrutes: unknown[] = b.attachments ?? [];

  // ─── Si il y a des images dans attachements ───
  if (piecesJointesBrutes.length === 0 && b.imageBase64 && b.fileName) {
    piecesJointesBrutes = [
      {
        displayName: b.fileName,
        mimeType: "image/jpeg",
        base64Data: b.imageBase64.includes(",")
          ? b.imageBase64.slice(b.imageBase64.indexOf(",") + 1)
          : b.imageBase64,
        originalFileName: b.fileName,
      },
    ];
  }

  if (piecesJointesBrutes.length === 0) {
    return { error: jsonError("Aucun justificatif fourni", 400) };
  }

  if (piecesJointesBrutes.length > MAX_ATTACHMENT_COUNT) {
    return {
      error: jsonError(
        `Trop de fichiers (maximum ${MAX_ATTACHMENT_COUNT})`,
        400,
      ),
    };
  }

  // ─── Validation de chaque pièce jointe ───
  let tailleTotale = 0;
  const expressionBase64Sure = /^[A-Za-z0-9+/=]+$/;
  const piecesJointesNormalisees: PieceJointeDepense[] = [];

  for (let i = 0; i < piecesJointesBrutes.length; i++) {
    const pieceJointeBrute = piecesJointesBrutes[i];
    const numeroPieceJointe = i + 1;

    if (!pieceJointeBrute || typeof pieceJointeBrute !== "object") {
      return {
        error: jsonError(`Justificatif invalide (#${numeroPieceJointe})`, 400),
      };
    }

    const pieceJointe = pieceJointeBrute as Record<string, unknown>;

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
      return {
        error: jsonError(`Justificatif incomplet (#${numeroPieceJointe})`, 400),
      };
    }

    if (!estTypeMimePieceJointeAutorise(typeMime)) {
      return {
        error: jsonError(
          `Type de fichier non supporté (#${numeroPieceJointe})`,
          400,
        ),
      };
    }

    if (!expressionBase64Sure.test(donneesBase64)) {
      return {
        error: jsonError(
          `Fichier encodé invalide (#${numeroPieceJointe})`,
          400,
        ),
      };
    }

    let size: number;
    try {
      size = Buffer.from(donneesBase64, "base64").length;
    } catch {
      return {
        error: jsonError(`Fichier corrompu (#${numeroPieceJointe})`, 400),
      };
    }

    if (size <= 0) {
      return { error: jsonError(`Fichier vide (#${numeroPieceJointe})`, 400) };
    }

    if (size > MAX_ATTACHMENT_SIZE_BYTES) {
      return {
        error: jsonError(
          `Fichier trop volumineux (#${numeroPieceJointe})`,
          400,
        ),
      };
    }

    tailleTotale += size;
    if (tailleTotale > MAX_TOTAL_ATTACHMENTS_SIZE_BYTES) {
      return {
        error: jsonError("Volume total des pièces jointes trop élevé", 400),
      };
    }

    piecesJointesNormalisees.push({
      nomAffiche,
      typeMime,
      donneesBase64,
      nomFichierOriginal,
      nomFichierNormalise: nomFichierOriginal,
    });
  }

  const estCategorieValide = (categorie: string) =>
    LIBELLES_CATEGORIES_COMPTABLES.includes(categorie);
  const estModePaiementValide = (modePaiement: string) =>
    MODES_PAIEMENT.includes(modePaiement as (typeof MODES_PAIEMENT)[number]);

  // Un élément de `expenses` par justificatif, dans le même ordre.
  if (b.expenses.length !== piecesJointesNormalisees.length) {
    return { error: jsonError("Détails des dépenses incomplets", 400) };
  }

  const detailsDepenses: DetailDepense[] = [];
  for (let i = 0; i < b.expenses.length; i++) {
    const depense = b.expenses[i];
    if (!estModePaiementValide(depense.paymentMethod)) {
      return {
        error: jsonError(`Mode de paiement invalide (#${i + 1})`, 400),
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
    detailsDepenses.push({ modePaiement: depense.paymentMethod, lignes });
  }

  return {
    donneesEmail: {
      emailUtilisateur: b.userEmail,
      date: b.date,
      branche: b.unitId,
      montant: totalDetails(detailsDepenses),
      description: b.description ?? "",
      piecesJointes: piecesJointesNormalisees,
      detailsDepenses,
    },
  };
}
