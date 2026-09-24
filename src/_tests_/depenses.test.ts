import { describe, expect, it } from "vitest";
import {
  totalLignes,
  versDepenseNomenclature,
  detailSaisiComplet,
} from "@/lib/depenses";

describe("depenses", () => {
  it("additionne les lignes au centime près", () => {
    expect(
      totalLignes([
        { montant: 0.1 },
        { montant: 0.2 },
        { montant: Number.NaN },
      ]),
    ).toBe(0.3);
  });

  it("utilise la catégorie unique et le total pour la nomenclature", () => {
    expect(
      versDepenseNomenclature({
        modePaiement: "Espèces",
        lignes: [
          { categorie: "Carburant", montant: 10 },
          { categorie: "Carburant", montant: 5.5 },
        ],
      }),
    ).toEqual({
      typeDepense: "Carburant",
      modePaiement: "Espèces",
      montant: 15.5,
    });
  });

  it("utilise « Multiples » quand plusieurs catégories sont utilisées", () => {
    expect(
      versDepenseNomenclature({
        modePaiement: "Chèque",
        lignes: [
          { categorie: "Carburant", montant: 10 },
          { categorie: "Péage-Parking", montant: 5 },
        ],
      }).typeDepense,
    ).toBe("Multiples");
  });

  it("exige mode de paiement, catégorie et montant positif", () => {
    const ligne = { categorie: "Eau", montant: "12,5" };
    expect(
      detailSaisiComplet({ modePaiement: "Espèces", lignes: [ligne] }),
    ).toBe(true);
    expect(detailSaisiComplet({ modePaiement: "", lignes: [ligne] })).toBe(
      false,
    );
    expect(
      detailSaisiComplet({
        modePaiement: "Espèces",
        lignes: [ligne, { categorie: "", montant: "3" }],
      }),
    ).toBe(false);
  });
});
