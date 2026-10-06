import { cloneElement, type ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GraphiqueComparaison } from "@/components/GraphiquesPilotage";
import type { LigneComparaison } from "@/lib/budgetPilotage";

// jsdom ne mesure pas le DOM : le conteneur adaptatif reçoit une taille fixe.
vi.mock("recharts", async (importOriginal) => {
  const reel = await importOriginal<typeof import("recharts")>();
  return {
    ...reel,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      cloneElement(
        children as ReactElement<{ width: number; height: number }>,
        { width: 800, height: 400 },
      ),
  };
});

const comparaison = (
  surcharge: Partial<LigneComparaison>,
): LigneComparaison => ({
  id: "p1",
  label: "Camp",
  budget: 1000,
  realise: 400,
  realisePrecedent: 500,
  evolution: -100,
  evolutionPourcentage: -20,
  ...surcharge,
});

describe("GraphiqueComparaison", () => {
  it("décrit la comparaison avec les deux années et trace trois séries", () => {
    const { container } = render(
      <GraphiqueComparaison
        lignes={[comparaison({}), comparaison({ id: "p2", label: "Matériel" })]}
        libelleAnnee="2025-2026"
        libelleAnneePrecedente="2024-2025"
      />,
    );

    expect(
      screen.getByRole("img", {
        name: "Comparaison du réalisé 2025-2026 avec 2024-2025",
      }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".recharts-bar")).toHaveLength(3);
    expect(screen.getByText("Réalisé 2024-2025")).toBeInTheDocument();
    expect(screen.getByText("Prévu 2025-2026")).toBeInTheDocument();
  });

  it("traite une valeur N-1 inconnue comme zéro dans le graphique", () => {
    const { container } = render(
      <GraphiqueComparaison
        lignes={[
          comparaison({
            realisePrecedent: null,
            evolution: null,
            evolutionPourcentage: null,
          }),
        ]}
        libelleAnnee="2025"
        libelleAnneePrecedente="2024"
      />,
    );

    expect(container.querySelectorAll(".recharts-bar")).toHaveLength(3);
  });
});
