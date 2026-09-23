import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";

const mocks = vi.hoisted(() => ({
  recupererContexteGroupe: vi.fn(),
  recupererSession: vi.fn(),
  recupererRoleMembre: vi.fn(),
  query: vi.fn(),
  verifierOrigineRequete: vi.fn(),
  updateMemberRole: vi.fn(),
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
  auth: { api: { updateMemberRole: mocks.updateMemberRole } },
}));

import { PATCH } from "@/app/api/group/members/[memberId]/role/route";

const params = () => Promise.resolve({ memberId: "member_1" });
const requete = (body: unknown = { role: "admin" }) =>
  new Request("https://example.test/api/group/members/member_1/role", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

describe("PATCH /api/group/members/[memberId]/role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recupererContexteGroupe.mockResolvedValue({
      identifiantOrganisation: "org_1",
      identifiantUtilisateur: "admin_1",
    });
    mocks.recupererSession.mockResolvedValue({ user: { id: "admin_1" } });
    mocks.recupererRoleMembre.mockResolvedValue("admin");
    mocks.verifierOrigineRequete.mockReturnValue(null);
    mocks.updateMemberRole.mockResolvedValue({});
  });

  it("refuse un appelant non responsable", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");

    const reponse = await PATCH(requete(), { params: params() });

    expect(reponse.status).toBe(403);
    expect(mocks.updateMemberRole).not.toHaveBeenCalled();
  });

  it("renvoie 404 pour un membre inconnu ou hors groupe", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const reponse = await PATCH(requete(), { params: params() });

    expect(reponse.status).toBe(404);
    expect(mocks.updateMemberRole).not.toHaveBeenCalled();
  });

  it("refuse la modification de son propre rôle", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ userId: "admin_1", role: "admin" }],
    });

    const reponse = await PATCH(requete(), { params: params() });

    expect(reponse.status).toBe(403);
    expect(mocks.updateMemberRole).not.toHaveBeenCalled();
  });

  it("refuse un rôle invalide", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ userId: "user_2", role: "member" }],
    });

    const reponse = await PATCH(requete({ role: "superadmin" }), {
      params: params(),
    });

    expect(reponse.status).toBe(400);
    expect(mocks.updateMemberRole).not.toHaveBeenCalled();
  });

  it("modifie le rôle d'un autre membre", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ userId: "user_2", role: "member" }],
    });

    const reponse = await PATCH(requete(), { params: params() });
    const corps = await reponse.json();

    expect(reponse.status).toBe(200);
    expect(corps).toEqual({ success: true, role: "admin" });
    expect(mocks.updateMemberRole).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          memberId: "member_1",
          role: "admin",
          organizationId: "org_1",
        },
      }),
    );
  });

  it("traduit le refus de Better Auth en 403", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ userId: "user_2", role: "owner" }],
    });
    mocks.updateMemberRole.mockRejectedValueOnce(
      new APIError(403, {
        code: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER",
        message: "You are not allowed to update this member",
      }),
    );

    const reponse = await PATCH(requete({ role: "member" }), {
      params: params(),
    });
    const corps = await reponse.json();

    expect(reponse.status).toBe(403);
    expect(corps.error).toContain("responsable");
  });
});
