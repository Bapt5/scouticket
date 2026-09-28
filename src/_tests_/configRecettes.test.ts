import { describe, expect, it } from "vitest";
import {
  CATEGORIES_COMPTABLES_RECETTES,
  LIBELLES_CATEGORIES_COMPTABLES_RECETTES,
  MOYENS_PAIEMENT_RECETTE,
} from "@/constants/configRecettes";

describe("configRecettes", () => {
  it("n'a pas de libellé de catégorie en double", () => {
    const libelles = CATEGORIES_COMPTABLES_RECETTES.map((c) => c.libelle);
    expect(new Set(libelles).size).toBe(libelles.length);
  });

  it("LIBELLES_CATEGORIES_COMPTABLES_RECETTES correspond aux catégories", () => {
    expect(LIBELLES_CATEGORIES_COMPTABLES_RECETTES).toEqual(
      CATEGORIES_COMPTABLES_RECETTES.map((c) => c.libelle),
    );
  });

  it("propose une liste fixe de 4 moyens de paiement", () => {
    expect(MOYENS_PAIEMENT_RECETTE).toEqual([
      "Virement",
      "Chèque",
      "Liquide",
      "Carte bancaire",
    ]);
  });
});
