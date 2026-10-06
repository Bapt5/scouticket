import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PilotageBudget } from "@/components/PilotageBudget";
import type { LigneSuiviBudget } from "@/lib/budget";

// Recharts mesure le DOM : le rendu des graphiques est testé à part.
vi.mock("@/components/GraphiquesPilotage", () => ({
  GraphiqueComparaison: ({ lignes }: { lignes: unknown[] }) => (
    <div data-testid="comparaison">{lignes.length} postes</div>
  ),
}));

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

const afficher = (
  surcharges: Partial<Parameters<typeof PilotageBudget>[0]> = {},
) => {
  const onOuvrirPoste = vi.fn();
  render(
    <PilotageBudget
      depense={DEPENSES}
      recette={RECETTES}
      du="2025-09-01"
      au="2026-08-31"
      aujourdhui="2026-03-01"
      libelleAnnee="2025-2026"
      libelleAnneePrecedente="2024-2025"
      precedente={null}
      erreurPrecedente={false}
      onOuvrirPoste={onOuvrirPoste}
      {...surcharges}
    />,
  );
  return onOuvrirPoste;
};

describe("PilotageBudget : cartes de synthèse", () => {
  it("affiche prévu, réalisé, écart favorable et taux des recettes", () => {
    afficher();

    const carte = screen.getByRole("region", { name: "Recettes" });
    expect(carte).toHaveTextContent("Prévu800,00");
    expect(carte).toHaveTextContent("Réalisé850,00");
    expect(carte).toHaveTextContent("+50,00");
    expect(carte).toHaveTextContent("(favorable)");
    expect(carte).toHaveTextContent("106,3 %");
  });

  it("compte comme favorable une dépense inférieure au budget", () => {
    afficher();

    const carte = screen.getByRole("region", { name: "Dépenses" });
    expect(carte).toHaveTextContent("Prévu");
    expect(carte).toHaveTextContent("+515,00");
    expect(carte).toHaveTextContent("(favorable)");
    expect(carte).toHaveTextContent("57,1 %");
  });

  it("signale en toutes lettres un dépassement de dépenses comme défavorable", () => {
    afficher({ depense: [ligne("d1", "Camp", 100, 300)], recette: [] });

    const carte = screen.getByRole("region", { name: "Dépenses" });
    expect(carte).toHaveTextContent("-200,00");
    expect(carte).toHaveTextContent("(défavorable)");
  });

  it("affiche le résultat prévu et réalisé et son écart", () => {
    afficher();

    const carte = screen.getByRole("region", { name: "Résultat" });
    expect(carte).toHaveTextContent("Prévu-400,00");
    expect(carte).toHaveTextContent("Réalisé165,00");
    expect(carte).toHaveTextContent(/\+565,00\s€\s*\(favorable\)/);
    expect(carte).not.toHaveTextContent("déficit");
  });

  it("signale un résultat réalisé négatif par du texte (déficit)", () => {
    afficher({
      depense: [ligne("d1", "Camp", 100, 500)],
      recette: [ligne("r1", "Calendrier", 100, 100)],
    });

    expect(screen.getByRole("region", { name: "Résultat" })).toHaveTextContent(
      /-400,00\s€\s*\(déficit\)/,
    );
  });

  it("invite à saisir les budgets quand aucun n'existe, sans prévu ni écart", () => {
    afficher({
      depense: [ligne("d1", "Camp", null, 40)],
      recette: [ligne("r1", "Calendrier", null, 100)],
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Aucun budget n’est saisi pour cette année comptable",
    );
    const resultat = screen.getByRole("region", { name: "Résultat" });
    expect(resultat).toHaveTextContent("Prévu-");
    expect(resultat).toHaveTextContent("Réalisé60,00");
    expect(resultat).toHaveTextContent("Écart-");
  });

  it("indique le nombre de postes sans budget", () => {
    afficher();

    expect(screen.getByText(/1 poste sans budget saisi/)).toBeInTheDocument();
  });

  it("n'affiche pas ce rappel quand tous les postes ont un budget", () => {
    afficher({ depense: [ligne("d1", "Camp", 100, 10)], recette: [] });

    expect(screen.queryByText(/sans budget saisi/)).not.toBeInTheDocument();
  });
});

describe("PilotageBudget : avancement", () => {
  it("affiche l'avancement de l'année et la consommation des budgets", () => {
    afficher();

    const annee = screen.getByRole("progressbar", {
      name: "Année comptable écoulée",
    });
    expect(annee).toHaveAttribute("aria-valuetext", "49,9 %");
    expect(annee).toHaveAttribute("aria-valuenow", "50");
    const depenses = screen.getByRole("progressbar", {
      name: "Budget de dépenses consommé",
    });
    expect(depenses.getAttribute("aria-valuetext")).toMatch(
      /^57,1 % \(685,00.* sur 1\s200,00/,
    );
    const recettes = screen.getByRole("progressbar", {
      name: "Objectif de recettes atteint",
    });
    expect(recettes.getAttribute("aria-valuetext")).toMatch(/^106,3 %/);
    // La barre est bornée à 100 même quand l'objectif est dépassé.
    expect(recettes).toHaveAttribute("aria-valuenow", "100");
  });

  it("explique l'absence de budget plutôt que d'afficher 0 %", () => {
    afficher({
      depense: [ligne("d1", "Camp", null, 10)],
      recette: [ligne("r1", "Calendrier", null, 10)],
    });

    expect(
      screen.getByText("Aucun budget de dépenses saisi"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Aucun objectif de recettes saisi"),
    ).toBeInTheDocument();
  });

  it("gère une date du jour invalide sans planter", () => {
    afficher({ aujourdhui: "n'importe quoi" });

    expect(
      screen.getByRole("progressbar", { name: "Année comptable écoulée" }),
    ).toHaveAttribute("aria-valuetext", "-");
  });
});

describe("PilotageBudget : postes à surveiller", () => {
  it("liste les postes avec leur statut en toutes lettres", () => {
    afficher();

    const liste = screen.getByRole("region", { name: "Postes à surveiller" });
    const elements = within(liste).getAllByRole("listitem");
    expect(elements).toHaveLength(1);
    expect(elements[0]).toHaveTextContent("Matériel");
    expect(elements[0]).toHaveTextContent("(dépense)");
    expect(elements[0]).toHaveTextContent("Budget dépassé");
    expect(elements[0]).toHaveTextContent("250,00");
    expect(elements[0]).toHaveTextContent("125 %");
  });

  it("signale une recette en retard sur l'avancement de l'année", () => {
    afficher({
      depense: [],
      recette: [ligne("r1", "Calendrier", 300, 30)],
    });

    expect(screen.getByText("En retard sur l'objectif")).toBeInTheDocument();
  });

  it("affiche « Rien à signaler » quand tout est dans les clous", () => {
    afficher({
      depense: [ligne("d1", "Camp", 1000, 100)],
      recette: [ligne("r1", "Calendrier", 100, 60)],
    });

    expect(screen.getByText("Rien à signaler.")).toBeInTheDocument();
  });

  it("ouvre le détail du poste au clic", async () => {
    const onOuvrirPoste = afficher();

    await userEvent
      .setup()
      .click(
        within(
          screen.getByRole("region", { name: "Postes à surveiller" }),
        ).getByRole("button", { name: /Matériel/ }),
      );

    expect(onOuvrirPoste).toHaveBeenCalledWith({
      id: "d2",
      label: "Matériel",
      domaine: "depense",
    });
  });
});

describe("PilotageBudget : comparaison avec l'année précédente", () => {
  const precedente = {
    depense: [
      ligne("d1", "Camp", 900, 500),
      ligne("d2", "Matériel", 0, 0),
      ligne("d3", "Formation", null, 0),
    ],
    recette: [
      ligne("r1", "Calendrier", 300, 100),
      ligne("r2", "Subventions", 500, 700),
    ],
  };

  it("annonce le chargement tant que l'année précédente n'est pas là", () => {
    afficher();

    expect(
      screen.getByRole("heading", { name: "Comparaison avec 2024-2025" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Chargement…")).toBeInTheDocument();
    expect(screen.queryByTestId("comparaison")).not.toBeInTheDocument();
  });

  it("isole l'erreur de chargement à cette section", () => {
    afficher({ erreurPrecedente: true });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Comparaison indisponible : l’année 2024-2025 n’a pas pu être chargée.",
    );
    // Le reste du pilotage reste affiché.
    expect(
      screen.getByRole("region", { name: "Résultat" }),
    ).toBeInTheDocument();
  });

  it("compare le réalisé de chaque poste de dépenses avec N-1", () => {
    afficher({ precedente });

    expect(screen.getByTestId("comparaison")).toHaveTextContent("4 postes");
    const tableau = screen.getByRole("table", {
      name: "Réalisé de 2025-2026 comparé à 2024-2025",
    });
    const camp = within(tableau).getByRole("row", { name: /Camp/ });
    expect(camp).toHaveTextContent("400,00");
    expect(camp).toHaveTextContent("500,00");
    expect(camp).toHaveTextContent(/-100,00\s€\s\(-20\s%\)/);
    // N-1 à zéro : évolution en montant, sans pourcentage.
    const materiel = within(tableau).getByRole("row", { name: /Matériel/ });
    expect(materiel).toHaveTextContent("+250,00");
    expect(materiel).not.toHaveTextContent("%");
  });

  it("bascule sur les postes de recettes", async () => {
    afficher({ precedente });

    await userEvent
      .setup()
      .click(screen.getByRole("tab", { name: "Recettes" }));

    const tableau = screen.getByRole("table", {
      name: "Réalisé de 2025-2026 comparé à 2024-2025",
    });
    expect(
      within(tableau).getByRole("row", { name: /Calendrier/ }),
    ).toHaveTextContent(/\+50,00\s€\s\(\+50\s%\)/);
    expect(within(tableau).queryByText("Camp")).not.toBeInTheDocument();
  });

  it("affiche un tiret pour un poste absent de l'année précédente", () => {
    afficher({
      precedente: { depense: [ligne("d1", "Camp", 900, 500)], recette: [] },
    });

    const materiel = within(
      screen.getByRole("table", {
        name: "Réalisé de 2025-2026 comparé à 2024-2025",
      }),
    ).getByRole("row", { name: /Matériel/ });
    expect(materiel).toHaveTextContent(/250,00\s€-/);
  });
});
