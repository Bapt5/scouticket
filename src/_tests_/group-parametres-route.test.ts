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

import { GET, PATCH } from "@/app/api/group/parametres/route";

const patch = (corps: unknown) =>
  PATCH(
    new Request("https://example.test/api/group/parametres", {
      method: "PATCH",
      body: JSON.stringify(corps),
    }),
  );

describe("/api/group/parametres", () => {
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
      parametres: {
        scanJustificatifsActif: false,
        convertirJustificatifsEnPdf: false,
        moyensPaiement: ["Espèces du groupe"],
        ndfSigneeActif: false,
        kmActif: false,
        kmTaux: 0.354,
        kmTauxMajLe: "2025-11-05",
      },
    });
    mocks.query.mockResolvedValue({ rowCount: 1, rows: [] });
  });

  it("GET renvoie les paramètres du groupe à un membre simple", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");

    const reponse = await GET(
      new Request("https://example.test/api/group/parametres"),
    );

    expect(reponse.status).toBe(200);
    await expect(reponse.json()).resolves.toEqual({
      parametres: {
        scanJustificatifsActif: false,
        convertirJustificatifsEnPdf: false,
        moyensPaiement: ["Espèces du groupe"],
        ndfSigneeActif: false,
        kmActif: false,
        kmTaux: 0.354,
        kmTauxMajLe: "2025-11-05",
      },
    });
  });

  it("GET refuse sans groupe actif", async () => {
    mocks.recupererContexteGroupe.mockResolvedValue({
      identifiantOrganisation: null,
      identifiantUtilisateur: "user_1",
    });

    const reponse = await GET(
      new Request("https://example.test/api/group/parametres"),
    );

    expect(reponse.status).toBe(401);
  });

  it("PATCH refuse un appelant non responsable", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");

    const reponse = await patch({ scanJustificatifsActif: true });

    expect(reponse.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each([
    ["corps vide", {}],
    ["type invalide", { scanJustificatifsActif: "oui" }],
    ["champ inconnu", { autre: true }],
    ["moyens de paiement vides", { moyensPaiement: [] }],
    ["moyens de paiement en doublon", { moyensPaiement: ["A", "a"] }],
  ])("PATCH refuse un corps invalide (%s)", async (_nom, corps) => {
    const reponse = await patch(corps);

    expect(reponse.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("PATCH enregistre le scan par un upsert propre au groupe", async () => {
    const reponse = await patch({ scanJustificatifsActif: true });

    expect(reponse.status).toBe(200);
    await expect(reponse.json()).resolves.toEqual({
      success: true,
      parametres: {
        scanJustificatifsActif: true,
        convertirJustificatifsEnPdf: false,
        moyensPaiement: ["Espèces du groupe"],
        ndfSigneeActif: false,
        kmActif: false,
        kmTaux: 0.354,
        kmTauxMajLe: "2025-11-05",
      },
    });
    expect(mocks.query.mock.calls[0][0]).toMatch(/ON CONFLICT/);
    expect(mocks.query.mock.calls[0][1]).toEqual([
      "org_1",
      true,
      false,
      JSON.stringify(["Espèces du groupe"]),
      false,
      false,
      0.354,
      "2025-11-05",
    ]);
  });

  it("PATCH désactive le scan", async () => {
    mocks.recupererGroupeActif.mockResolvedValue({
      parametres: {
        scanJustificatifsActif: true,
        convertirJustificatifsEnPdf: false,
        moyensPaiement: ["Espèces du groupe"],
        ndfSigneeActif: false,
        kmActif: false,
        kmTaux: 0.354,
        kmTauxMajLe: "2025-11-05",
      },
    });

    const reponse = await patch({ scanJustificatifsActif: false });

    await expect(reponse.json()).resolves.toMatchObject({
      parametres: {
        scanJustificatifsActif: false,
        convertirJustificatifsEnPdf: false,
      },
    });
    expect(mocks.query.mock.calls[0][1]).toEqual([
      "org_1",
      false,
      false,
      JSON.stringify(["Espèces du groupe"]),
      false,
      false,
      0.354,
      "2025-11-05",
    ]);
  });

  it("PATCH enregistre la conversion en PDF sans toucher au scan", async () => {
    const reponse = await patch({ convertirJustificatifsEnPdf: true });

    await expect(reponse.json()).resolves.toMatchObject({
      parametres: {
        scanJustificatifsActif: false,
        convertirJustificatifsEnPdf: true,
      },
    });
    expect(mocks.query.mock.calls[0][1]).toEqual([
      "org_1",
      false,
      true,
      JSON.stringify(["Espèces du groupe"]),
      false,
      false,
      0.354,
      "2025-11-05",
    ]);
  });

  it("PATCH remplace les moyens de paiement sans toucher aux autres réglages", async () => {
    const reponse = await patch({
      moyensPaiement: ["Espèces du groupe", "Virement du groupe"],
    });

    await expect(reponse.json()).resolves.toMatchObject({
      parametres: {
        scanJustificatifsActif: false,
        moyensPaiement: ["Espèces du groupe", "Virement du groupe"],
      },
    });
    expect(mocks.query.mock.calls[0][1]).toEqual([
      "org_1",
      false,
      false,
      JSON.stringify(["Espèces du groupe", "Virement du groupe"]),
      false,
      false,
      0.354,
      "2025-11-05",
    ]);
  });

  it("PATCH active les notes de frais signées sans toucher aux autres réglages", async () => {
    const reponse = await patch({ ndfSigneeActif: true });

    await expect(reponse.json()).resolves.toMatchObject({
      parametres: {
        scanJustificatifsActif: false,
        convertirJustificatifsEnPdf: false,
        ndfSigneeActif: true,
      },
    });
    expect(mocks.query.mock.calls[0][1]).toEqual([
      "org_1",
      false,
      false,
      JSON.stringify(["Espèces du groupe"]),
      true,
      false,
      0.354,
      "2025-11-05",
    ]);
  });

  it("PATCH refuse d'activer les km sans notes de frais signées", async () => {
    const reponse = await patch({ kmActif: true });

    expect(reponse.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("PATCH active les km quand les notes de frais signées sont actives", async () => {
    mocks.recupererGroupeActif.mockResolvedValue({
      parametres: {
        scanJustificatifsActif: false,
        convertirJustificatifsEnPdf: false,
        moyensPaiement: ["Espèces du groupe"],
        ndfSigneeActif: true,
        kmActif: false,
        kmTaux: 0.354,
        kmTauxMajLe: "2025-11-05",
      },
    });

    const reponse = await patch({ kmActif: true });

    expect(reponse.status).toBe(200);
    expect(mocks.query.mock.calls[0][1]).toEqual([
      "org_1",
      false,
      false,
      JSON.stringify(["Espèces du groupe"]),
      true,
      true,
      0.354,
      "2025-11-05",
    ]);
  });

  it("PATCH désactive aussi les km quand les notes signées sont désactivées", async () => {
    mocks.recupererGroupeActif.mockResolvedValue({
      parametres: {
        scanJustificatifsActif: false,
        convertirJustificatifsEnPdf: false,
        moyensPaiement: ["Espèces du groupe"],
        ndfSigneeActif: true,
        kmActif: true,
        kmTaux: 0.4,
        kmTauxMajLe: "2026-01-01",
      },
    });

    const reponse = await patch({ ndfSigneeActif: false });

    await expect(reponse.json()).resolves.toMatchObject({
      parametres: { ndfSigneeActif: false, kmActif: false, kmTaux: 0.4 },
    });
    expect(mocks.query.mock.calls[0][1].slice(4)).toEqual([
      false,
      false,
      0.4,
      "2026-01-01",
    ]);
  });

  it("PATCH met à jour la date du taux quand il change, pas sinon", async () => {
    mocks.recupererGroupeActif.mockResolvedValue({
      parametres: {
        scanJustificatifsActif: false,
        convertirJustificatifsEnPdf: false,
        moyensPaiement: ["Espèces du groupe"],
        ndfSigneeActif: true,
        kmActif: true,
        kmTaux: 0.354,
        kmTauxMajLe: "2025-11-05",
      },
    });

    await patch({ kmTaux: 0.354 });
    expect(mocks.query.mock.calls[0][1][7]).toBe("2025-11-05");

    await patch({ kmTaux: 0.4 });
    expect(mocks.query.mock.calls[1][1][6]).toBe(0.4);
    expect(mocks.query.mock.calls[1][1][7]).toBe(
      new Date().toISOString().slice(0, 10),
    );
  });

  it("PATCH relaie le refus de l'origine de la requête", async () => {
    mocks.verifierOrigineRequete.mockReturnValue(
      new Response(null, { status: 403 }),
    );

    const reponse = await patch({ scanJustificatifsActif: true });

    expect(reponse.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
