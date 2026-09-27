import { describe, expect, it } from "vitest";
import {
  detailSaisieRecetteComplet,
  detailSaisieRecetteVide,
  versDetailRecette,
  versRecetteNomenclature,
  type DetailSaisieRecette,
} from "@/lib/recettes";
import type { DetailRecette } from "@/constants/piecesJointes";

const detailRecette = (
  modification: Partial<DetailRecette>,
): DetailRecette => ({
  date: "2026-08-16",
  modePaiement: "Virement",
  description: "",
  lignes: [],
  ...modification,
});

const detailSaisie = (
  modification: Partial<DetailSaisieRecette>,
): DetailSaisieRecette => ({
  date: "2026-08-16",
  modePaiement: "Virement",
  description: "",
  lignes: [{ categorie: "Cotisations SGDF", montant: "45" }],
  ...modification,
});

describe("recettes", () => {
  it("produit un détail vide avec la date du jour", () => {
    const vide = detailSaisieRecetteVide();
    expect(vide.modePaiement).toBe("");
    expect(vide.lignes).toEqual([{ categorie: "", montant: "" }]);
  });

  it("utilise la catégorie unique et le total pour la nomenclature", () => {
    expect(
      versRecetteNomenclature(
        detailRecette({
          modePaiement: "Chèque",
          lignes: [
            { categorie: "Cotisations SGDF", montant: 10 },
            { categorie: "Cotisations SGDF", montant: 5.5 },
          ],
        }),
      ),
    ).toEqual({
      typeDepense: "Cotisations SGDF",
      modePaiement: "Chèque",
      montant: 15.5,
    });
  });

  it("utilise « Multiples » quand plusieurs catégories sont utilisées", () => {
    expect(
      versRecetteNomenclature(
        detailRecette({
          lignes: [
            { categorie: "Cotisations SGDF", montant: 10 },
            { categorie: "Vente article boutique", montant: 5 },
          ],
        }),
      ).typeDepense,
    ).toBe("Multiples");
  });

  it("exige date, mode de paiement, catégorie et montant", () => {
    const complet = detailSaisie({});
    expect(detailSaisieRecetteComplet(complet)).toBe(true);
    expect(detailSaisieRecetteComplet({ ...complet, modePaiement: "" })).toBe(
      false,
    );
    expect(detailSaisieRecetteComplet({ ...complet, date: "" })).toBe(false);
    expect(
      detailSaisieRecetteComplet({
        ...complet,
        lignes: [...complet.lignes, { categorie: "", montant: "3" }],
      }),
    ).toBe(false);
  });

  it("convertit la saisie en détail avec montants numériques", () => {
    const saisie = detailSaisie({
      lignes: [{ categorie: "Cotisations SGDF", montant: "12,5" }],
    });
    expect(versDetailRecette(saisie)).toEqual({
      date: "2026-08-16",
      modePaiement: "Virement",
      description: "",
      lignes: [{ categorie: "Cotisations SGDF", montant: 12.5 }],
    });
  });
});
