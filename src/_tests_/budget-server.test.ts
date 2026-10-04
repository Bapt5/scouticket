// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  contexte: vi.fn(),
  role: vi.fn(),
  groupe: vi.fn(),
}));

vi.mock("@/lib/baseDeDonnees", () => ({ pool: { query: mocks.query } }));
vi.mock("@/lib/sessionServeur", () => ({
  recupererContexteGroupe: mocks.contexte,
}));
vi.mock("@/lib/groupServer", async () => {
  const reel =
    await vi.importActual<typeof import("@/lib/groupServer")>(
      "@/lib/groupServer",
    );
  return {
    ...reel,
    recupererRoleMembre: mocks.role,
    recupererGroupeActif: mocks.groupe,
  };
});

import {
  appliquerPostes,
  enregistrerBudgets,
  initialiserPostesParDefaut,
  verifierPostesEnvoi,
} from "@/lib/budgetServer";
import { recupererAccesBudget } from "@/lib/budgetAcces";
import { POSTES_PAR_DEFAUT } from "@/lib/budget";
import type { PoolClient } from "pg";

const client = { query: mocks.query } as unknown as PoolClient;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("verifierPostesEnvoi", () => {
  it("ne contrôle rien quand le suivi est désactivé", async () => {
    expect(
      await verifierPostesEnvoi("org-1", false, "depense", [null, "x"]),
    ).toBeNull();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each([[null], [undefined], [""]])(
    "exige un poste pour chaque pièce (%s)",
    async (valeur) => {
      expect(
        await verifierPostesEnvoi("org-1", true, "depense", ["p1", valeur]),
      ).toBe("Poste budgétaire manquant");
      expect(mocks.query).not.toHaveBeenCalled();
    },
  );

  it("accepte des postes existants du bon domaine, en les dédoublonnant", async () => {
    mocks.query.mockResolvedValue({ rows: [{}, {}], rowCount: 2 });

    expect(
      await verifierPostesEnvoi("org-1", true, "depense", ["p1", "p2", "p1"]),
    ).toBeNull();
    const [texte, valeurs] = mocks.query.mock.calls[0];
    expect(texte).toContain("organization_id = $1 AND domaine = $2");
    expect(valeurs).toEqual(["org-1", "depense", ["p1", "p2"]]);
  });

  it("refuse un poste inconnu du groupe ou du mauvais domaine", async () => {
    mocks.query.mockResolvedValue({ rows: [{}], rowCount: 1 });

    expect(
      await verifierPostesEnvoi("org-1", true, "recette", ["p1", "p2"]),
    ).toBe("Poste budgétaire invalide");
  });
});

describe("appliquerPostes", () => {
  it("génère un id pour les nouveaux postes et garde ceux des postes existants", async () => {
    const enregistres = await appliquerPostes(client, "org-1", [
      { id: "p1", domaine: "depense", label: "Camp" },
      { id: null, domaine: "recette", label: "Calendrier" },
    ]);

    expect(enregistres[0].id).toBe("p1");
    expect(enregistres[1].id).toEqual(expect.any(String));
    expect(enregistres[1].id).not.toBe("p1");
  });

  it("supprime les postes absents de la liste avant les upserts", async () => {
    await appliquerPostes(client, "org-1", [
      { id: "p1", domaine: "depense", label: "Camp" },
    ]);

    const [premier, second] = mocks.query.mock.calls;
    expect(String(premier[0]).trim()).toMatch(/^DELETE/);
    expect(premier[1]).toEqual(["org-1", ["p1"]]);
    expect(String(second[0])).toContain("ON CONFLICT (organization_id, id)");
  });

  it("ne change jamais le domaine d'un poste existant", async () => {
    await appliquerPostes(client, "org-1", [
      { id: "p1", domaine: "recette", label: "Camp" },
    ]);

    const upsert = String(mocks.query.mock.calls[1][0]);
    expect(upsert).toContain(
      "WHERE scouticket_postes_budgetaires.domaine = EXCLUDED.domaine",
    );
    expect(upsert).not.toMatch(/SET[^W]*domaine =/);
  });
});

describe("initialiserPostesParDefaut", () => {
  it("crée les postes par défaut quand le groupe n'en a aucun", async () => {
    mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });

    await initialiserPostesParDefaut(client, "org-1");

    const insertions = mocks.query.mock.calls.filter(([texte]) =>
      String(texte).includes("INSERT INTO scouticket_postes_budgetaires"),
    );
    expect(insertions).toHaveLength(POSTES_PAR_DEFAUT.length);
    expect(insertions.map(([, valeurs]) => valeurs[3])).toEqual(
      POSTES_PAR_DEFAUT.map((poste) => poste.label),
    );
  });

  it("ne touche à rien si le groupe a déjà des postes", async () => {
    mocks.query.mockResolvedValue({ rows: [{}], rowCount: 1 });

    await initialiserPostesParDefaut(client, "org-1");

    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});

describe("enregistrerBudgets", () => {
  it("supprime le budget d'un poste dont le montant est vide", async () => {
    await enregistrerBudgets(client, "org-1", 2025, [
      { posteId: "p1", montant: null },
    ]);

    const [texte, valeurs] = mocks.query.mock.calls[0];
    expect(String(texte).trim()).toMatch(
      /^DELETE FROM scouticket_budgets_postes/,
    );
    expect(valeurs).toEqual(["org-1", "p1", 2025]);
  });

  it("enregistre un budget à zéro (distinct d'un budget non saisi)", async () => {
    await enregistrerBudgets(client, "org-1", 2025, [
      { posteId: "p1", montant: 0 },
    ]);

    expect(String(mocks.query.mock.calls[0][0])).toContain("INSERT INTO");
    expect(mocks.query.mock.calls[0][1]).toEqual(["org-1", "p1", 2025, 0]);
  });
});

describe("recupererAccesBudget", () => {
  /** Statut HTTP de l'erreur d'accès, `undefined` si l'accès est accordé. */
  const statut = (acces: Awaited<ReturnType<typeof recupererAccesBudget>>) =>
    "erreur" in acces ? acces.erreur?.status : undefined;

  const groupe = (budgetActif: boolean) => ({
    parametres: { budgetActif },
  });

  beforeEach(() => {
    mocks.contexte.mockResolvedValue({
      identifiantUtilisateur: "user-1",
      identifiantOrganisation: "org-1",
    });
    mocks.role.mockResolvedValue("admin");
    mocks.groupe.mockResolvedValue(groupe(true));
  });

  it("répond 401 sans groupe actif", async () => {
    mocks.contexte.mockResolvedValue({
      identifiantUtilisateur: null,
      identifiantOrganisation: null,
    });

    const acces = await recupererAccesBudget();

    expect(statut(acces)).toBe(401);
  });

  it.each([["member"], [null]])(
    "répond 403 pour un non-responsable (%s)",
    async (role) => {
      mocks.role.mockResolvedValue(role);

      const acces = await recupererAccesBudget();

      expect(statut(acces)).toBe(403);
      expect(mocks.groupe).not.toHaveBeenCalled();
    },
  );

  it("répond 404 quand le suivi n'est pas activé", async () => {
    mocks.groupe.mockResolvedValue(groupe(false));

    const acces = await recupererAccesBudget();

    expect(statut(acces)).toBe(404);
  });

  it.each([["owner"], ["admin"]])(
    "autorise le responsable (%s) quand le suivi est activé",
    async (role) => {
      mocks.role.mockResolvedValue(role);

      const acces = await recupererAccesBudget();

      expect("erreur" in acces).toBe(false);
      expect(acces).toMatchObject({
        identifiantUtilisateur: "user-1",
        identifiantOrganisation: "org-1",
      });
    },
  );
});
