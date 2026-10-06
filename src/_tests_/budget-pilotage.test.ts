import { describe, expect, it } from "vitest";
import {
  avancementAnnee,
  comparerAvecPrecedente,
  postesASurveiller,
  synthese,
} from "@/lib/budgetPilotage";
import type { LigneSuiviBudget } from "@/lib/budget";

const ligne = (
  id: string | null,
  label: string,
  budget: number | null,
  realise: number,
): LigneSuiviBudget => ({ id, label, budget, realise });

const DEPENSES = [
  ligne("d1", "Camp", 1000, 400),
  ligne("d2", "Matériel", 200, 250),
  ligne("d3", "Formation", null, 0),
  ligne(null, "Non affecté", null, 35),
];
const RECETTES = [
  ligne("r1", "Calendrier", 300, 150),
  ligne("r2", "Subventions", 500, 700),
];

describe("synthese", () => {
  it("calcule totaux, écarts favorables et résultat prévu et réalisé", () => {
    const bilan = synthese(DEPENSES, RECETTES);

    expect(bilan.recettes).toEqual({
      prevu: 800,
      realise: 850,
      ecart: 50,
      taux: 106.3,
    });
    // Dépenses : l'écart est favorable quand on dépense moins que prévu.
    expect(bilan.depenses).toEqual({
      prevu: 1200,
      realise: 685,
      ecart: 515,
      taux: 57.1,
    });
    expect(bilan.resultat.prevu).toBe(-400);
    expect(bilan.resultat.realise).toBe(165);
    expect(bilan.resultat.ecart).toBe(565);
  });

  it("compte les postes sans budget, sans compter « Non affecté »", () => {
    const bilan = synthese(DEPENSES, RECETTES);

    expect(bilan.postesSansBudget).toBe(1);
    expect(bilan.aDesBudgets).toBe(true);
  });

  it("inclut « Non affecté » dans le réalisé et pas dans le prévu", () => {
    const bilan = synthese([ligne(null, "Non affecté", null, 35)], []);

    expect(bilan.depenses.realise).toBe(35);
    expect(bilan.depenses.prevu).toBe(0);
    expect(bilan.depenses.taux).toBeNull();
  });

  it("indique l'absence de budget quand aucun n'est saisi", () => {
    const bilan = synthese(
      [ligne("d1", "Camp", null, 10)],
      [ligne("r1", "Calendrier", null, 20)],
    );

    expect(bilan.aDesBudgets).toBe(false);
    expect(bilan.resultat.prevu).toBe(0);
    expect(bilan.resultat.realise).toBe(10);
  });

  it("arrondit au centime sans dérive flottante", () => {
    const bilan = synthese(
      [ligne("d1", "A", 0.1, 0.1), ligne("d2", "B", 0.2, 0.2)],
      [],
    );

    expect(bilan.depenses.prevu).toBe(0.3);
    expect(bilan.depenses.realise).toBe(0.3);
  });

  it("gère un groupe sans aucune ligne", () => {
    const bilan = synthese([], []);

    expect(bilan.resultat).toEqual({
      prevu: 0,
      realise: 0,
      ecart: 0,
      taux: null,
    });
    expect(bilan.aDesBudgets).toBe(false);
  });
});

describe("avancementAnnee", () => {
  const du = "2025-09-01";
  const au = "2026-08-31";

  it("vaut 0 avant le début et 100 après la fin", () => {
    expect(avancementAnnee(du, au, "2025-01-01")).toBe(0);
    expect(avancementAnnee(du, au, "2027-01-01")).toBe(100);
  });

  it("compte les bornes incluses (le premier et le dernier jour)", () => {
    // 365 jours : le premier jour représente 1/365.
    expect(avancementAnnee(du, au, du)).toBe(0.3);
    expect(avancementAnnee(du, au, au)).toBe(100);
  });

  it("calcule la part de jours écoulés en cours d'année", () => {
    // Du 1er septembre 2025 au 1er mars 2026 inclus : 182 jours sur 365.
    expect(avancementAnnee(du, au, "2026-03-01")).toBe(49.9);
  });

  it("renvoie null pour une date invalide ou une année inversée", () => {
    expect(avancementAnnee("n'importe quoi", au, du)).toBeNull();
    expect(avancementAnnee(du, au, "2026-02-30")).toBeNull();
    expect(avancementAnnee(au, du, du)).toBeNull();
  });

  it("gère une année comptable de 366 jours", () => {
    expect(avancementAnnee("2023-09-01", "2024-08-31", "2024-08-31")).toBe(100);
    expect(avancementAnnee("2023-09-01", "2024-08-31", "2024-02-29")).toBe(
      49.7,
    );
  });
});

describe("postesASurveiller", () => {
  it("signale un dépassement, un poste à 80 % et pas un poste sous le seuil", () => {
    const resultat = postesASurveiller(
      [
        ligne("d1", "Camp", 1000, 400),
        ligne("d2", "Matériel", 200, 250),
        ligne("d3", "Assurance", 100, 80),
        ligne("d4", "Formation", 100, 79.9),
      ],
      [],
      50,
    );

    expect(resultat.map((poste) => [poste.label, poste.statut])).toEqual([
      ["Matériel", "depasse"],
      ["Assurance", "a-surveiller"],
    ]);
    expect(resultat[0]).toMatchObject({
      libelleStatut: "Budget dépassé",
      montantConcerne: 50,
      taux: 125,
    });
    // Le reste à dépenser explique le statut « à surveiller ».
    expect(resultat[1].montantConcerne).toBe(20);
  });

  it("considère un budget à zéro dépensé comme un dépassement, sans taux", () => {
    const [poste] = postesASurveiller([ligne("d1", "Camp", 0, 30)], [], 50);

    expect(poste).toMatchObject({ statut: "depasse", taux: null });
  });

  it("ne juge ni les postes sans budget ni « Non affecté »", () => {
    expect(
      postesASurveiller(
        [ligne("d1", "Camp", null, 999), ligne(null, "Non affecté", null, 50)],
        [ligne("r1", "Calendrier", null, 0)],
        90,
      ),
    ).toEqual([]);
  });

  it("signale une recette en retard de plus de 20 points sur l'avancement", () => {
    const resultat = postesASurveiller(
      [],
      [
        ligne("r1", "Calendrier", 1000, 200),
        ligne("r2", "Subventions", 1000, 300),
        ligne("r3", "Extra-job", 1000, 800),
      ],
      50,
    );

    // 20 % < 30 % : en retard ; 30 % n'est pas inférieur à 30 % ; 80 % est en avance.
    expect(resultat.map((poste) => poste.label)).toEqual(["Calendrier"]);
    expect(resultat[0]).toMatchObject({
      statut: "en-retard",
      libelleStatut: "En retard sur l'objectif",
      montantConcerne: 800,
    });
  });

  it("ne juge pas les recettes sans avancement connu ni sans objectif", () => {
    expect(
      postesASurveiller([], [ligne("r1", "Calendrier", 1000, 0)], null),
    ).toEqual([]);
    expect(
      postesASurveiller([], [ligne("r1", "Calendrier", 0, 0)], 90),
    ).toEqual([]);
  });

  it("ne signale aucune recette en retard avant le début de l'année", () => {
    expect(
      postesASurveiller([], [ligne("r1", "Calendrier", 1000, 0)], 0),
    ).toEqual([]);
  });

  it("trie par gravité puis par montant concerné", () => {
    const resultat = postesASurveiller(
      [
        ligne("d1", "Petit dépassement", 100, 110),
        ligne("d2", "Gros dépassement", 100, 400),
        ligne("d3", "Presque", 100, 90),
      ],
      [ligne("r1", "Calendrier", 1000, 0)],
      80,
    );

    expect(resultat.map((poste) => poste.label)).toEqual([
      "Gros dépassement",
      "Petit dépassement",
      "Calendrier",
      "Presque",
    ]);
  });
});

describe("comparerAvecPrecedente", () => {
  it("compare le réalisé de chaque poste à celui de l'année précédente", () => {
    const resultat = comparerAvecPrecedente(
      [ligne("d1", "Camp", 1000, 400), ligne("d2", "Matériel", 200, 250)],
      [ligne("d1", "Camp", 900, 500), ligne("d2", "Matériel", 0, 0)],
    );

    expect(resultat[0]).toMatchObject({
      label: "Camp",
      realisePrecedent: 500,
      evolution: -100,
      evolutionPourcentage: -20,
    });
    // N-1 à zéro : évolution en montant, pas de pourcentage.
    expect(resultat[1]).toMatchObject({
      realisePrecedent: 0,
      evolution: 250,
      evolutionPourcentage: null,
    });
  });

  it("laisse les valeurs inconnues quand l'année précédente est indisponible", () => {
    const [premier] = comparerAvecPrecedente(
      [ligne("d1", "Camp", 1000, 400)],
      null,
    );

    expect(premier).toMatchObject({
      realisePrecedent: null,
      evolution: null,
      evolutionPourcentage: null,
    });
  });

  it("ne suppose rien pour un poste absent de l'année précédente", () => {
    const [premier] = comparerAvecPrecedente(
      [ligne("d9", "Nouveau", 100, 40)],
      [ligne("d1", "Camp", 100, 50)],
    );

    expect(premier.realisePrecedent).toBeNull();
    expect(premier.evolution).toBeNull();
  });

  it("rapproche « Non affecté » par son libellé et le garde visible s'il n'existe qu'en N-1", () => {
    const avec = comparerAvecPrecedente(
      [ligne(null, "Non affecté", null, 35)],
      [ligne(null, "Non affecté", null, 70)],
    );
    expect(avec[0]).toMatchObject({ realisePrecedent: 70, evolution: -35 });

    const seulementPrecedent = comparerAvecPrecedente(
      [ligne("d1", "Camp", 100, 10)],
      [ligne("d1", "Camp", 100, 10), ligne(null, "Non affecté", null, 70)],
    );
    expect(seulementPrecedent[seulementPrecedent.length - 1]).toMatchObject({
      label: "Non affecté",
      realise: 0,
      realisePrecedent: 70,
      evolution: -70,
    });
  });

  it("compte « Non affecté » à zéro en N-1 quand il n'y en avait pas", () => {
    const [premier] = comparerAvecPrecedente(
      [ligne(null, "Non affecté", null, 35)],
      [ligne("d1", "Camp", 100, 10)],
    );

    expect(premier).toMatchObject({ realisePrecedent: 0, evolution: 35 });
  });
});
