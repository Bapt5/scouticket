// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { convertirPiecesJointesEnPdf } from "@/lib/conversionJustificatifs";
import type { PieceJointeDepense } from "@/constants/piecesJointes";

const creerImage = (
  format: "jpeg" | "png" | "webp",
  largeur = 40,
  hauteur = 20,
) =>
  sharp({
    create: {
      width: largeur,
      height: hauteur,
      channels: 3,
      background: "#ff0000",
    },
  })
    [format]()
    .toBuffer();

const piece = (
  typeMime: string,
  donnees: Buffer,
  nom: string,
): PieceJointeDepense => ({
  nomAffiche: nom,
  typeMime,
  donneesBase64: donnees.toString("base64"),
  nomFichierOriginal: nom,
  nomFichierNormalise: nom,
});

describe("convertirPiecesJointesEnPdf", () => {
  it.each([
    ["jpeg", "image/jpeg", "photo.jpg"],
    ["png", "image/png", "photo.png"],
    ["webp", "image/webp", "photo.webp"],
  ] as const)(
    "convertit une image %s en PDF d'une page",
    async (format, mime, nom) => {
      const [resultat] = await convertirPiecesJointesEnPdf([
        piece(mime, await creerImage(format), nom),
      ]);

      expect(resultat.typeMime).toBe("application/pdf");
      expect(resultat.nomFichierOriginal).toBe("photo.pdf");
      expect(resultat.nomFichierNormalise).toBe("photo.pdf");
      const pdf = await PDFDocument.load(
        Buffer.from(resultat.donneesBase64, "base64"),
      );
      expect(pdf.getPageCount()).toBe(1);
    },
  );

  it("conserve les PDF tels quels", async () => {
    const original = piece("application/pdf", Buffer.from("%PDF-1.4"), "a.pdf");

    const [resultat] = await convertirPiecesJointesEnPdf([original]);

    expect(resultat).toBe(original);
  });

  it("réduit une grande image pour tenir sur une page A4", async () => {
    const [resultat] = await convertirPiecesJointesEnPdf([
      piece("image/jpeg", await creerImage("jpeg", 2000, 3000), "grand.jpg"),
    ]);

    const pdf = await PDFDocument.load(
      Buffer.from(resultat.donneesBase64, "base64"),
    );
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeLessThanOrEqual(595);
    expect(height).toBeLessThanOrEqual(842);
  });
});
