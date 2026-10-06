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
  it("affiche un aperçu du format saisi, daté d'aujourd'hui", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2027, 10, 20, 12));
    render(
      <EditeurNomenclature
        valeur={valeur}
        onChange={vi.fn()}
        anneeComptableCourante={2025}
      />,
    );

    expect(screen.getByText("2027 - Louveteaux - 01.pdf")).toBeTruthy();
    expect(screen.getByText("2027 - Louveteaux - 02.jpg")).toBeTruthy();
    vi.useRealTimers();
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

  it("ne propose plus le début de l'année comptable, réglé dans les paramètres du groupe", () => {
    render(
      <EditeurNomenclature
        valeur={valeur}
        onChange={vi.fn()}
        anneeComptableCourante={2025}
      />,
    );

    expect(
      screen.queryByLabelText("Jour de début de l'année comptable"),
    ).toBeNull();
    expect(
      screen.queryByLabelText("Mois de début de l'année comptable"),
    ).toBeNull();
    const lien = screen.getByRole("link", { name: "paramètres du groupe" });
    expect(lien.getAttribute("href")).toBe("/parametres-groupe");
    expect(screen.getByText(/1er septembre/)).toBeTruthy();
  });

  it("explique le chevauchement et la reprise de numérotation dans des infobulles", () => {
    render(
      <EditeurNomenclature
        valeur={valeur}
        onChange={vi.fn()}
        anneeComptableCourante={2025}
      />,
    );

    const infobulles = screen
      .getAllByRole("tooltip", { hidden: true })
      .map((infobulle) => infobulle.textContent);
    expect(infobulles).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/chevauche deux années civiles/),
        expect.stringMatching(/reprendre une numérotation existante/),
      ]),
    );
    expect(screen.queryByText(/\(chevauchement/)).toBeNull();
  });
});
