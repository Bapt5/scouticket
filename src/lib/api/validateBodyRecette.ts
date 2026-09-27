import { jsonError } from "@/lib/api/utils";
import {
  type PieceJointeDepense,
  type DetailRecette,
  type LigneRecette,
} from "@/constants/piecesJointes";
import {
  MAX_LIGNES_PAR_JUSTIFICATIF,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_TOTAL_ATTACHMENTS_SIZE_BYTES,
} from "@/constants/piecesJointes";
import { validerPieceJointe } from "@/lib/api/validateBody";

import type { DonneesEmailRecette } from "@/lib/email";
import type { NextResponse } from "next/server";
import { z } from "zod";
import {
  LIBELLES_CATEGORIES_COMPTABLES_RECETTES,
  MOYENS_PAIEMENT_RECETTE,
} from "@/constants/configRecettes";
import { analyserDateIso } from "@/lib/nomenclature";
import { totalLignes } from "@/lib/depenses";
import { journal } from "@/lib/logger";

const schemaCorps = z.object({
  userEmail: z.string().email(),
  unitId: z.string().min(1),
  recette: z.object({
    date: z.string(),
    paymentMethod: z.string(),
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
  attachment: z.any().optional(),
});

export function validerCorpsRequeteRecette(body: unknown): {
  donneesEmail?: DonneesEmailRecette;
  error?: NextResponse;
} {
  const bodyParsed = schemaCorps.safeParse(body);

  if (!bodyParsed.success) {
    journal.avertissement("recette.corps_invalide", {
      categorie: "recette",
      codeErreur: "CORPS_INVALIDE",
      details: {
        nombreErreursValidation: bodyParsed.error.issues.length,
      },
    });
    return { error: jsonError("Données manquantes ou incorrecte", 400) };
  }

  const b = bodyParsed.data;

  if (!analyserDateIso(b.recette.date)) {
    return { error: jsonError("Date invalide", 400) };
  }

  if (
    !(MOYENS_PAIEMENT_RECETTE as readonly string[]).includes(
      b.recette.paymentMethod,
    )
  ) {
    return { error: jsonError("Moyen de paiement invalide", 400) };
  }

  // ─── Pièce jointe (facultative, une seule) ───
  let piecesJointes: PieceJointeDepense[] = [];
  let tailleTotale = 0;
  if (b.attachment !== undefined && b.attachment !== null) {
    const resultat = validerPieceJointe(b.attachment, "Pièce jointe");
    if ("error" in resultat) return { error: resultat.error };
    tailleTotale += resultat.taille;
    if (tailleTotale > MAX_TOTAL_ATTACHMENTS_SIZE_BYTES)
      return {
        error: jsonError("Volume total des pièces jointes trop élevé", 400),
      };
    if (resultat.taille > MAX_ATTACHMENT_SIZE_BYTES)
      return { error: jsonError("Fichier trop volumineux", 400) };
    piecesJointes = [resultat.piece];
  }

  const estCategorieValide = (categorie: string) =>
    LIBELLES_CATEGORIES_COMPTABLES_RECETTES.includes(categorie);

  const lignes: LigneRecette[] = [];
  for (const ligne of b.recette.lines) {
    const montantLigne = Number(ligne.amount);
    if (
      !estCategorieValide(ligne.category) ||
      !Number.isFinite(montantLigne) ||
      montantLigne <= 0
    ) {
      return { error: jsonError("Recette invalide", 400) };
    }
    lignes.push({ categorie: ligne.category, montant: montantLigne });
  }

  const detailRecette: DetailRecette = {
    date: b.recette.date,
    modePaiement: b.recette.paymentMethod,
    description: (b.recette.description ?? "").trim(),
    lignes,
  };

  const montant = totalLignes(lignes);

  return {
    donneesEmail: {
      emailUtilisateur: b.userEmail,
      date: detailRecette.date,
      branche: b.unitId,
      montant,
      piecesJointes,
      detailRecette,
    },
  };
}
