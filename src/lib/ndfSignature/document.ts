import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { convertirPiecesJointesEnPdf } from "@/lib/conversionJustificatifs";
import type { PieceJointeDepense } from "@/constants/piecesJointes";
import {
  preparerPagesSignature,
  type SignataireDocument,
} from "@/lib/ndfSignature/pdfSignature";

/** Hash SHA-256 (hex) du document initial, calculé une seule fois au dépôt. */
export function hasherDocument(pdf: Buffer): string {
  return createHash("sha256").update(pdf).digest("hex");
}

/**
 * Assemble le document initial (haché au dépôt) : la page note de frais
 * suivie de chaque justificatif, dans l'ordre des pièces (même ordre que les
 * n° de pièce de la page note de frais), puis les 3 pages de signature (un
 * champ de signature vide par étape, voir `pdfSignature.ts`). Les
 * justificatifs image sont systématiquement convertis en PDF,
 * indépendamment du paramètre `convertirJustificatifsEnPdf` du groupe, pour
 * pouvoir tous les fusionner.
 *
 * Le fichier est enregistré sans object streams : les signatures cumulatives
 * ajoutent des révisions à la suite et exigent une table xref classique.
 */
export async function assemblerDocumentInitial(
  pageNdf: Buffer,
  piecesJointes: PieceJointeDepense[],
  signataires: SignataireDocument[],
): Promise<Buffer> {
  const piecesEnPdf = await convertirPiecesJointesEnPdf(piecesJointes);
  const document = await PDFDocument.create();

  const pageNdfDoc = await PDFDocument.load(pageNdf);
  for (const page of await document.copyPages(
    pageNdfDoc,
    pageNdfDoc.getPageIndices(),
  ))
    document.addPage(page);

  for (const piece of piecesEnPdf) {
    const piecePdf = await PDFDocument.load(
      Buffer.from(piece.donneesBase64, "base64"),
    );
    for (const page of await document.copyPages(
      piecePdf,
      piecePdf.getPageIndices(),
    ))
      document.addPage(page);
  }

  await preparerPagesSignature(document, signataires);

  return Buffer.from(await document.save({ useObjectStreams: false }));
}
