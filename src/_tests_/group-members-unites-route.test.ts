import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recupererContexteGroupe: vi.fn(),
  recupererSession: vi.fn(),
  recupererRoleMembre: vi.fn(),
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
  return { ...reel, recupererRoleMembre: mocks.recupererRoleMembre };
});
vi.mock("@/lib/baseDeDonnees", () => ({
  pool: { query: mocks.query, connect: mocks.connect },
}));
vi.mock("@/lib/api/securiteRequetes", () => ({
  verifierOrigineRequete: mocks.verifierOrigineRequete,
}));

import { GET, PATCH } from "@/app/api/group/members/[memberId]/unites/route";

const params = () => Promise.resolve({ memberId: "member_1" });

describe("/api/group/members/[memberId]/unites", () => {
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

  describe("GET", () => {
    it("refuse un appelant non responsable", async () => {
      mocks.recupererRoleMembre.mockResolvedValue("member");

      const reponse = await GET(
        new Request("https://example.test/api/group/members/member_1/unites"),
        { params: params() },
      );

      expect(reponse.status).toBe(403);
    });

    it("renvoie 404 pour un membre inconnu ou hors groupe", async () => {
      mocks.query.mockResolvedValueOnce({ rows: [] });

      const reponse = await GET(
        new Request("https://example.test/api/group/members/member_1/unites"),
        { params: params() },
      );

      expect(reponse.status).toBe(404);
    });

    it("renvoie accesTotal=true pour un membre owner/admin", async () => {
      mocks.query
        .mockResolvedValueOnce({ rows: [{ userId: "user_2", role: "owner" }] })
        .mockResolvedValueOnce({
          rows: [{ id: "groupe", label: "Groupe", color: "#1E3A8A" }],
        });

      const reponse = await GET(
        new Request("https://example.test/api/group/members/member_1/unites"),
        { params: params() },
      );
      const corps = await reponse.json();

      expect(corps.accesTotal).toBe(true);
      expect(corps.uniteIdsAutorisees).toEqual(["groupe"]);
    });

    it("renvoie les unités autorisées pour un membre simple", async () => {
      mocks.query
        .mockResolvedValueOnce({
          rows: [{ userId: "user_2", role: "member" }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: "groupe", label: "Groupe", color: "#1E3A8A" }],
        })
        .mockResolvedValueOnce({ rows: [{ unite_id: "groupe" }] });

      const reponse = await GET(
        new Request("https://example.test/api/group/members/member_1/unites"),
        { params: params() },
      );
      const corps = await reponse.json();

      expect(corps.accesTotal).toBe(false);
      expect(corps.uniteIdsAutorisees).toEqual(["groupe"]);
    });
  });

  describe("PATCH", () => {
    function creerClientFictif() {
      const query = vi.fn().mockResolvedValue({});
      const release = vi.fn();
      return { query, client: { query, release } };
    }

    it("refuse de modifier un membre owner/admin", async () => {
      mocks.query.mockResolvedValueOnce({
        rows: [{ userId: "user_2", role: "owner" }],
      });

      const reponse = await PATCH(
        new Request("https://example.test/api/group/members/member_1/unites", {
          method: "PATCH",
          body: JSON.stringify({ uniteIds: [] }),
        }),
        { params: params() },
      );

      expect(reponse.status).toBe(400);
    });

    it("filtre les ids soumis contre les unités réelles du groupe et remplace les accès", async () => {
      const { client, query } = creerClientFictif();
      mocks.connect.mockResolvedValue(client);
      mocks.query
        .mockResolvedValueOnce({
          rows: [{ userId: "user_2", role: "member" }],
        })
        .mockResolvedValueOnce({ rows: [{ id: "groupe" }] });

      const reponse = await PATCH(
        new Request("https://example.test/api/group/members/member_1/unites", {
          method: "PATCH",
          body: JSON.stringify({ uniteIds: ["groupe", "inexistante"] }),
        }),
        { params: params() },
      );
      const corps = await reponse.json();

      expect(reponse.status).toBe(200);
      expect(corps.uniteIdsAutorisees).toEqual(["groupe"]);
      expect(query).toHaveBeenCalledWith("COMMIT");
      expect(client.release).toHaveBeenCalled();
    });
  });
});
