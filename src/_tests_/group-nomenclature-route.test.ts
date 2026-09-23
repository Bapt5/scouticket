import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recupererContexteGroupe: vi.fn(),
  recupererSession: vi.fn(),
  recupererRoleMembre: vi.fn(),
  recupererGroupeActif: vi.fn(),
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
  return {
    ...reel,
    recupererRoleMembre: mocks.recupererRoleMembre,
    recupererGroupeActif: mocks.recupererGroupeActif,
  };
});
vi.mock("@/lib/baseDeDonnees", () => ({ pool: { query: mocks.query } }));
vi.mock("@/lib/api/securiteRequetes", () => ({
  verifierOrigineRequete: mocks.verifierOrigineRequete,
}));

import { GET, PATCH } from "@/app/api/group/nomenclature/route";

const anneeComptable = { mois: 9, jour: 1, format: "debut-fin" };

const patch = (corps: unknown) =>
  PATCH(
    new Request("https://example.test/api/group/nomenclature", {
      method: "PATCH",
      body: JSON.stringify(corps),
    }),
  );

describe("/api/group/nomenclature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recupererContexteGroupe.mockResolvedValue({
      identifiantOrganisation: "org_1",
      identifiantUtilisateur: "user_1",
    });
    mocks.recupererSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.recupererRoleMembre.mockResolvedValue("admin");
    mocks.verifierOrigineRequete.mockReturnValue(null);
    mocks.recupererGroupeActif.mockResolvedValue({
      nomenclature: { format: "{YYYY} - {Numero}", anneeComptable },
    });
    mocks.query.mockResolvedValue({
      rowCount: 1,
      rows: [{ compteur_global: 41, compteurs_comptables: {} }],
    });
  });

  it("PATCH refuse un appelant non responsable", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");

    const reponse = await patch({ format: "{YYYY}", anneeComptable });

    expect(reponse.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("PATCH refuse un format invalide", async () => {
    const reponse = await patch({ format: "{Inconnue}", anneeComptable });

    expect(reponse.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("PATCH refuse une année comptable invalide", async () => {
    const reponse = await patch({
      format: "{YYYY}",
      anneeComptable: { ...anneeComptable, mois: 2, jour: 29 },
    });

    expect(reponse.status).toBe(400);
  });

  it("PATCH enregistre le format et les valeurs de départ", async () => {
    const reponse = await patch({
      format: "{YYYY} - {GlobalNumero}.pdf",
      anneeComptable,
      prochainNumeroGlobal: 120,
      prochainNumeroComptable: { annee: 2025, numero: 5 },
    });

    expect(reponse.status).toBe(200);
    const [, valeurs] = mocks.query.mock.calls[0];
    expect(valeurs).toEqual([
      "org_1",
      "{YYYY} - {GlobalNumero}",
      9,
      1,
      "debut-fin",
      119,
      "2025",
      4,
    ]);
  });

  it("PATCH permet de revenir au format historique (null)", async () => {
    const reponse = await patch({ format: null, anneeComptable });

    expect(reponse.status).toBe(200);
    expect(mocks.query.mock.calls[0][1][1]).toBeNull();
  });

  it("PATCH renvoie 409 si le groupe n'est pas configuré", async () => {
    mocks.query.mockResolvedValue({ rowCount: 0, rows: [] });

    const reponse = await patch({ format: "{YYYY}", anneeComptable });

    expect(reponse.status).toBe(409);
  });

  it("GET expose les compteurs aux seuls responsables", async () => {
    const reponseAdmin = await GET(
      new Request("https://example.test/api/group/nomenclature"),
    );
    expect((await reponseAdmin.json()).compteurs.prochainNumeroGlobal).toBe(42);

    mocks.recupererRoleMembre.mockResolvedValue("member");
    const reponseMembre = await GET(
      new Request("https://example.test/api/group/nomenclature"),
    );
    const corps = await reponseMembre.json();
    expect(corps.format).toBe("{YYYY} - {Numero}");
    expect(corps.compteurs).toBeUndefined();
  });
});
