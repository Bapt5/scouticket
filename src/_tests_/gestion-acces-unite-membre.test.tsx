import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GestionAccesUniteMembre } from "@/components/GestionAccesUniteMembre";

const membre = {
  id: "member_1",
  nom: "Camille Test",
  email: "camille@example.test",
  role: "member",
};

describe("GestionAccesUniteMembre", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("affiche les unités et permet de sauvegarder la sélection", async () => {
    const utilisateur = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            accesTotal: false,
            unites: [
              { id: "farfadets", label: "Farfadets", color: "#6CC24A" },
              { id: "groupe", label: "Groupe", color: "#1E3A8A" },
            ],
            uniteIdsAutorisees: ["farfadets"],
          }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GestionAccesUniteMembre
        membre={membre}
        onClose={vi.fn()}
        onMembreRetire={vi.fn()}
      />,
    );

    expect(await screen.findByText("Farfadets")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Farfadets" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Groupe" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await utilisateur.click(screen.getByRole("button", { name: "Groupe" }));
    await utilisateur.click(
      screen.getByRole("button", { name: /Enregistrer les accès/ }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, optionsPatch] = fetchMock.mock.calls[1];
    expect(optionsPatch.method).toBe("PATCH");
    expect(JSON.parse(optionsPatch.body).uniteIds.sort()).toEqual([
      "farfadets",
      "groupe",
    ]);
    expect(await screen.findByText("Accès enregistrés.")).toBeInTheDocument();
  });

  it("« Tout sélectionner » bascule selon la majorité cochée", async () => {
    const utilisateur = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          accesTotal: false,
          unites: [
            { id: "a", label: "A", color: "#6CC24A" },
            { id: "b", label: "B", color: "#F28C00" },
            { id: "c", label: "C", color: "#0072CE" },
            { id: "d", label: "D", color: "#E30613" },
          ],
          // Minorité cochée (1/4) au départ.
          uniteIdsAutorisees: ["a"],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GestionAccesUniteMembre
        membre={membre}
        onClose={vi.fn()}
        onMembreRetire={vi.fn()}
      />,
    );
    await screen.findByText("A");

    const toutSelectionner = screen.getByRole("checkbox", {
      name: "Tout sélectionner",
    });
    expect(toutSelectionner).toHaveAttribute("aria-checked", "mixed");

    // Minorité cochée : un clic sélectionne tout.
    await utilisateur.click(toutSelectionner);
    expect(toutSelectionner).toHaveAttribute("aria-checked", "true");
    for (const nom of ["A", "B", "C", "D"])
      expect(screen.getByRole("button", { name: nom })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

    // Tout coché (majorité) : un clic désélectionne tout.
    await utilisateur.click(toutSelectionner);
    expect(toutSelectionner).toHaveAttribute("aria-checked", "false");
    for (const nom of ["A", "B", "C", "D"])
      expect(screen.getByRole("button", { name: nom })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
  });

  it("n’affiche aucune case pour un membre responsable", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          accesTotal: true,
          unites: [{ id: "groupe", label: "Groupe", color: "#1E3A8A" }],
          uniteIdsAutorisees: ["groupe"],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GestionAccesUniteMembre
        membre={{ ...membre, role: "owner" }}
        onClose={vi.fn()}
        onMembreRetire={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(/accès à toutes les unités/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Groupe" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Tout sélectionner" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Enregistrer/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Retirer l’utilisateur/ }),
    ).not.toBeInTheDocument();
  });

  it("retire un membre après confirmation", async () => {
    const utilisateur = userEvent.setup();
    const onMembreRetire = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            accesTotal: false,
            unites: [],
            uniteIdsAutorisees: [],
          }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GestionAccesUniteMembre
        membre={membre}
        onClose={vi.fn()}
        onMembreRetire={onMembreRetire}
      />,
    );

    await utilisateur.click(
      screen.getByRole("button", { name: "Retirer l’utilisateur" }),
    );
    expect(
      screen.getByText("Retirer ce membre du groupe ?"),
    ).toBeInTheDocument();

    await utilisateur.click(screen.getByRole("button", { name: "Confirmer" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [urlRetrait, optionsRetrait] = fetchMock.mock.calls[1];
    expect(urlRetrait).toBe(`/api/group/members/${membre.id}`);
    expect(optionsRetrait.method).toBe("DELETE");
    expect(onMembreRetire).toHaveBeenCalledWith(membre.id);
  });

  it("permet d’annuler la confirmation de retrait", async () => {
    const utilisateur = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          accesTotal: false,
          unites: [],
          uniteIdsAutorisees: [],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GestionAccesUniteMembre
        membre={membre}
        onClose={vi.fn()}
        onMembreRetire={vi.fn()}
      />,
    );

    await utilisateur.click(
      screen.getByRole("button", { name: "Retirer l’utilisateur" }),
    );
    await utilisateur.click(screen.getByRole("button", { name: "Annuler" }));

    expect(
      screen.queryByText("Retirer ce membre du groupe ?"),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
