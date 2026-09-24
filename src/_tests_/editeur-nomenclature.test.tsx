import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  EditeurNomenclature,
  type BrouillonNomenclature,
} from "@/components/EditeurNomenclature";

const valeur: BrouillonNomenclature = {
  personnalise: true,
  format: "{YYYY} - {Branche} - {Numero}",
  anneeComptable: { mois: 9, jour: 1, format: "debut-fin" },
  prochainNumeroGlobal: "1",
  prochainNumeroComptable: "1",
};

describe("EditeurNomenclature", () => {
  it("affiche un aperçu du format saisi", () => {
    render(
      <EditeurNomenclature
        valeur={valeur}
        onChange={vi.fn()}
        anneeComptableCourante={2025}
      />,
    );

    expect(screen.getByText("2026 - Louveteaux - 01.pdf")).toBeTruthy();
    expect(screen.getByText("2026 - Louveteaux - 02.jpg")).toBeTruthy();
  });

  it("signale un format invalide", () => {
    render(
      <EditeurNomenclature
        valeur={{ ...valeur, format: "{Inconnue}" }}
        onChange={vi.fn()}
        anneeComptableCourante={2025}
      />,
    );

    expect(screen.getByRole("alert").textContent).toMatch(/inconnue/i);
  });

  it("insère une variable au clic sur son bouton", async () => {
    const onChange = vi.fn();
    render(
      <EditeurNomenclature
        valeur={{ ...valeur, format: "" }}
        onChange={onChange}
        anneeComptableCourante={2025}
      />,
    );

    await userEvent.setup().click(screen.getByText("{Montant}"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ format: "{Montant}" }),
    );
  });

  it("propose les trois affichages d'année comptable qui se chevauchent", () => {
    render(
      <EditeurNomenclature
        valeur={valeur}
        onChange={vi.fn()}
        anneeComptableCourante={2023}
      />,
    );

    const options = screen
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual(
      expect.arrayContaining(["2023", "2024", "2023-2024"]),
    );
  });

  it("n'affiche pas les réglages quand la personnalisation est désactivée", () => {
    render(
      <EditeurNomenclature
        valeur={{ ...valeur, personnalise: false }}
        onChange={vi.fn()}
        anneeComptableCourante={2025}
      />,
    );

    expect(screen.queryByLabelText("Format du nom")).toBeNull();
  });

  it("pré-remplit l'ancien nom à l'activation de la personnalisation", async () => {
    const onChange = vi.fn();
    render(
      <EditeurNomenclature
        valeur={{ ...valeur, personnalise: false, format: "" }}
        onChange={onChange}
        anneeComptableCourante={2025}
      />,
    );

    await userEvent.setup().click(screen.getByRole("checkbox"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        personnalise: true,
        format:
          "{YYYY}-{MM}-{DD} - {Branche} - {Type} - {ModePaiement} - {Montant}",
      }),
    );
  });

  it("explique pourquoi le 29 février est refusé", () => {
    render(
      <EditeurNomenclature
        valeur={{
          ...valeur,
          anneeComptable: { mois: 2, jour: 29, format: "debut-fin" },
        }}
        onChange={vi.fn()}
        anneeComptableCourante={2025}
      />,
    );

    expect(screen.getByText(/29 février n'est pas accepté/)).toBeTruthy();
    expect(
      screen
        .getByLabelText("Jour de début de l'année comptable")
        .getAttribute("max"),
    ).toBe("28");
  });

  it("ramène le jour dans le mois quand on choisit février", async () => {
    const onChange = vi.fn();
    render(
      <EditeurNomenclature
        valeur={{
          ...valeur,
          anneeComptable: { mois: 1, jour: 31, format: "debut-fin" },
        }}
        onChange={onChange}
        anneeComptableCourante={2025}
      />,
    );

    await userEvent
      .setup()
      .selectOptions(
        screen.getByLabelText("Mois de début de l'année comptable"),
        "février",
      );

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        anneeComptable: expect.objectContaining({ mois: 2, jour: 28 }),
      }),
    );
  });
});
