import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";

const mocks = vi.hoisted(() => ({
  recupererSession: vi.fn(),
  query: vi.fn(),
  verifierOrigineRequete: vi.fn(),
  leaveOrganization: vi.fn(),
}));

vi.mock("@/lib/sessionServeur", () => ({
  recupererSession: mocks.recupererSession,
}));
vi.mock("@/lib/baseDeDonnees", () => ({
  pool: { query: mocks.query },
}));
vi.mock("@/lib/api/securiteRequetes", () => ({
  verifierOrigineRequete: mocks.verifierOrigineRequete,
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { leaveOrganization: mocks.leaveOrganization } },
}));

import { POST } from "@/app/api/group/leave/route";

const requete = (body: unknown = { organizationId: "org_1" }) =>
  new Request("https://example.test/api/group/leave", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("POST /api/group/leave", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recupererSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.verifierOrigineRequete.mockReturnValue(null);
    mocks.leaveOrganization.mockResolvedValue({});
  });

  it("refuse une requête non authentifiée", async () => {
    mocks.recupererSession.mockResolvedValue(null);

    const reponse = await POST(requete());

    expect(reponse.status).toBe(401);
    expect(mocks.leaveOrganization).not.toHaveBeenCalled();
  });

  it("renvoie 404 si l'appelant n'est pas membre du groupe", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const reponse = await POST(requete());

    expect(reponse.status).toBe(404);
    expect(mocks.leaveOrganization).not.toHaveBeenCalled();
  });

  it("refuse le départ du seul responsable et ne nettoie rien", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ userId: "user_1" }] });
    mocks.leaveOrganization.mockRejectedValueOnce(
      new APIError(400, {
        code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER",
        message: "You cannot leave the organization as the only owner",
      }),
    );

    const reponse = await POST(requete());
    const corps = await reponse.json();

    expect(reponse.status).toBe(403);
    expect(corps.error).toContain("seul responsable");
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("quitte le groupe et nettoie les accès unité", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ userId: "user_1" }] })
      .mockResolvedValueOnce({});

    const reponse = await POST(requete());
    const corps = await reponse.json();

    expect(reponse.status).toBe(200);
    expect(corps.success).toBe(true);
    expect(mocks.leaveOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ body: { organizationId: "org_1" } }),
    );
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.stringContaining("DELETE FROM scouticket_acces_unite_membre"),
      ["user_1", "org_1"],
    );
  });
});
