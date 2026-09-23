import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recupererContexteGroupe: vi.fn(),
  recupererSession: vi.fn(),
  recupererRoleMembre: vi.fn(),
  recupererUnitesAutoriseesMembre: vi.fn(),
  recupererGroupeActif: vi.fn(),
  query: vi.fn(),
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
vi.mock("@/lib/baseDeDonnees", () => ({ pool: { query: mocks.query } }));

import { GET } from "@/app/api/group/config/route";

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
      emailTresorerie: "tresorerie@example.test",
      validation: { status: "verified" },
    });
    mocks.query.mockResolvedValue({ rows: [] });
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
