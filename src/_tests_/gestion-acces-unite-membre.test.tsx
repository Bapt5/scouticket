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

    render(<GestionAccesUniteMembre membre={membre} onClose={vi.fn()} />);

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
      />,
    );

    expect(
      await screen.findByText(/accès à toutes les unités/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Groupe" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Enregistrer/ }),
    ).not.toBeInTheDocument();
  });
});
