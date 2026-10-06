import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChampDebutAnneeComptable } from "@/components/ChampDebutAnneeComptable";

describe("ChampDebutAnneeComptable", () => {
  it("explique pourquoi le 29 février est refusé", () => {
    render(
      <ChampDebutAnneeComptable
        valeur={{ mois: 2, jour: 29 }}
        onChange={vi.fn()}
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
      <ChampDebutAnneeComptable
        valeur={{ mois: 1, jour: 31 }}
        onChange={onChange}
      />,
    );

    await userEvent
      .setup()
      .selectOptions(
        screen.getByLabelText("Mois de début de l'année comptable"),
        "février",
      );

    expect(onChange).toHaveBeenCalledWith({ mois: 2, jour: 28 });
  });

  it("laisse effacer le jour puis retaper 31 sans « 0 » parasite", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ChampDebutAnneeComptable
        valeur={{ mois: 1, jour: 1 }}
        onChange={onChange}
      />,
    );
    const champ = screen.getByLabelText(
      "Jour de début de l'année comptable",
    ) as HTMLInputElement;

    await userEvent.setup().clear(champ);
    expect(onChange).toHaveBeenLastCalledWith({
      mois: 1,
      jour: Number.NaN,
    });

    rerender(
      <ChampDebutAnneeComptable
        valeur={{ mois: 1, jour: Number.NaN }}
        onChange={onChange}
      />,
    );
    expect(champ.value).toBe("");
    expect(screen.getByText("Saisissez un jour valide")).toBeTruthy();
  });

  it("désactive les champs quand demandé", () => {
    render(
      <ChampDebutAnneeComptable
        valeur={{ mois: 9, jour: 1 }}
        onChange={vi.fn()}
        desactive
      />,
    );

    expect(
      (
        screen.getByLabelText(
          "Jour de début de l'année comptable",
        ) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByLabelText(
          "Mois de début de l'année comptable",
        ) as HTMLSelectElement
      ).disabled,
    ).toBe(true);
  });
});
