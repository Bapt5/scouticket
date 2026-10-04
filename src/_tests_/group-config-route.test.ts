import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recupererContexteGroupe: vi.fn(),
  recupererSession: vi.fn(),
  recupererRoleMembre: vi.fn(),
  recupererUnitesAutoriseesMembre: vi.fn(),
  recupererGroupeActif: vi.fn(),
  query: vi.fn(),
  connect: vi.fn(),
  verifierOrigineRequete: vi.fn(),
}));

vi.mock("@/lib/sessionServeur", () => ({
  recupererContexteGroupe: mocks.recupererContexteGroupe,
  recupererSession: mocks.recupererSession,
}));
vi.mock("@/lib/groupServer", async () => {
  const reel =
    await vi.importActual<typeof import("@/lib/groupServer")>(
      "@/lib/groupServer",
    );
  return {
    ...reel,
    recupererGroupeActif: mocks.recupererGroupeActif,
    recupererRoleMembre: mocks.recupererRoleMembre,
    recupererUnitesAutoriseesMembre: mocks.recupererUnitesAutoriseesMembre,
  };
});
vi.mock("@/lib/baseDeDonnees", () => ({
  pool: { query: mocks.query, connect: mocks.connect },
}));
vi.mock("@/lib/api/securiteRequetes", () => ({
  verifierOrigineRequete: mocks.verifierOrigineRequete,
}));

import { GET, POST } from "@/app/api/group/config/route";

const UNITES = [
  { id: "farfadets", label: "Farfadets", color: "#6CC24A" },
  { id: "groupe", label: "Groupe", color: "#1E3A8A" },
];

describe("GET /api/group/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recupererContexteGroupe.mockResolvedValue({
      identifiantOrganisation: "org_1",
      identifiantUtilisateur: "user_1",
    });
    mocks.recupererSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.recupererGroupeActif.mockResolvedValue({
      organisation: { id: "org_1", name: "Groupe test" },
      unites: UNITES,
      emailsTresoriers: ["tresorier@example.test"],
      parametres: { budgetActif: false },
    });
    mocks.query.mockResolvedValue({ rows: [] });
  });

  it("n'expose pas de postes budgétaires quand le suivi est désactivé", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("admin");

    const reponse = await GET(
      new Request("https://example.test/api/group/config"),
    );
    const corps = await reponse.json();

    expect(corps.postesBudgetaires).toBeUndefined();
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("expose les postes par domaine à tous les membres quand le suivi est actif", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");
    mocks.recupererUnitesAutoriseesMembre.mockResolvedValue(
      new Set(["farfadets"]),
    );
    mocks.recupererGroupeActif.mockResolvedValue({
      organisation: { id: "org_1", name: "Groupe test" },
      unites: UNITES,
      emailsTresoriers: ["tresorier@example.test"],
      parametres: { budgetActif: true },
    });
    mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [
        { id: "p1", domaine: "depense", label: "Camp" },
        { id: "p2", domaine: "recette", label: "Calendrier" },
      ],
    });

    const reponse = await GET(
      new Request("https://example.test/api/group/config"),
    );
    const corps = await reponse.json();

    expect(corps.postesBudgetaires).toEqual({
      depense: [{ id: "p1", domaine: "depense", label: "Camp" }],
      recette: [{ id: "p2", domaine: "recette", label: "Calendrier" }],
    });
  });

  it("ne renvoie à un membre simple que les unités qui lui sont autorisées", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");
    mocks.recupererUnitesAutoriseesMembre.mockResolvedValue(
      new Set(["farfadets"]),
    );

    const reponse = await GET(
      new Request("https://example.test/api/group/config"),
    );
    const corps = await reponse.json();

    expect(corps.units).toEqual([
      { id: "farfadets", label: "Farfadets", color: "#6CC24A" },
    ]);
    expect(corps.isAdmin).toBe(false);
  });

  it.each(["admin", "owner"])(
    "renvoie toutes les unités du groupe à un responsable (%s)",
    async (role) => {
      mocks.recupererRoleMembre.mockResolvedValue(role);

      const reponse = await GET(
        new Request("https://example.test/api/group/config"),
      );
      const corps = await reponse.json();

      expect(corps.units).toEqual(UNITES);
      expect(mocks.recupererUnitesAutoriseesMembre).not.toHaveBeenCalled();
    },
  );

  it("efface la préférence d'unité d'un membre si elle n'est plus autorisée", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");
    mocks.recupererUnitesAutoriseesMembre.mockResolvedValue(
      new Set(["farfadets"]),
    );
    mocks.query.mockResolvedValue({ rows: [{ unit_id: "groupe" }] });

    const reponse = await GET(
      new Request("https://example.test/api/group/config"),
    );
    const corps = await reponse.json();

    expect(corps.unitPreference).toBe("");
  });
});

describe("POST /api/group/config", () => {
  function creerClientFictif() {
    const query = vi.fn().mockResolvedValue({});
    const release = vi.fn();
    return { query, client: { query, release } };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recupererContexteGroupe.mockResolvedValue({
      identifiantOrganisation: "org_1",
      identifiantUtilisateur: "user_1",
    });
    mocks.recupererSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.verifierOrigineRequete.mockReturnValue(null);
  });

  const UNE_UNITE = [{ id: null, label: "Groupe", color: "#1E3A8A" }];

  const requete = (units: unknown) =>
    new Request("https://example.test/api/group/config", {
      method: "POST",
      body: JSON.stringify({ units }),
    });

  it("active la notification par défaut pour le trésorier qui configure le groupe", async () => {
    const { client, query } = creerClientFictif();
    mocks.connect.mockResolvedValue(client);
    mocks.recupererRoleMembre.mockResolvedValue("owner");

    const reponse = await POST(requete(UNE_UNITE));

    expect(reponse.status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO scouticket_notification_tresorerie/),
      ["user_1", "org_1"],
    );
  });

  it("n'active pas de notification pour un responsable non trésorier", async () => {
    const { client, query } = creerClientFictif();
    mocks.connect.mockResolvedValue(client);
    mocks.recupererRoleMembre.mockResolvedValue("admin");

    const reponse = await POST(requete(UNE_UNITE));

    expect(reponse.status).toBe(200);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO scouticket_notification_tresorerie/),
      expect.anything(),
    );
  });
});
