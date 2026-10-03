import { describe, expect, it } from "vitest";
import type { DetailDepense } from "@/constants/piecesJointes";
import {
  cellulesCsv,
  formaterDateHistorique,
  genererCsvHistorique,
  intervalleAnneeComptable,
  typeHistoriqueDepense,
  versEntreeRecette,
  versEntreesDepense,
  type LigneHistoriqueApi,
} from "@/lib/historique";

const detail = (surcharge: Partial<DetailDepense> = {}): DetailDepense => ({
  date: "2026-03-10",
  modePaiement: "",
  activite: "Camp",
  description: "Courses",
  lignes: [
    { categorie: "Alimentation, Intendance", montant: 12.5 },
    { categorie: "Formation", montant: 3 },
  ],
  reference: "2026-001",
  ...surcharge,
});

describe("versEntreesDepense", () => {
  it("produit une entrée par justificatif, avec sa référence", () => {
    const entrees = versEntreesDepense(
      [detail(), detail({ reference: "2026-002", description: "Essence" })],
      "note-de-frais",
    );

    expect(entrees).toHaveLength(2);
    expect(entrees.map((entree) => entree.reference)).toEqual([
      "2026-001",
      "2026-002",
    ]);
    expect(entrees[1]).toMatchObject({
      type: "note-de-frais",
      description: "Essence",
      activite: "Camp",
    });
  });

  it("laisse la référence à null sans nomenclature", () => {
    const [entree] = versEntreesDepense(
      [detail({ reference: undefined })],
      "depense",
    );
    expect(entree.reference).toBeNull();
  });
});

describe("versEntreeRecette", () => {
  it("convertit une recette en une seule entrée", () => {
    expect(
      versEntreeRecette({
        date: "2026-04-01",
        modePaiement: "Virement",
        description: "Vente",
        lignes: [{ categorie: "Vente article boutique", montant: 40 }],
        reference: "R-1",
      }),
    ).toEqual({
      type: "recette",
      date: "2026-04-01",
      reference: "R-1",
      modePaiement: "Virement",
      activite: "",
      description: "Vente",
      lignes: [{ categorie: "Vente article boutique", montant: 40 }],
    });
  });
});

describe("typeHistoriqueDepense", () => {
  it("traite la dépense de groupe comme une dépense", () => {
    expect(typeHistoriqueDepense("depense-groupe")).toBe("depense");
    expect(typeHistoriqueDepense("note-de-frais")).toBe("note-de-frais");
  });
});

describe("intervalleAnneeComptable", () => {
  it("couvre de la date de début à la veille du début suivant", () => {
    expect(intervalleAnneeComptable(2025, { mois: 9, jour: 1 })).toEqual({
      du: "2025-09-01",
      au: "2026-08-31",
    });
  });

  it("couvre l'année civile quand elle commence en janvier", () => {
    expect(intervalleAnneeComptable(2026, { mois: 1, jour: 1 })).toEqual({
      du: "2026-01-01",
      au: "2026-12-31",
    });
  });
});

describe("export CSV", () => {
  it("neutralise les formules et échappe les séparateurs", () => {
    expect(cellulesCsv("=SOMME(A1)")).toBe("'=SOMME(A1)");
    expect(cellulesCsv("a;b")).toBe('"a;b"');
    expect(cellulesCsv('dit "oui"')).toBe('"dit ""oui"""');
    expect(cellulesCsv("normal")).toBe("normal");
  });

  it("génère un fichier avec BOM, montants français et détail par catégorie", () => {
    const ligne: LigneHistoriqueApi = {
      id: "1",
      envoiId: "e",
      type: "depense",
      date: "2026-03-10",
      uniteId: "u",
      uniteLabel: "Louveteaux",
      uniteCouleur: "#fff",
      reference: "2026-001",
      modePaiement: "Carte",
      activite: "",
      description: "=cmd",
      montantTotal: 15.5,
      lignes: [
        { categorie: "Alimentation, Intendance", montant: 12.5 },
        { categorie: "Formation", montant: 3 },
      ],
      auteurNom: null,
      creeLe: "2026-03-10T10:00:00.000Z",
      modifieLe: null,
      modifieParNom: null,
    };

    const recette: LigneHistoriqueApi = {
      ...ligne,
      id: "2",
      type: "recette",
      reference: null,
      description: "Vente",
      montantTotal: 60,
      lignes: [
        { categorie: "Vente article boutique", montant: 40 },
        { categorie: "Vente article boutique", montant: 15 },
        { categorie: "Catégorie retirée", montant: 5 },
      ],
    };

    const csv = genererCsvHistorique([ligne, recette]);

    expect(csv.startsWith("﻿Date;")).toBe(true);
    const [entetes, premiere, seconde] = csv.trim().split("\r\n");
    // Une colonne par catégorie présente : ordre comptable, inconnues à la fin.
    expect(entetes).toBe(
      "Date;Référence;Type;Unité;Mode de paiement;Activité;Description;Montant total;Alimentation, Intendance;Formation;Vente article boutique;Catégorie retirée",
    );
    expect(premiere).toBe(
      "2026-03-10;2026-001;Dépense;Louveteaux;Carte;;'=cmd;15,50;12,50;3,00;;",
    );
    // Même catégorie répétée additionnée, cellules vides pour les autres.
    expect(seconde).toBe(
      "2026-03-10;;Recette;Louveteaux;Carte;;Vente;60,00;;;55,00;5,00",
    );
  });

  it("n'ajoute aucune colonne de catégorie sans ligne", () => {
    // trim() retire aussi le BOM : il est vérifié dans le test précédent.
    expect(genererCsvHistorique([]).trim().split("\r\n")).toEqual([
      "Date;Référence;Type;Unité;Mode de paiement;Activité;Description;Montant total",
    ]);
  });
});

describe("formaterDateHistorique", () => {
  it("renvoie JJ/MM/AAAA", () => {
    expect(formaterDateHistorique("2026-03-09")).toBe("09/03/2026");
  });
});
