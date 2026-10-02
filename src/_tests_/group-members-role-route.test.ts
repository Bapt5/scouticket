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
    mocks.query
      .mockResolvedValueOnce({
        rows: [{ userId: "user_2", role: "member" }],
      })
      // Entrée dans le circuit de signature des Responsables (promotion).
      .mockResolvedValueOnce({ rows: [{ prochain: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

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
    mocks.query
      .mockResolvedValueOnce({
        rows: [{ userId: "user_2", role: "owner" }],
      })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] });
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

  it("bloque la rétrogradation du dernier trésorier notifié", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [{ userId: "user_2", role: "owner" }],
      })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] });

    const reponse = await PATCH(requete({ role: "admin" }), {
      params: params(),
    });
    const corps = await reponse.json();

    expect(reponse.status).toBe(400);
    expect(corps.error).toContain("trésorier");
    expect(mocks.updateMemberRole).not.toHaveBeenCalled();
  });

  it("retire la notification du trésorier rétrogradé quand un autre reste notifié", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [{ userId: "user_2", role: "owner" }],
      })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [] })
      // Changement de catégorie de signataire (owner -> admin) : rang suivant
      // puis réassignation.
      .mockResolvedValueOnce({ rows: [{ prochain: 2 }] })
      .mockResolvedValueOnce({ rows: [] });

    const reponse = await PATCH(requete({ role: "admin" }), {
      params: params(),
    });

    expect(reponse.status).toBe(200);
    expect(mocks.query.mock.calls).toContainEqual([
      expect.stringMatching(/DELETE FROM scouticket_notification_tresorerie/),
      ["user_2", "org_1"],
    ]);
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.stringMatching(/INSERT INTO scouticket_signataires/),
      ["org_1", "user_2", 2],
    );
  });

  it("active la notification par défaut lors d'une promotion au rôle de trésorier", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [{ userId: "user_2", role: "member" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      // Entrée dans le circuit de signature des Trésoriers : rang suivant
      // puis insertion.
      .mockResolvedValueOnce({ rows: [{ prochain: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const reponse = await PATCH(requete({ role: "owner" }), {
      params: params(),
    });

    expect(reponse.status).toBe(200);
    expect(mocks.query.mock.calls).toContainEqual([
      expect.stringMatching(/INSERT INTO scouticket_notification_tresorerie/),
      ["user_2", "org_1"],
    ]);
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.stringMatching(/INSERT INTO scouticket_signataires/),
      ["org_1", "user_2", 1],
    );
  });

  it("ajoute un membre promu responsable en fin de liste des signataires", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [{ userId: "user_2", role: "member" }],
      })
      .mockResolvedValueOnce({ rows: [{ prochain: 3 }] })
      .mockResolvedValueOnce({ rows: [] });

    const reponse = await PATCH(requete({ role: "admin" }), {
      params: params(),
    });

    expect(reponse.status).toBe(200);
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.stringMatching(/INSERT INTO scouticket_signataires/),
      ["org_1", "user_2", 3],
    );
  });

  it("retire un responsable rétrogradé du circuit de signature", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [{ userId: "user_2", role: "admin" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const reponse = await PATCH(requete({ role: "member" }), {
      params: params(),
    });

    expect(reponse.status).toBe(200);
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.stringMatching(/DELETE FROM scouticket_signataires/),
      ["user_2", "org_1"],
    );
  });

  it("réassigne le rang en fin de liste lors d'un passage direct admin -> owner", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [{ userId: "user_2", role: "admin" }],
      })
      // Notification de trésorerie activée par défaut pour ce nouveau owner.
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ prochain: 2 }] })
      .mockResolvedValueOnce({ rows: [] });

    const reponse = await PATCH(requete({ role: "owner" }), {
      params: params(),
    });

    expect(reponse.status).toBe(200);
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.stringMatching(
        /INSERT INTO scouticket_signataires [\s\S]*ON CONFLICT/,
      ),
      ["org_1", "user_2", 2],
    );
  });
});
