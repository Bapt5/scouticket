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
      nomenclature: {
        anneeComptable,
        depense: { format: "{YYYY} - {Numero}" },
        recette: { format: null },
      },
    });
    mocks.query.mockResolvedValue({
      rowCount: 1,
      rows: [
        {
          compteur_global: 41,
          compteurs_comptables: {},
          compteur_global_recette: 4,
          compteurs_comptables_recette: {},
        },
      ],
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

  it("PATCH enregistre le format et les valeurs de départ pour les dépenses (domaine par défaut)", async () => {
    const reponse = await patch({
      format: "{YYYY} - {GlobalNumero}.pdf",
      anneeComptable,
      prochainNumeroGlobal: 120,
      prochainNumeroComptable: { annee: 2025, numero: 5 },
    });

    expect(reponse.status).toBe(200);
    const [sql, valeurs] = mocks.query.mock.calls[0];
    expect(sql).toContain("nomenclature_format =");
    expect(sql).not.toContain("nomenclature_format_recette");
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

  it("PATCH avec domaine « recette » écrit dans les colonnes dédiées", async () => {
    const reponse = await patch({
      domaine: "recette",
      format: "{YYYY} - R{GlobalNumero}.pdf",
      anneeComptable,
      prochainNumeroGlobal: 10,
    });

    expect(reponse.status).toBe(200);
    const [sql, valeurs] = mocks.query.mock.calls[0];
    expect(sql).toContain("nomenclature_format_recette =");
    expect(sql).toContain("compteur_global_recette =");
    // L'année comptable reste partagée : toujours écrite quel que soit le domaine.
    expect(valeurs).toEqual([
      "org_1",
      "{YYYY} - R{GlobalNumero}",
      9,
      1,
      "debut-fin",
      9,
      null,
      null,
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

  it("GET expose les compteurs des deux domaines aux seuls responsables", async () => {
    const reponseAdmin = await GET(
      new Request("https://example.test/api/group/nomenclature"),
    );
    const corpsAdmin = await reponseAdmin.json();
    expect(corpsAdmin.depense.compteurs.prochainNumeroGlobal).toBe(42);
    expect(corpsAdmin.recette.compteurs.prochainNumeroGlobal).toBe(5);

    mocks.recupererRoleMembre.mockResolvedValue("member");
    const reponseMembre = await GET(
      new Request("https://example.test/api/group/nomenclature"),
    );
    const corps = await reponseMembre.json();
    expect(corps.depense.format).toBe("{YYYY} - {Numero}");
    expect(corps.recette.format).toBeNull();
    expect(corps.depense.compteurs).toBeUndefined();
    expect(corps.recette.compteurs).toBeUndefined();
  });
});
