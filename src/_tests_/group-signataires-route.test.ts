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

import { GET, PATCH } from "@/app/api/group/signataires/route";

function creerClientFictif() {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const release = vi.fn();
  return { client: { query, release }, query, release };
}

const requeteGet = () =>
  GET(new Request("https://example.test/api/group/signataires"));
const requetePatch = (corps: unknown) =>
  PATCH(
    new Request("https://example.test/api/group/signataires", {
      method: "PATCH",
      body: JSON.stringify(corps),
    }),
  );

describe("/api/group/signataires", () => {
  let client: ReturnType<typeof creerClientFictif>["client"];
  let clientQuery: ReturnType<typeof creerClientFictif>["query"];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recupererContexteGroupe.mockResolvedValue({
      identifiantOrganisation: "org_1",
      identifiantUtilisateur: "admin_1",
    });
    mocks.recupererSession.mockResolvedValue({ user: { id: "admin_1" } });
    mocks.recupererRoleMembre.mockResolvedValue("admin");
    mocks.verifierOrigineRequete.mockReturnValue(null);
    mocks.query.mockResolvedValue({ rows: [] });
    const fictif = creerClientFictif();
    client = fictif.client;
    clientQuery = fictif.query;
    mocks.connect.mockResolvedValue(client);
  });

  it("GET refuse un appelant non responsable", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");

    const reponse = await requeteGet();

    expect(reponse.status).toBe(403);
  });

  it("GET renvoie les retenus/non retenus par catégorie", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [
          { id: "m1", nom: "Alice", email: "alice@test.fr", ordre: 1 },
          { id: "m2", nom: "Bob", email: "bob@test.fr", ordre: null },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "m3", nom: "Carla", email: "carla@test.fr", ordre: 1 }],
      });

    const reponse = await requeteGet();

    expect(reponse.status).toBe(200);
    await expect(reponse.json()).resolves.toEqual({
      responsables: {
        retenus: [{ id: "m1", nom: "Alice", email: "alice@test.fr" }],
        nonRetenus: [{ id: "m2", nom: "Bob", email: "bob@test.fr" }],
      },
      tresoriers: {
        retenus: [{ id: "m3", nom: "Carla", email: "carla@test.fr" }],
        nonRetenus: [],
      },
    });
  });

  it("PATCH refuse un appelant non responsable", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");

    const reponse = await requetePatch({ responsables: [], tresoriers: [] });

    expect(reponse.status).toBe(403);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it.each([
    ["corps invalide", { responsables: "x", tresoriers: [] }],
    ["champ inconnu", { responsables: [], tresoriers: [], autre: true }],
    ["doublon", { responsables: ["m1", "m1"], tresoriers: [] }],
  ])("PATCH refuse un corps invalide (%s)", async (_nom, corps) => {
    const reponse = await requetePatch(corps);

    expect(reponse.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("PATCH refuse un id qui n'a pas le rôle attendu", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ id: "m1", userId: "u1", role: "owner" }],
    });

    const reponse = await requetePatch({
      responsables: ["m1"],
      tresoriers: [],
    });

    expect(reponse.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("PATCH remplace l'ordre des deux catégories dans une transaction", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        { id: "m1", userId: "u1", role: "admin" },
        { id: "m3", userId: "u3", role: "owner" },
      ],
    });
    // Appels faits par recupererSignataires() à la fin de la route.
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const reponse = await requetePatch({
      responsables: ["m1"],
      tresoriers: ["m3"],
    });

    expect(reponse.status).toBe(200);
    expect(clientQuery).toHaveBeenCalledWith("BEGIN");
    expect(clientQuery).toHaveBeenCalledWith("COMMIT");
    const insertions = clientQuery.mock.calls.filter(([sql]) =>
      /INSERT INTO scouticket_signataires/.test(String(sql)),
    );
    expect(insertions).toEqual([
      [expect.any(String), ["org_1", "u1", 1]],
      [expect.any(String), ["org_1", "u3", 1]],
    ]);
    expect(client.release).toHaveBeenCalled();
  });

  it("PATCH annule la transaction en cas d'erreur", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ id: "m1", userId: "u1", role: "admin" }],
    });
    clientQuery.mockImplementation((sql: unknown) => {
      if (String(sql).startsWith("INSERT"))
        return Promise.reject(new Error("boom"));
      return Promise.resolve({ rows: [] });
    });

    const reponse = await requetePatch({
      responsables: ["m1"],
      tresoriers: [],
    });

    expect(reponse.status).toBe(500);
    expect(clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });
});
