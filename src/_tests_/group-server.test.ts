import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/lib/baseDeDonnees", () => ({ pool: { query: mocks.query } }));

import {
  estResponsable,
  recupererGroupeActif,
  recupererUnitesAutoriseesMembre,
  reserverNumeros,
} from "@/lib/groupServer";

describe("estResponsable", () => {
  it.each(["admin", "owner"])("considère %s comme responsable", (role) => {
    expect(estResponsable(role)).toBe(true);
  });

  it.each([null, "member", "autre"])(
    "ne considère pas %s comme responsable",
    (role) => {
      expect(estResponsable(role)).toBe(false);
    },
  );
});

describe("recupererGroupeActif", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renvoie les unités triées par ordre, issues de scouticket_unites", async () => {
    mocks.query
      .mockResolvedValueOnce({
        rows: [
          {
            name: "Groupe test",
            treasury_email: "tresorerie@example.test",
            treasury_verification: { status: "verified" },
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: "farfadets", label: "Farfadets", color: "#6CC24A" },
          { id: "groupe", label: "Groupe", color: "#1E3A8A" },
        ],
      });

    const groupe = await recupererGroupeActif("org_1");

    expect(groupe.unites).toEqual([
      { id: "farfadets", label: "Farfadets", color: "#6CC24A" },
      { id: "groupe", label: "Groupe", color: "#1E3A8A" },
    ]);
    expect(mocks.query.mock.calls[1][0]).toMatch(/ORDER BY ordre ASC/);
    expect(mocks.query.mock.calls[1][1]).toEqual(["org_1"]);
  });

  it("lit les paramètres du groupe avec des défauts désactivés", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ name: "Sans paramètres" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            name: "Avec scan",
            scan_justificatifs_actif: true,
            convertir_justificatifs_pdf: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const sans = await recupererGroupeActif("org_1");
    const avec = await recupererGroupeActif("org_2");

    expect(sans.parametres).toEqual({
      scanJustificatifsActif: false,
      convertirJustificatifsEnPdf: false,
    });
    expect(avec.parametres).toEqual({
      scanJustificatifsActif: true,
      convertirJustificatifsEnPdf: true,
    });
  });

  it("lève une erreur si l’organisation est introuvable", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    await expect(recupererGroupeActif("org_inconnu")).rejects.toThrow();
  });
});

describe("recupererUnitesAutoriseesMembre", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renvoie l’ensemble des unite_id accessibles", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ unite_id: "farfadets" }, { unite_id: "groupe" }],
    });

    const autorisees = await recupererUnitesAutoriseesMembre("user_1", "org_1");

    expect(autorisees).toEqual(new Set(["farfadets", "groupe"]));
  });
});

describe("reserverNumeros", () => {
  function clientAvec(ligne: unknown) {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: ligne ? [ligne] : [] })
      .mockResolvedValue({ rows: [] });
    return { client: { query } as never, query };
  }

  it("attribue des plages contiguës et met à jour les compteurs", async () => {
    const { client, query } = clientAvec({
      compteur_global: 41,
      compteurs_comptables: { "2025": 12, "2024": 90 },
    });

    const attribues = await reserverNumeros(client, "org_1", {
      global: 2,
      comptable: { annee: 2025, nombre: 2 },
    });

    expect(attribues).toEqual({ premierGlobal: 42, premierComptable: 13 });
    expect(query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
    expect(query.mock.calls[1][1]).toEqual([
      "org_1",
      43,
      JSON.stringify({ "2025": 14, "2024": 90 }),
    ]);
  });

  it("démarre à 1 pour une nouvelle année comptable", async () => {
    const { client } = clientAvec({
      compteur_global: 0,
      compteurs_comptables: {},
    });

    const attribues = await reserverNumeros(client, "org_1", {
      global: 0,
      comptable: { annee: 2026, nombre: 1 },
    });

    expect(attribues).toEqual({ premierComptable: 1 });
  });

  it("échoue si le groupe n'est pas configuré", async () => {
    const { client } = clientAvec(null);

    await expect(
      reserverNumeros(client, "org_1", { global: 1, comptable: null }),
    ).rejects.toThrow("GROUPE_NON_CONFIGURE");
  });
});
