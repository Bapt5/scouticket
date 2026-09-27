import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SelecteurMoyensPaiement } from "@/components/SelecteurMoyensPaiement";

const rendre = (valeur: string[], onChange = vi.fn()) => {
  render(
    <SelecteurMoyensPaiement
      id="moyens"
      libelle="Moyens de paiement du groupe"
      valeur={valeur}
      onChange={onChange}
    />,
  );
  return onChange;
};

describe("SelecteurMoyensPaiement", () => {
  it("affiche les moyens existants avec une poubelle pour les retirer", async () => {
    const onChange = rendre(["Espèces du groupe", "Virement du groupe"]);
    const utilisateur = userEvent.setup();

    expect(screen.getByText("Espèces du groupe")).toBeInTheDocument();
    await utilisateur.click(
      screen.getByRole("button", { name: "Retirer Virement du groupe" }),
    );

    expect(onChange).toHaveBeenCalledWith(["Espèces du groupe"]);
  });

  it("empêche de retirer le dernier moyen de paiement", () => {
    rendre(["Espèces du groupe"]);

    expect(
      screen.getByRole("button", { name: "Retirer Espèces du groupe" }),
    ).toBeDisabled();
  });

  it("propose d'ajouter un moyen saisi qui n'existe pas encore", async () => {
    const onChange = rendre(["Espèces du groupe"]);
    const utilisateur = userEvent.setup();

    const champ = screen.getByLabelText("Moyens de paiement du groupe");
    expect(screen.getByRole("button", { name: "Ajouter" })).toBeDisabled();

    await utilisateur.type(champ, "Cagnotte en ligne");
    const bouton = screen.getByRole("button", { name: "Ajouter" });
    expect(bouton).toBeEnabled();
    await utilisateur.click(bouton);

    expect(onChange).toHaveBeenCalledWith([
      "Espèces du groupe",
      "Cagnotte en ligne",
    ]);
  });

  it("refuse un doublon (accents et casse ignorés)", async () => {
    rendre(["Espèces du groupe"]);
    const utilisateur = userEvent.setup();

    const champ = screen.getByLabelText("Moyens de paiement du groupe");
    await utilisateur.type(champ, "especes du groupe");

    expect(screen.getByRole("button", { name: "Ajouter" })).toBeDisabled();
    expect(
      screen.getByText("Ce moyen de paiement existe déjà."),
    ).toBeInTheDocument();
  });

  it("ajoute au clavier avec Entrée", async () => {
    const onChange = rendre(["Espèces du groupe"]);
    const utilisateur = userEvent.setup();

    const champ = screen.getByLabelText("Moyens de paiement du groupe");
    await utilisateur.type(champ, "Cagnotte en ligne{Enter}");

    expect(onChange).toHaveBeenCalledWith([
      "Espèces du groupe",
      "Cagnotte en ligne",
    ]);
  });
});
