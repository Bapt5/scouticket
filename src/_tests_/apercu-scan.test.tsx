import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ extraireJustificatif: vi.fn() }));

vi.mock("@/lib/scanJustificatif", () => ({
  coinsParDefaut: () => ({}),
  estErreurAnnulation: () => false,
  extraireJustificatif: mocks.extraireJustificatif,
}));
vi.mock("@/components/EditeurCoins", () => ({
  EditeurCoins: () => <div>Éditeur de coins</div>,
}));

import { ApercuScan } from "@/components/ApercuScan";

const image = { naturalWidth: 10, naturalHeight: 10 } as HTMLImageElement;
const fichier = new File(["png"], "ticket.png", { type: "image/png" });
const coins = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 1, y: 0 },
  bottomRight: { x: 1, y: 1 },
  bottomLeft: { x: 0, y: 1 },
};

describe("ApercuScan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => "blob:apercu");
    URL.revokeObjectURL = vi.fn();
    mocks.extraireJustificatif.mockResolvedValue(
      new File(["jpg"], "ticket.jpg", { type: "image/jpeg" }),
    );
  });

  it("signale en jaune qu'il faut ajuster les coins quand rien n'est détecté", () => {
    render(
      <ApercuScan
        fichierOriginal={fichier}
        image={image}
        coinsDetectes={null}
        onDecision={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "n'a pas pu être détecté automatiquement",
    );
    expect(screen.getByText("Éditeur de coins")).toBeInTheDocument();
  });

  it("n'affiche aucun avertissement quand le justificatif est détecté", async () => {
    const onDecision = vi.fn();
    render(
      <ApercuScan
        fichierOriginal={fichier}
        image={image}
        coinsDetectes={coins}
        onDecision={onDecision}
      />,
    );

    const utiliser = await screen.findByRole("button", {
      name: "Utiliser le recadrage",
    });
    expect(screen.queryByText(/pas pu être détecté/)).not.toBeInTheDocument();
    await userEvent.click(utiliser);
    expect(onDecision).toHaveBeenCalledWith({
      type: "fichier",
      fichier: expect.any(File),
    });
  });
});
