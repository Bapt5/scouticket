import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditeurPostesBudgetaires } from "@/components/EditeurPostesBudgetaires";
import {
  NOMBRE_MAX_POSTES_PAR_DOMAINE,
  type PosteBrouillon,
} from "@/lib/budget";

const POSTES: PosteBrouillon[] = [
  { id: "p1", domaine: "depense", label: "Camp" },
  { id: "p2", domaine: "depense", label: "Matériel" },
  { id: "p3", domaine: "recette", label: "Calendrier" },
];

const afficher = (
  domaine: "depense" | "recette" = "depense",
  postes = POSTES,
  desactive = false,
) => {
  const onChange = vi.fn();
  render(
    <EditeurPostesBudgetaires
      domaine={domaine}
      postes={postes}
      onChange={onChange}
      desactive={desactive}
    />,
  );
  return onChange;
};

describe("EditeurPostesBudgetaires", () => {
  it("n'affiche que les postes du domaine édité", () => {
    afficher("recette");

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByLabelText("Nom du poste 1")).toHaveValue("Calendrier");
  });

  it("renomme un poste en conservant son id et les autres domaines", async () => {
    const onChange = afficher();
    const champ = screen.getByLabelText("Nom du poste 1");

    await userEvent.setup().type(champ, "!");

    expect(onChange).toHaveBeenLastCalledWith([
      { id: "p3", domaine: "recette", label: "Calendrier" },
      { id: "p1", domaine: "depense", label: "Camp!" },
      { id: "p2", domaine: "depense", label: "Matériel" },
    ]);
  });

  it("ajoute un poste vide sans id dans le domaine édité", async () => {
    const onChange = afficher("recette");

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Ajouter un poste" }));

    expect(onChange).toHaveBeenCalledWith([
      { id: "p1", domaine: "depense", label: "Camp" },
      { id: "p2", domaine: "depense", label: "Matériel" },
      { id: "p3", domaine: "recette", label: "Calendrier" },
      { id: null, domaine: "recette", label: "" },
    ]);
  });

  it("supprime un poste", async () => {
    const onChange = afficher();

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Supprimer Camp" }));

    expect(onChange).toHaveBeenCalledWith([
      { id: "p3", domaine: "recette", label: "Calendrier" },
      { id: "p2", domaine: "depense", label: "Matériel" },
    ]);
  });

  it("réordonne les postes", async () => {
    const onChange = afficher();

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Descendre Camp" }));

    const [liste] = onChange.mock.calls[0];
    expect(
      liste
        .filter((poste: PosteBrouillon) => poste.domaine === "depense")
        .map((poste: PosteBrouillon) => poste.label),
    ).toEqual(["Matériel", "Camp"]);
  });

  it("ne permet pas de sortir de la liste en montant le premier ou en descendant le dernier", () => {
    afficher();

    expect(screen.getByRole("button", { name: "Monter Camp" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Descendre Matériel" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Descendre Camp" }),
    ).toBeEnabled();
  });

  it("limite le nombre de postes par domaine", () => {
    afficher(
      "depense",
      Array.from({ length: NOMBRE_MAX_POSTES_PAR_DOMAINE }, (_, i) => ({
        id: `p${i}`,
        domaine: "depense" as const,
        label: `Poste ${i}`,
      })),
    );

    expect(
      screen.getByRole("button", { name: "Ajouter un poste" }),
    ).toBeDisabled();
  });

  it("désactive toutes les actions pendant l'enregistrement", () => {
    afficher("depense", POSTES, true);

    expect(screen.getByLabelText("Nom du poste 1")).toBeDisabled();
    for (const bouton of screen.getAllByRole("button"))
      expect(bouton).toBeDisabled();
  });
});
