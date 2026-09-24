import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import type { PieceJointeDepense } from "@/constants/piecesJointes";

// Dimensions max d'une page (points PDF, A4) ; l'image est réduite pour y tenir.
const LARGEUR_MAX_PAGE = 595;
const HAUTEUR_MAX_PAGE = 842;

/** Remplace l'extension du nom de fichier (ou l'ajoute) par `.pdf`. */
function nomAvecExtensionPdf(nom: string) {
  const sansExtension = nom.replace(/\.[^./\\]+$/, "");
  return `${sansExtension || "justificatif"}.pdf`;
}

async function imageVersPdf(
  tampon: Buffer,
  typeMime: string,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  let image;
  if (typeMime === "image/png") {
    image = await document.embedPng(tampon);
  } else {
    // JPEG/WebP : sharp applique l'orientation EXIF, que pdf-lib ignorerait.
    const jpeg = await sharp(tampon).rotate().jpeg({ quality: 90 }).toBuffer();
    image = await document.embedJpg(jpeg);
  }

  const paysage = image.width > image.height;
  const echelle = Math.min(
    (paysage ? HAUTEUR_MAX_PAGE : LARGEUR_MAX_PAGE) / image.width,
    (paysage ? LARGEUR_MAX_PAGE : HAUTEUR_MAX_PAGE) / image.height,
    1,
  );
  const largeur = image.width * echelle;
  const hauteur = image.height * echelle;
  const page = document.addPage([largeur, hauteur]);
  page.drawImage(image, { x: 0, y: 0, width: largeur, height: hauteur });
  return document.save();
}

/**
 * Convertit chaque image en PDF d'une page (un PDF par justificatif) ; les PDF
 * sont conservés tels quels. Renvoie de nouvelles pièces, sans modifier les
 * originales.
 */
export async function convertirPiecesJointesEnPdf(
  pieces: PieceJointeDepense[],
): Promise<PieceJointeDepense[]> {
  return Promise.all(
    pieces.map(async (piece) => {
      if (piece.typeMime === "application/pdf") return piece;
      const pdf = await imageVersPdf(
        Buffer.from(piece.donneesBase64, "base64"),
        piece.typeMime,
      );
      return {
        ...piece,
        typeMime: "application/pdf",
        donneesBase64: Buffer.from(pdf).toString("base64"),
        nomFichierOriginal: nomAvecExtensionPdf(piece.nomFichierOriginal),
        nomFichierNormalise: nomAvecExtensionPdf(piece.nomFichierNormalise),
      };
    }),
  );
}
