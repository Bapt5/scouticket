import { describe, expect, it } from "vitest";
import {
  categoriesPourTypeEnvoi,
  LIBELLES_CATEGORIES_COMPTABLES,
} from "@/constants/configDepenses";

const libelles = (type: "note-de-frais" | "depense-groupe") =>
  categoriesPourTypeEnvoi(type).map((categorie) => categorie.libelle);

describe("categoriesPourTypeEnvoi", () => {
  it("réserve le remboursement de transport aux notes de frais", () => {
    expect(libelles("note-de-frais")).toContain(
      "Remboursement via Ndf frais de transport",
    );
    expect(libelles("depense-groupe")).not.toContain(
      "Remboursement via Ndf frais de transport",
    );
  });

  it("exclut des notes de frais les catégories payées par le groupe", () => {
    const ndf = libelles("note-de-frais");
    for (const libelle of [
      "Assurances",
      "Carburant",
      "Eau",
      "Participation Activités",
      "Transport collectif : en Autocar",
      "Transport collectif : en Avion",
      "Transport collectif : en Bateau",
      "Transport collectif en commun (RER, métro, Tram, bus, etc.)",
      "Transport collectif Train",
      "Travaux, Gros entretiens",
    ])
      expect(ndf).not.toContain(libelle);
    expect(ndf).toContain("Péage-Parking");
  });

  it("garde toutes les catégories communes dans les deux types", () => {
    expect(libelles("note-de-frais")).toContain("Formation");
    expect(libelles("depense-groupe")).toContain("Formation");
    expect(libelles("depense-groupe")).toContain("Carburant");
  });

  it("classe 1 catégorie NDF seule, 22 groupe seul et 23 communes", () => {
    const ndf = new Set(libelles("note-de-frais"));
    const groupe = new Set(libelles("depense-groupe"));
    const ndfSeul = LIBELLES_CATEGORIES_COMPTABLES.filter(
      (libelle) => ndf.has(libelle) && !groupe.has(libelle),
    );
    const groupeSeul = LIBELLES_CATEGORIES_COMPTABLES.filter(
      (libelle) => groupe.has(libelle) && !ndf.has(libelle),
    );
    const communes = LIBELLES_CATEGORIES_COMPTABLES.filter(
      (libelle) => ndf.has(libelle) && groupe.has(libelle),
    );
    expect([ndfSeul.length, groupeSeul.length, communes.length]).toEqual([
      1, 22, 23,
    ]);
  });
});
