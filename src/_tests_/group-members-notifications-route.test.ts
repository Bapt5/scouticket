import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recupererContexteGroupe: vi.fn(),
  recupererSession: vi.fn(),
  recupererRoleMembre: vi.fn(),
  query: vi.fn(),
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
  return { ...reel, recupererRoleMembre: mocks.recupererRoleMembre };
});
vi.mock("@/lib/baseDeDonnees", () => ({
  pool: { query: mocks.query },
}));
vi.mock("@/lib/api/securiteRequetes", () => ({
  verifierOrigineRequete: mocks.verifierOrigineRequete,
}));

import { PATCH } from "@/app/api/group/members/[memberId]/notifications/route";

const params = () => Promise.resolve({ memberId: "member_1" });
const requete = (body: unknown = { recoit: false }) =>
  new Request("https://example.test/api/group/members/member_1/notifications", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

describe("PATCH /api/group/members/[memberId]/notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recupererContexteGroupe.mockResolvedValue({
      identifiantOrganisation: "org_1",
      identifiantUtilisateur: "admin_1",
    });
    mocks.recupererSession.mockResolvedValue({ user: { id: "admin_1" } });
    mocks.recupererRoleMembre.mockResolvedValue("admin");
    mocks.verifierOrigineRequete.mockReturnValue(null);
  });

  it("refuse un appelant non responsable", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");

    const reponse = await PATCH(requete(), { params: params() });

    expect(reponse.status).toBe(403);
  });

  it("renvoie 404 pour un membre inconnu ou hors groupe", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const reponse = await PATCH(requete(), { params: params() });

    expect(reponse.status).toBe(404);
  });

  it("refuse d'activer la notification pour un membre non trésorier", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ userId: "user_2", role: "admin" }],
    });

    const reponse = await PATCH(requete({ recoit: true }), {
      params: params(),
    });

    expect(reponse.status).toBe(400);
  });

  it("bloque la désactivation du dernier trésorier notifié", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ userId: "user_2", role: "owner" }] })
      .mockResolvedValueOnce({ rows: [{ count: "0" }] });

    const reponse = await PATCH(requete({ recoit: false }), {
      params: params(),
    });
    const corps = await reponse.json();

    expect(reponse.status).toBe(400);
    expect(corps.error).toContain("trésorier");
  });

  it("désactive la notification quand un autre trésorier reste notifié", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ userId: "user_2", role: "owner" }] })
      .mockResolvedValueOnce({ rows: [{ count: "1" }] })
      .mockResolvedValueOnce({ rows: [] });

    const reponse = await PATCH(requete({ recoit: false }), {
      params: params(),
    });
    const corps = await reponse.json();

    expect(reponse.status).toBe(200);
    expect(corps).toEqual({ success: true, recoit: false });
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.stringMatching(/DELETE FROM scouticket_notification_tresorerie/),
      ["user_2", "org_1"],
    );
  });

  it("active la notification d'un trésorier", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ userId: "user_2", role: "owner" }] })
      .mockResolvedValueOnce({ rows: [] });

    const reponse = await PATCH(requete({ recoit: true }), {
      params: params(),
    });
    const corps = await reponse.json();

    expect(reponse.status).toBe(200);
    expect(corps).toEqual({ success: true, recoit: true });
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.stringMatching(/INSERT INTO scouticket_notification_tresorerie/),
      ["user_2", "org_1"],
    );
  });
});
