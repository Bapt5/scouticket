import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recupererContexteGroupe: vi.fn(),
  recupererSession: vi.fn(),
  recupererRoleMembre: vi.fn(),
  query: vi.fn(),
  verifierOrigineRequete: vi.fn(),
  removeMember: vi.fn(),
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
  return { ...reel, recupererRoleMembre: mocks.recupererRoleMembre };
});
vi.mock("@/lib/baseDeDonnees", () => ({
  pool: { query: mocks.query },
}));
vi.mock("@/lib/api/securiteRequetes", () => ({
  verifierOrigineRequete: mocks.verifierOrigineRequete,
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { removeMember: mocks.removeMember } },
}));

import { DELETE } from "@/app/api/group/members/[memberId]/route";

const params = () => Promise.resolve({ memberId: "member_1" });
const requete = () =>
  new Request("https://example.test/api/group/members/member_1", {
    method: "DELETE",
  });

describe("DELETE /api/group/members/[memberId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recupererContexteGroupe.mockResolvedValue({
      identifiantOrganisation: "org_1",
      identifiantUtilisateur: "admin_1",
    });
    mocks.recupererSession.mockResolvedValue({ user: { id: "admin_1" } });
    mocks.recupererRoleMembre.mockResolvedValue("admin");
    mocks.verifierOrigineRequete.mockReturnValue(null);
    mocks.removeMember.mockResolvedValue({});
  });

  it("refuse un appelant non responsable", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");

    const reponse = await DELETE(requete(), { params: params() });

    expect(reponse.status).toBe(403);
    expect(mocks.removeMember).not.toHaveBeenCalled();
  });

  it("renvoie 404 pour un membre inconnu ou hors groupe", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const reponse = await DELETE(requete(), { params: params() });

    expect(reponse.status).toBe(404);
  });

  it("refuse de retirer un membre responsable (owner)", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ userId: "user_2", role: "owner" }],
    });

    const reponse = await DELETE(requete(), { params: params() });

    expect(reponse.status).toBe(403);
    expect(mocks.removeMember).not.toHaveBeenCalled();
  });

  it("retire un membre simple et nettoie ses accès unité", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ userId: "user_2", role: "member" }] })
      .mockResolvedValueOnce({});

    const reponse = await DELETE(requete(), { params: params() });
    const corps = await reponse.json();

    expect(reponse.status).toBe(200);
    expect(corps.success).toBe(true);
    expect(mocks.removeMember).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { memberIdOrEmail: "member_1", organizationId: "org_1" },
      }),
    );
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.stringContaining("DELETE FROM scouticket_acces_unite_membre"),
      ["user_2", "org_1"],
    );
  });
});
