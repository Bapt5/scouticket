// @vitest-environment node
import { PDFArray, PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

// Les justificatifs de ces tests sont déjà des PDF : inutile de charger sharp.
vi.mock("@/lib/conversionJustificatifs", () => ({
  convertirPiecesJointesEnPdf: async <T>(pieces: T[]) => pieces,
}));

import { assemblerDocumentInitial } from "@/lib/ndfSignature/document";

const SIGNATAIRES = [
  { etape: "beneficiaire", nom: "Alice Martin" },
  { etape: "responsable", nom: "Bruno Durand" },
  { etape: "tresorier", nom: "Chloé Petit" },
] as const;

async function pdfDe(pages: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

const pieceJointe = async (pages: number) => ({
  nomAffiche: "justif.pdf",
  typeMime: "application/pdf",
  donneesBase64: (await pdfDe(pages)).toString("base64"),
  nomFichierOriginal: "justif.pdf",
  nomFichierNormalise: "justif.pdf",
});

const nombrePages = async (pdf: Buffer) =>
  (await PDFDocument.load(pdf)).getPageCount();

describe("assemblerDocumentInitial", () => {
  it("place la page note de frais avant les justificatifs, puis les 3 pages de signature", async () => {
    const assemble = await assemblerDocumentInitial(
      await pdfDe(1),
      [await pieceJointe(2), await pieceJointe(1)],
      [...SIGNATAIRES],
    );
    expect(await nombrePages(assemble)).toBe(4 + 3);
  });

  it("fonctionne sans justificatif", async () => {
    expect(
      await nombrePages(
        await assemblerDocumentInitial(await pdfDe(1), [], [...SIGNATAIRES]),
      ),
    ).toBe(1 + 3);
  });

  it("crée un champ de signature vide par étape, dans l'ordre", async () => {
    const assemble = await assemblerDocumentInitial(
      await pdfDe(1),
      [],
      [...SIGNATAIRES],
    );
    const document = await PDFDocument.load(assemble);
    const acroForm = document.catalog.lookup(PDFName.of("AcroForm"), PDFDict);
    const champs = acroForm.lookup(PDFName.of("Fields"), PDFArray);
    const noms = Array.from({ length: champs.size() }, (_, i) =>
      champs.lookup(i, PDFDict).lookup(PDFName.of("T"))?.toString(),
    );
    expect(noms).toEqual([
      "(signature-beneficiaire)",
      "(signature-responsable)",
      "(signature-tresorier)",
    ]);
    // Aucun champ n'est signé au dépôt.
    for (let i = 0; i < champs.size(); i++)
      expect(champs.lookup(i, PDFDict).has(PDFName.of("V"))).toBe(false);
  });

  it("enregistre le PDF avec une table xref classique (sans object streams)", async () => {
    const assemble = await assemblerDocumentInitial(
      await pdfDe(1),
      [],
      [...SIGNATAIRES],
    );
    const texte = assemble.toString("latin1");
    expect(texte).not.toContain("/ObjStm");
    expect(texte).toMatch(/\nxref\n/);
  });

  it("refuse un signataire manquant", async () => {
    await expect(
      assemblerDocumentInitial(await pdfDe(1), [], [SIGNATAIRES[0]]),
    ).rejects.toThrow("Signataire manquant");
  });
});
