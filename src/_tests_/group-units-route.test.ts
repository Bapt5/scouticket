import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recupererContexteGroupe: vi.fn(),
  recupererSession: vi.fn(),
  recupererRoleMembre: vi.fn(),
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
  pool: { connect: mocks.connect },
}));
vi.mock("@/lib/api/securiteRequetes", () => ({
  verifierOrigineRequete: mocks.verifierOrigineRequete,
}));

import { PATCH } from "@/app/api/group/units/route";

function creerClientFictif() {
  const query = vi.fn().mockResolvedValue({});
  const release = vi.fn();
  return { client: { query, release }, query, release };
}

describe("PATCH /api/group/units", () => {
  let client: ReturnType<typeof creerClientFictif>["client"];
  let query: ReturnType<typeof creerClientFictif>["query"];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recupererContexteGroupe.mockResolvedValue({
      identifiantOrganisation: "org_1",
      identifiantUtilisateur: "user_1",
    });
    mocks.recupererSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.recupererRoleMembre.mockResolvedValue("admin");
    mocks.verifierOrigineRequete.mockReturnValue(null);
    const fictif = creerClientFictif();
    client = fictif.client;
    query = fictif.query;
    mocks.connect.mockResolvedValue(client);
  });

  it("refuse un appelant non responsable", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");

    const reponse = await PATCH(
      new Request("https://example.test/api/group/units", {
        method: "PATCH",
        body: JSON.stringify({ units: [] }),
      }),
    );

    expect(reponse.status).toBe(403);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("refuse des unités invalides", async () => {
    const reponse = await PATCH(
      new Request("https://example.test/api/group/units", {
        method: "PATCH",
        body: JSON.stringify({ units: [{ id: "INVALIDE!", label: "" }] }),
      }),
    );

    expect(reponse.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("met à jour/insère les unités conservées et supprime celles retirées", async () => {
    const reponse = await PATCH(
      new Request("https://example.test/api/group/units", {
        method: "PATCH",
        body: JSON.stringify({
          units: [{ id: "groupe", label: "Groupe", color: "#1E3A8A" }],
        }),
      }),
    );

    expect(reponse.status).toBe(200);
    const appels = query.mock.calls.map(([sql]) => String(sql));
    expect(
      appels.some((sql) => /DELETE FROM scouticket_unites/.test(sql)),
    ).toBe(true);
    expect(
      appels.some((sql) =>
        /ON CONFLICT \(organization_id, id\) DO UPDATE/.test(sql),
      ),
    ).toBe(true);
    // Ne supprime jamais toutes les unités puis ne les réinsère pas : la
    // suppression exclut explicitement les ids conservés.
    const suppression = query.mock.calls.find(([sql]) =>
      /DELETE FROM scouticket_unites/.test(String(sql)),
    );
    expect(suppression?.[1]).toEqual(["org_1", ["groupe"]]);
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });
});
