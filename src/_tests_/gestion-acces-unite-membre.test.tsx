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

const unites = [
  { id: "farfadets", label: "Farfadets", color: "#6CC24A" },
  { id: "groupe", label: "Groupe", color: "#1E3A8A" },
];

const proprietesParDefaut = {
  estMoi: false,
  roleAppelant: "owner",
  onClose: vi.fn(),
  onMembreRetire: vi.fn(),
  onRoleModifie: vi.fn(),
};

const reponseUnites = (corps: object) => ({
  ok: true,
  json: () => Promise.resolve(corps),
});

describe("GestionAccesUniteMembre", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("affiche les unités et permet de sauvegarder la sélection", async () => {
    const utilisateur = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        reponseUnites({
          accesTotal: false,
          unites,
          uniteIdsAutorisees: ["farfadets"],
        }),
      )
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GestionAccesUniteMembre membre={membre} {...proprietesParDefaut} />,
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
      screen.getByRole("button", { name: /Enregistrer les modifications/ }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, optionsPatch] = fetchMock.mock.calls[1];
    expect(optionsPatch.method).toBe("PATCH");
    expect(JSON.parse(optionsPatch.body).uniteIds.sort()).toEqual([
      "farfadets",
      "groupe",
    ]);
    expect(
      await screen.findByText("Modifications enregistrées."),
    ).toBeInTheDocument();
  });

  it("« Tout sélectionner » bascule selon la majorité cochée", async () => {
    const utilisateur = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      reponseUnites({
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
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GestionAccesUniteMembre membre={membre} {...proprietesParDefaut} />,
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

  it("n’affiche ni menu de rôle, ni case, ni bouton pour son propre rôle de responsable", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      reponseUnites({
        accesTotal: true,
        unites: [{ id: "groupe", label: "Groupe", color: "#1E3A8A" }],
        uniteIdsAutorisees: ["groupe"],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GestionAccesUniteMembre
        membre={{ ...membre, role: "owner" }}
        {...proprietesParDefaut}
        estMoi
      />,
    );

    expect(
      await screen.findByText(/accès à toutes les unités/),
    ).toBeInTheDocument();
    expect(screen.getByText("Responsable")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
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

  it("permet à un responsable de changer le rôle d’un autre responsable", async () => {
    const utilisateur = userEvent.setup();
    const onRoleModifie = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        reponseUnites({
          accesTotal: true,
          unites,
          uniteIdsAutorisees: ["farfadets", "groupe"],
        }),
      )
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GestionAccesUniteMembre
        membre={{ ...membre, role: "owner" }}
        {...proprietesParDefaut}
        onRoleModifie={onRoleModifie}
      />,
    );

    const menu = await screen.findByRole("combobox", {
      name: "Rôle du membre",
    });
    expect(menu).toHaveValue("owner");
    await utilisateur.selectOptions(menu, "admin");
    await utilisateur.click(
      screen.getByRole("button", { name: "Enregistrer les modifications" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, options] = fetchMock.mock.calls[1];
    expect(url).toBe(`/api/group/members/${membre.id}/role`);
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body)).toEqual({ role: "admin" });
    expect(onRoleModifie).toHaveBeenCalledWith(membre.id, "admin");
  });

  it("n’offre pas le rôle Responsable à un administrateur", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          reponseUnites({ accesTotal: false, unites, uniteIdsAutorisees: [] }),
        ),
    );

    render(
      <GestionAccesUniteMembre
        membre={membre}
        {...proprietesParDefaut}
        roleAppelant="admin"
      />,
    );

    await screen.findByRole("combobox", { name: "Rôle du membre" });
    expect(
      screen.queryByRole("option", { name: "Responsable" }),
    ).not.toBeInTheDocument();
  });

  it("masque le menu de rôle d’un responsable pour un administrateur", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        reponseUnites({
          accesTotal: true,
          unites,
          uniteIdsAutorisees: ["farfadets", "groupe"],
        }),
      ),
    );

    render(
      <GestionAccesUniteMembre
        membre={{ ...membre, role: "owner" }}
        {...proprietesParDefaut}
        roleAppelant="admin"
      />,
    );

    await screen.findByText(/accès à toutes les unités/);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Responsable")).toBeInTheDocument();
  });

  it("rétrograder un administrateur révèle les unités et enregistre rôle puis accès", async () => {
    const utilisateur = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        reponseUnites({
          accesTotal: true,
          unites,
          uniteIdsAutorisees: ["farfadets", "groupe"],
        }),
      )
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GestionAccesUniteMembre
        membre={{ ...membre, role: "admin" }}
        {...proprietesParDefaut}
      />,
    );

    const menu = await screen.findByRole("combobox", {
      name: "Rôle du membre",
    });
    await utilisateur.selectOptions(menu, "member");

    expect(screen.getByRole("button", { name: "Farfadets" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await utilisateur.click(screen.getByRole("button", { name: "Groupe" }));
    await utilisateur.click(
      screen.getByRole("button", { name: "Enregistrer les modifications" }),
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [urlRole, optionsRole] = fetchMock.mock.calls[1];
    expect(urlRole).toBe(`/api/group/members/${membre.id}/role`);
    expect(JSON.parse(optionsRole.body)).toEqual({ role: "member" });
    const [urlUnites, optionsUnites] = fetchMock.mock.calls[2];
    expect(urlUnites).toBe(`/api/group/members/${membre.id}/unites`);
    expect(JSON.parse(optionsUnites.body)).toEqual({
      uniteIds: ["farfadets"],
    });
  });

  it("retire un membre après confirmation", async () => {
    const utilisateur = userEvent.setup();
    const onMembreRetire = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        reponseUnites({
          accesTotal: false,
          unites: [],
          uniteIdsAutorisees: [],
        }),
      )
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GestionAccesUniteMembre
        membre={membre}
        {...proprietesParDefaut}
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
    const fetchMock = vi.fn().mockResolvedValueOnce(
      reponseUnites({
        accesTotal: false,
        unites: [],
        uniteIdsAutorisees: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <GestionAccesUniteMembre membre={membre} {...proprietesParDefaut} />,
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
