import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SelecteurCategorie } from "@/components/SelecteurCategorie";
import { CATEGORIES_COMPTABLES } from "@/constants/configDepenses";

describe("SelecteurCategorie (mobile)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const rendre = (onChange = vi.fn()) => {
    render(
      <SelecteurCategorie
        id="cat"
        libelle="Catégorie comptable *"
        valeur=""
        onChange={onChange}
      />,
    );
    return onChange;
  };

  it("ouvre la feuille plein écran au clic", () => {
    rendre();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByLabelText("Catégorie comptable *"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(
      CATEGORIES_COMPTABLES.length,
    );
  });

  it("filtre, choisit et ferme la feuille", () => {
    const onChange = rendre();
    fireEvent.click(screen.getByLabelText("Catégorie comptable *"));
    const cible = CATEGORIES_COMPTABLES[0].libelle;
    fireEvent.change(screen.getByLabelText("Rechercher une catégorie"), {
      target: { value: cible },
    });
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(onChange).toHaveBeenCalledWith(cible);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("se ferme avec Échap", () => {
    rendre();
    fireEvent.click(screen.getByLabelText("Catégorie comptable *"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
