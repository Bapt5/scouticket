import { describe, expect, it } from "vitest";
import {
  POSTES_PAR_DEFAUT,
  depasseBudget,
  genererCsvSuivi,
  soldeLigne,
  tauxRealisation,
  validerPostes,
  type LigneSuiviBudget,
} from "@/lib/budget";
import { cellulesCsv, montantCsv } from "@/lib/historique";

const ligne = (
  surcharge: Partial<LigneSuiviBudget> = {},
): LigneSuiviBudget => ({
  id: "p1",
  label: "Camp",
  budget: 1000,
  realise: 400,
  ...surcharge,
});

describe("POSTES_PAR_DEFAUT", () => {
  it("contient 9 postes de dépenses et 5 de recettes, valides et sans id", () => {
    expect(
      POSTES_PAR_DEFAUT.filter((poste) => poste.domaine === "depense"),
    ).toHaveLength(9);
    expect(
      POSTES_PAR_DEFAUT.filter((poste) => poste.domaine === "recette"),
    ).toHaveLength(5);
    expect(POSTES_PAR_DEFAUT.every((poste) => poste.id === null)).toBe(true);
    expect(validerPostes(POSTES_PAR_DEFAUT)).not.toBeNull();
  });

  it("autorise un même libellé en dépense et en recette (Camp)", () => {
    const camps = POSTES_PAR_DEFAUT.filter((poste) => poste.label === "Camp");
    expect(camps.map((poste) => poste.domaine).sort()).toEqual([
      "depense",
      "recette",
    ]);
  });
});

describe("validerPostes", () => {
  const poste = (
    label: string,
    id: string | null = null,
    domaine = "depense",
  ) => ({
    id,
    domaine,
    label,
  });

  it("rogne les libellés et conserve les ids existants", () => {
    expect(validerPostes([poste("  Camp  ", "a")])).toEqual([
      { id: "a", domaine: "depense", label: "Camp" },
    ]);
  });

  it.each([
    ["autre chose qu'un tableau", "nope"],
    ["un libellé vide", [poste("   ")]],
    ["un libellé trop long", [poste("x".repeat(81))]],
    ["un domaine inconnu", [poste("Camp", null, "autre")]],
    ["un élément non objet", ["Camp"]],
    [
      "un doublon (accents et casse ignorés)",
      [poste("Matériel"), poste("materiel")],
    ],
    ["un id en double", [poste("A", "x"), poste("B", "x")]],
    [
      "plus de 40 postes dans un domaine",
      Array.from({ length: 41 }, (_, i) => poste(`Poste ${i}`)),
    ],
  ])("refuse %s", (_nom, valeur) => {
    expect(validerPostes(valeur)).toBeNull();
  });
});

describe("suivi d'une ligne", () => {
  it("calcule le solde restant d'une dépense et l'écart d'une recette", () => {
    expect(soldeLigne(ligne(), "depense")).toBe(600);
    expect(soldeLigne(ligne({ realise: 1200 }), "depense")).toBe(-200);
    expect(soldeLigne(ligne({ realise: 1200 }), "recette")).toBe(200);
  });

  it("n'a pas de solde ni de taux sans budget", () => {
    expect(soldeLigne(ligne({ budget: null }), "depense")).toBeNull();
    expect(tauxRealisation(ligne({ budget: null }))).toBeNull();
    expect(tauxRealisation(ligne({ budget: 0 }))).toBeNull();
    expect(depasseBudget(ligne({ budget: null, realise: 50 }))).toBe(false);
  });

  it("arrondit le taux à une décimale et détecte le dépassement", () => {
    expect(tauxRealisation(ligne({ budget: 300, realise: 100 }))).toBe(33.3);
    expect(depasseBudget(ligne({ realise: 1000 }))).toBe(false);
    expect(depasseBudget(ligne({ realise: 1000.01 }))).toBe(true);
  });
});

describe("genererCsvSuivi", () => {
  it("exporte dépenses puis recettes avec budget, réalisé, solde et taux", () => {
    const csv = genererCsvSuivi(
      {
        depense: [
          ligne(),
          ligne({ id: null, label: "Non affecté", budget: null, realise: 25 }),
        ],
        recette: [
          ligne({ id: "r1", label: "=Calendrier", budget: 200, realise: 250 }),
        ],
      },
      cellulesCsv,
      montantCsv,
    );

    expect(csv.startsWith("﻿Type;Poste;")).toBe(true);
    // `trim()` retire aussi le BOM : on le compare séparément (ci-dessus).
    expect(csv.trim().split("\r\n")).toEqual([
      "Type;Poste;Budget;Réalisé;Solde;Taux de réalisation (%)",
      "Dépenses;Camp;1000,00;400,00;600,00;40",
      "Dépenses;Non affecté;;25,00;;",
      "Recettes;'=Calendrier;200,00;250,00;50,00;125",
    ]);
  });
});
