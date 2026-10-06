// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acces: vi.fn(),
  query: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
  verifierOrigineRequete: vi.fn(),
  recupererSession: vi.fn(),
}));

vi.mock("@/lib/budgetAcces", () => ({
  recupererAccesBudget: mocks.acces,
}));
vi.mock("@/lib/baseDeDonnees", () => ({
  pool: {
    query: mocks.query,
    connect: async () => ({
      query: mocks.clientQuery,
      release: mocks.release,
    }),
  },
}));
vi.mock("@/lib/sessionServeur", () => ({
  recupererSession: mocks.recupererSession,
}));
vi.mock("@/lib/api/securiteRequetes", () => ({
  verifierOrigineRequete: mocks.verifierOrigineRequete,
}));
vi.mock("@/lib/logger", () => ({
  journal: { erreur: vi.fn(), info: vi.fn(), avertissement: vi.fn() },
}));

import { GET } from "@/app/api/budget/route";
import { GET as DONNEES } from "@/app/api/budget/donnees/route";
import { GET as EXPORT } from "@/app/api/budget/export/route";
import { PUT as MONTANTS } from "@/app/api/budget/montants/route";
import { PUT as POSTES } from "@/app/api/budget/postes/route";

const acces = {
  identifiantUtilisateur: "user-1",
  identifiantOrganisation: "org-1",
  groupe: {
    parametres: {
      budgetActif: true,
      anneeComptableDebut: { mois: 9, jour: 1 },
    },
  },
};

const postesSql = [
  { id: "p1", domaine: "depense", label: "Camp" },
  { id: "p2", domaine: "depense", label: "Matériel" },
  { id: "p3", domaine: "recette", label: "Calendrier" },
];

const requete = (url: string, methode = "GET", corps?: unknown) =>
  new Request(`https://example.test${url}`, {
    method: methode,
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });

/** Réponses SQL du suivi : postes, budgets de l'année et réalisé par poste. */
const suiviSql = () =>
  mocks.query.mockImplementation(async (texte: string) => {
    if (texte.includes("FROM scouticket_postes_budgetaires"))
      return { rows: postesSql };
    if (texte.includes("FROM scouticket_budgets_postes"))
      return { rows: [{ poste_id: "p1", montant: 1000 }] };
    if (texte.includes("FROM scouticket_historique"))
      return {
        rows: [
          { poste_id: "p1", recette: false, total: 400.004 },
          { poste_id: null, recette: false, total: 25 },
          // Poste supprimé entre-temps : compté en « Non affecté ».
          { poste_id: "supprime", recette: false, total: 10 },
          { poste_id: "p3", recette: true, total: 250 },
        ],
      };
    return { rows: [] };
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acces.mockResolvedValue(acces);
  mocks.verifierOrigineRequete.mockReturnValue(null);
  mocks.recupererSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
  mocks.clientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

afterEach(() => vi.useRealTimers());

describe("accès aux routes du suivi budgétaire", () => {
  it.each([
    ["GET /api/budget", () => GET(requete("/api/budget"))],
    ["GET /api/budget/export", () => EXPORT(requete("/api/budget/export"))],
    ["GET /api/budget/donnees", () => DONNEES(requete("/api/budget/donnees"))],
    [
      "PUT /api/budget/postes",
      () => POSTES(requete("/api/budget/postes", "PUT", { postes: [] })),
    ],
    [
      "PUT /api/budget/montants",
      () =>
        MONTANTS(
          requete("/api/budget/montants", "PUT", {
            anneeComptable: 2025,
            budgets: [],
          }),
        ),
    ],
  ])(
    "%s renvoie l'erreur d'accès (non responsable, option désactivée)",
    async (_nom, appel) => {
      mocks.acces.mockResolvedValue({
        erreur: new Response(null, { status: 403 }),
      });

      expect((await appel()).status).toBe(403);
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.clientQuery).not.toHaveBeenCalled();
    },
  );
});

describe("GET /api/budget", () => {
  it("calcule budget et réalisé par poste sur l'année comptable demandée", async () => {
    suiviSql();

    const reponse = await GET(requete("/api/budget?anneeComptable=2025"));

    expect(reponse.status).toBe(200);
    const corps = await reponse.json();
    expect(corps).toMatchObject({
      anneeDebut: 2025,
      du: "2025-09-01",
      au: "2026-08-31",
      debut: { mois: 9, jour: 1 },
    });
    expect(corps.depense).toEqual([
      { id: "p1", label: "Camp", budget: 1000, realise: 400 },
      { id: "p2", label: "Matériel", budget: null, realise: 0 },
      { id: null, label: "Non affecté", budget: null, realise: 35 },
    ]);
    expect(corps.recette).toEqual([
      { id: "p3", label: "Calendrier", budget: null, realise: 250 },
    ]);
    expect(corps.postes).toEqual(postesSql);
  });

  it("borne le réalisé à l'année comptable et au groupe", async () => {
    suiviSql();

    await GET(requete("/api/budget?anneeComptable=2025"));

    const agregat = mocks.query.mock.calls.find(([texte]) =>
      String(texte).includes("FROM scouticket_historique"),
    )!;
    expect(agregat[0]).toContain("date BETWEEN $2 AND $3");
    expect(agregat[1]).toEqual(["org-1", "2025-09-01", "2026-08-31"]);
    const budgets = mocks.query.mock.calls.find(([texte]) =>
      String(texte).includes("FROM scouticket_budgets_postes"),
    )!;
    expect(budgets[1]).toEqual(["org-1", 2025]);
  });

  it("utilise l'année comptable courante par défaut", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-15T10:00:00Z"));
    suiviSql();

    const corps = await (await GET(requete("/api/budget"))).json();

    // Avant le 1er septembre 2026 : l'année comptable a débuté en 2025.
    expect(corps.anneeDebut).toBe(2025);
  });

  it("omet « Non affecté » quand toutes les écritures ont un poste", async () => {
    mocks.query.mockImplementation(async (texte: string) => {
      if (texte.includes("FROM scouticket_postes_budgetaires"))
        return { rows: postesSql };
      if (texte.includes("FROM scouticket_historique"))
        return { rows: [{ poste_id: "p1", recette: false, total: 10 }] };
      return { rows: [] };
    });

    const corps = await (
      await GET(requete("/api/budget?anneeComptable=2025"))
    ).json();

    expect(
      corps.depense.map((ligne: { label: string }) => ligne.label),
    ).toEqual(["Camp", "Matériel"]);
  });

  it("refuse une année invalide", async () => {
    expect((await GET(requete("/api/budget?anneeComptable=abc"))).status).toBe(
      400,
    );
    expect((await GET(requete("/api/budget?anneeComptable=1500"))).status).toBe(
      400,
    );
  });
});

describe("GET /api/budget/export", () => {
  it("renvoie le suivi en CSV téléchargeable", async () => {
    suiviSql();

    const reponse = await EXPORT(
      requete("/api/budget/export?anneeComptable=2025"),
    );

    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("Content-Type")).toContain("text/csv");
    expect(reponse.headers.get("Content-Disposition")).toContain(
      "suivi-budgetaire-2025.csv",
    );
    const lignes = (await reponse.text()).trim().split("\r\n");
    expect(lignes).toContain("Dépenses;Camp;1000,00;400,00;600,00;40");
    expect(lignes).toContain("Dépenses;Non affecté;;35,00;;");
    expect(lignes).toContain("Recettes;Calendrier;;250,00;;");
  });
});

describe("GET /api/budget/donnees", () => {
  it("compte les postes et les écritures affectées", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ total: "14" }] })
      .mockResolvedValueOnce({ rows: [{ total: "6" }] });

    const corps = await (await DONNEES(requete("/api/budget/donnees"))).json();

    expect(corps).toEqual({ postes: 14, ecritures: 6 });
  });
});

describe("PUT /api/budget/postes", () => {
  const instructions = () =>
    mocks.clientQuery.mock.calls.map(
      ([texte]) => String(texte).trim().split(/\s+/)[0],
    );

  it("remplace la liste dans une transaction et renvoie les ids", async () => {
    const reponse = await POSTES(
      requete("/api/budget/postes", "PUT", {
        postes: [
          { id: "p1", domaine: "depense", label: "Camp d'été" },
          { id: null, domaine: "depense", label: "Matériel" },
          { id: null, domaine: "recette", label: "Camp" },
        ],
      }),
    );

    expect(reponse.status).toBe(200);
    const corps = await reponse.json();
    expect(corps.postes).toHaveLength(3);
    expect(corps.postes[0]).toEqual({
      id: "p1",
      domaine: "depense",
      label: "Camp d'été",
    });
    expect(corps.postes[1].id).toEqual(expect.any(String));
    expect(corps.postes[1].id).not.toBe(corps.postes[2].id);
    expect(instructions()).toEqual([
      "BEGIN",
      "DELETE",
      "INSERT",
      "INSERT",
      "INSERT",
      "COMMIT",
    ]);
    // Les postes absents de la liste sont supprimés (leurs écritures passent en « Non affecté » par la FK).
    const suppression = mocks.clientQuery.mock.calls[1];
    expect(suppression[1][0]).toBe("org-1");
    expect(suppression[1][1]).toHaveLength(3);
    expect(mocks.release).toHaveBeenCalled();
  });

  it("numérote l'ordre séparément pour chaque domaine", async () => {
    await POSTES(
      requete("/api/budget/postes", "PUT", {
        postes: [
          { id: null, domaine: "depense", label: "A" },
          { id: null, domaine: "recette", label: "B" },
          { id: null, domaine: "depense", label: "C" },
        ],
      }),
    );

    const ordres = mocks.clientQuery.mock.calls
      .filter(([texte]) => String(texte).includes("INSERT"))
      .map(([, valeurs]) => [valeurs[3], valeurs[4]]);
    expect(ordres).toEqual([
      ["A", 0],
      ["B", 0],
      ["C", 1],
    ]);
  });

  it.each([
    ["libellé vide", [{ id: null, domaine: "depense", label: " " }]],
    ["domaine inconnu", [{ id: null, domaine: "autre", label: "A" }]],
    [
      "doublon",
      [
        { id: null, domaine: "depense", label: "A" },
        { id: null, domaine: "depense", label: "a" },
      ],
    ],
  ])("refuse une liste invalide (%s)", async (_nom, postes) => {
    const reponse = await POSTES(
      requete("/api/budget/postes", "PUT", { postes }),
    );

    expect(reponse.status).toBe(400);
    expect(mocks.clientQuery).not.toHaveBeenCalled();
  });

  it("refuse un corps absent ou une origine invalide", async () => {
    expect((await POSTES(requete("/api/budget/postes", "PUT"))).status).toBe(
      400,
    );

    mocks.verifierOrigineRequete.mockReturnValue(
      new Response(null, { status: 403 }),
    );
    expect(
      (await POSTES(requete("/api/budget/postes", "PUT", { postes: [] })))
        .status,
    ).toBe(403);
    expect(mocks.clientQuery).not.toHaveBeenCalled();
  });

  it("annule tout si l'enregistrement échoue", async () => {
    mocks.clientQuery.mockImplementation(async (texte: string) => {
      if (texte.includes("DELETE")) throw new Error("ECHEC");
      return { rows: [], rowCount: 0 };
    });

    const reponse = await POSTES(
      requete("/api/budget/postes", "PUT", {
        postes: [{ id: null, domaine: "depense", label: "A" }],
      }),
    );

    expect(reponse.status).toBe(500);
    expect(instructions()).toContain("ROLLBACK");
    expect(instructions()).not.toContain("COMMIT");
    expect(mocks.release).toHaveBeenCalled();
  });
});

describe("PUT /api/budget/montants", () => {
  const instructions = () =>
    mocks.clientQuery.mock.calls.map(
      ([texte]) => String(texte).trim().split(/\s+/)[0],
    );

  it("enregistre les budgets arrondis au centime, un null supprimant le budget", async () => {
    const reponse = await MONTANTS(
      requete("/api/budget/montants", "PUT", {
        anneeComptable: 2025,
        budgets: [
          { posteId: "p1", montant: 1000.456 },
          { posteId: "p2", montant: null },
        ],
      }),
    );

    expect(reponse.status).toBe(200);
    expect(instructions()).toEqual(["BEGIN", "INSERT", "DELETE", "COMMIT"]);
    expect(mocks.clientQuery.mock.calls[1][1]).toEqual([
      "org-1",
      "p1",
      2025,
      1000.46,
    ]);
    expect(mocks.clientQuery.mock.calls[2][1]).toEqual(["org-1", "p2", 2025]);
  });

  it("n'écrit un budget que pour un poste existant du groupe", async () => {
    await MONTANTS(
      requete("/api/budget/montants", "PUT", {
        anneeComptable: 2025,
        budgets: [{ posteId: "p1", montant: 10 }],
      }),
    );

    const insertion = String(mocks.clientQuery.mock.calls[1][0]);
    expect(insertion).toContain("FROM scouticket_postes_budgetaires");
    expect(insertion).toContain("organization_id = $1 AND id = $2");
  });

  it.each([
    [
      "montant négatif",
      { anneeComptable: 2025, budgets: [{ posteId: "p1", montant: -1 }] },
    ],
    [
      "montant non numérique",
      { anneeComptable: 2025, budgets: [{ posteId: "p1", montant: "a" }] },
    ],
    ["année invalide", { anneeComptable: 1999, budgets: [] }],
    [
      "poste vide",
      { anneeComptable: 2025, budgets: [{ posteId: "", montant: 1 }] },
    ],
  ])("refuse un corps invalide (%s)", async (_nom, corps) => {
    const reponse = await MONTANTS(
      requete("/api/budget/montants", "PUT", corps),
    );

    expect(reponse.status).toBe(400);
    expect(mocks.clientQuery).not.toHaveBeenCalled();
  });

  it("annule tout si l'enregistrement échoue", async () => {
    mocks.clientQuery.mockImplementation(async (texte: string) => {
      if (texte.includes("INSERT")) throw new Error("ECHEC");
      return { rows: [], rowCount: 0 };
    });

    const reponse = await MONTANTS(
      requete("/api/budget/montants", "PUT", {
        anneeComptable: 2025,
        budgets: [{ posteId: "p1", montant: 10 }],
      }),
    );

    expect(reponse.status).toBe(500);
    expect(instructions()).toContain("ROLLBACK");
    expect(instructions()).not.toContain("COMMIT");
  });
});
