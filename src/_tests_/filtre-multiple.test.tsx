import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FiltreMultiple } from "@/components/FiltreMultiple";

const options = [
  { id: "a", libelle: "Louveteaux", couleur: "#111111" },
  { id: "b", libelle: "Éclaireurs", couleur: "#222222" },
  { id: "c", libelle: "Pionniers", couleur: "#333333" },
];

const afficher = (valeur: string[] | null) => {
  const surChangement = vi.fn();
  render(
    <FiltreMultiple
      libelle="Filtrer par unité"
      options={options}
      valeur={valeur}
      onChange={surChangement}
      libelleTous="Toutes les unités"
      libelleAucun="Aucune unité"
      libelleNombre={(nombre) => `${nombre} unités`}
    />,
  );
  return surChangement;
};

const ouvrir = () =>
  userEvent.click(screen.getByRole("button", { name: "Filtrer par unité" }));

describe("FiltreMultiple", () => {
  it("résume la sélection", () => {
    afficher(["a", "b"]);
    expect(screen.getByText("2 unités")).toBeTruthy();
  });

  it("affiche toutes les unités quand aucune restriction", () => {
    afficher(null);
    expect(screen.getByText("Toutes les unités")).toBeTruthy();
  });

  it("décocher une option depuis « tout » restreint aux autres", async () => {
    const surChangement = afficher(null);
    await ouvrir();

    await userEvent.click(screen.getByRole("button", { name: /Éclaireurs/ }));

    expect(surChangement).toHaveBeenCalledWith(["a", "c"]);
  });

  it("recocher la dernière option manquante revient à ne pas filtrer", async () => {
    const surChangement = afficher(["a", "b"]);
    await ouvrir();

    await userEvent.click(screen.getByRole("button", { name: /Pionniers/ }));

    expect(surChangement).toHaveBeenCalledWith(null);
  });

  it("« Tout sélectionner » désélectionne tout quand tout est coché", async () => {
    const surChangement = afficher(null);
    await ouvrir();

    const tout = screen.getByRole("checkbox", { name: /Tout sélectionner/ });
    expect(tout.getAttribute("aria-checked")).toBe("true");
    await userEvent.click(tout);

    expect(surChangement).toHaveBeenCalledWith([]);
  });

  it("« Tout sélectionner » sélectionne tout depuis une sélection minoritaire ou vide", async () => {
    const surChangement = afficher(["a"]);
    await ouvrir();

    const tout = screen.getByRole("checkbox", { name: /Tout sélectionner/ });
    expect(tout.getAttribute("aria-checked")).toBe("mixed");
    await userEvent.click(tout);

    expect(surChangement).toHaveBeenCalledWith(null);
  });

  it("une sélection vide s'affiche comme « Aucune »", () => {
    afficher([]);
    expect(screen.getByText("Aucune unité")).toBeTruthy();
  });

  it("se ferme avec Échap", async () => {
    afficher(null);
    await ouvrir();
    expect(
      screen.getByRole("group", { name: "Filtrer par unité" }),
    ).toBeTruthy();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("group")).toBeNull();
  });
});
