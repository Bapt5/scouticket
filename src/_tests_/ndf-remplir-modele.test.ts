// @vitest-environment node
import { describe, expect, it } from "vitest";
import { colonneSgdf } from "@/lib/sgdf/mappingCategories";
import {
  construireHtmlNoteDeFrais,
  type NoteDeFraisPourPdf,
  type PieceJustificativePourPdf,
} from "@/lib/sgdf/remplirModele";

const piece = (
  numero: number,
  lignes: PieceJustificativePourPdf["lignes"],
  extra: Partial<PieceJustificativePourPdf> = {},
): PieceJustificativePourPdf => ({
  numero,
  date: "03/09/2026",
  activite: "Camp",
  description: "Achat",
  lignes,
  ...extra,
});

const note = (pieces: PieceJustificativePourPdf[]): NoteDeFraisPourPdf => ({
  groupe: "Groupe Orsay",
  demandeur: "Camille Martin",
  unite: "Louveteaux",
  pieces,
  responsableNom: "Alex Dupont",
  tresorierNom: "Jordan Petit",
});

const normaliser = (texte: string) => texte.replace(/\s+/g, " ").trim();

function cellules(html: string, balise: "tbody" | "tfoot") {
  const bloc = html.match(new RegExp(`<${balise}>[\\s\\S]*?</${balise}>`))![0];
  return [...bloc.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
    normaliser(m[1]),
  );
}

describe("colonneSgdf", () => {
  it("range les transports de note de frais dans la colonne transport", () => {
    expect(colonneSgdf("Remboursement via Ndf frais de transport")).toBe(
      "transport",
    );
    expect(colonneSgdf("Péage-Parking")).toBe("transport");
  });

  it("range hébergement et intendance ensemble", () => {
    expect(colonneSgdf("Hébergement, séminaire")).toBe("hebergementIntendance");
    expect(colonneSgdf("Alimentation, Intendance")).toBe(
      "hebergementIntendance",
    );
  });

  it("range tout le reste en autres frais", () => {
    expect(colonneSgdf("Formation")).toBe("autreFrais");
    expect(colonneSgdf("Médecin, Pharmacie")).toBe("autreFrais");
  });
});

describe("construireHtmlNoteDeFrais", () => {
  it("ventile les montants d'une pièce dans les colonnes SGDF et calcule les totaux", () => {
    const html = construireHtmlNoteDeFrais(
      note([
        piece(1, [
          { categorie: "Péage-Parking", montant: 10 },
          { categorie: "Alimentation, Intendance", montant: 20 },
          { categorie: "Formation", montant: 5 },
        ]),
        piece(2, [{ categorie: "Péage-Parking", montant: 2.5 }]),
      ]),
    );

    const [n1, , , , transport1, km1, hebergement1, autre1] = cellules(
      html,
      "tbody",
    );
    expect(n1).toBe("1");
    expect(transport1).toMatch(/^10,00\s€$/);
    expect(km1).toBe("");
    expect(hebergement1).toMatch(/^20,00\s€$/);
    expect(autre1).toMatch(/^5,00\s€$/);

    const totaux = cellules(html, "tfoot");
    expect(totaux[1]).toMatch(/^12,50\s€$/);
    expect(totaux[2]).toMatch(/^0,00\s€$/);
    expect(totaux[3]).toMatch(/^20,00\s€$/);
    expect(totaux[4]).toMatch(/^5,00\s€$/);
    expect(normaliser(html)).toMatch(/Somme à rembourser : <strong>37,50\s€/);
  });

  it("complète toujours le tableau à 12 lignes", () => {
    const html = construireHtmlNoteDeFrais(
      note([piece(1, [{ categorie: "Formation", montant: 1 }])]),
    );
    expect(cellules(html, "tbody")).toHaveLength(12 * 8);
  });

  it("refuse plus de pièces que de lignes dans le template", () => {
    const pieces = Array.from({ length: 13 }, (_, i) =>
      piece(i + 1, [{ categorie: "Formation", montant: 1 }]),
    );
    expect(() => construireHtmlNoteDeFrais(note(pieces))).toThrow(
      "TROP_DE_PIECES_POUR_LE_TEMPLATE_SGDF",
    );
  });

  it("échappe les textes saisis par l'utilisateur", () => {
    const html = construireHtmlNoteDeFrais({
      ...note([
        piece(1, [{ categorie: "Formation", montant: 1 }], {
          description: `<script>alert("x")</script>`,
          activite: `<img src=x onerror=y>`,
        }),
      ]),
      demandeur: `<b>Pirate</b>`,
    });
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>Pirate</b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("n'affiche que les noms des trois signataires, sans date ni signature", () => {
    const html = construireHtmlNoteDeFrais(
      note([piece(1, [{ categorie: "Formation", montant: 1 }])]),
    );
    const signatures = html.slice(html.indexOf('class="signatures"'));
    for (const nom of ["Camille Martin", "Alex Dupont", "Jordan Petit"])
      expect(signatures).toContain(nom);
    expect(signatures).not.toContain("Date");
    expect(signatures).toContain("certificat de signature");
  });
});
