import { cloneElement, type ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GraphiquesBudget } from "@/components/GraphiquesBudget";
import type { LigneSuiviBudget } from "@/lib/budget";

// jsdom ne mesure pas le DOM : le conteneur adaptatif reçoit une taille fixe.
vi.mock("recharts", async (importOriginal) => {
  const reel = await importOriginal<typeof import("recharts")>();
  return {
    ...reel,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(
        children as ReactElement<{ width: number; height: number }>,
        {
          width: 600,
          height: 300,
        },
      ),
  };
});

const ligne = (surcharge: Partial<LigneSuiviBudget>): LigneSuiviBudget => ({
  id: "p1",
  label: "Camp",
  budget: 1000,
  realise: 400,
  ...surcharge,
});

describe("GraphiquesBudget", () => {
  it("affiche les camemberts du prévu et du réalisé et le graphique en barres", () => {
    const { container } = render(
      <GraphiquesBudget
        lignes={[
          ligne({}),
          ligne({ id: "p2", label: "Matériel", budget: 200, realise: 250 }),
        ]}
      />,
    );

    expect(screen.getByText("Répartition du prévu")).toBeInTheDocument();
    expect(screen.getByText("Répartition du réalisé")).toBeInTheDocument();
    expect(screen.getByText("Prévu et réalisé par poste")).toBeInTheDocument();
    // Chaque graphique est décrit pour les lecteurs d'écran.
    expect(
      screen.getAllByRole("img", { name: "Répartition du prévu" }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("img", { name: "Prévu et réalisé par poste" }),
    ).toHaveLength(1);
    // Deux camemberts : une part par poste ; deux séries de barres (prévu, réalisé).
    expect(container.querySelectorAll(".recharts-pie-sector")).toHaveLength(4);
    expect(container.querySelectorAll(".recharts-bar")).toHaveLength(2);
  });

  it("n'inclut dans un camembert que les postes ayant une valeur", () => {
    const { container } = render(
      <GraphiquesBudget
        lignes={[
          ligne({ budget: null, realise: 400 }),
          ligne({ id: "p2", label: "Matériel", budget: 200, realise: 0 }),
        ]}
      />,
    );

    // Prévu : Matériel seul ; réalisé : Camp seul.
    expect(container.querySelectorAll(".recharts-pie-sector")).toHaveLength(2);
  });

  it("affiche « Aucune donnée. » pour un camembert sans valeur", () => {
    render(
      <GraphiquesBudget
        lignes={[
          ligne({ budget: null, realise: 0 }),
          ligne({ id: "p2", budget: null, realise: 0 }),
        ]}
      />,
    );

    expect(screen.getAllByText("Aucune donnée.")).toHaveLength(2);
  });
});
