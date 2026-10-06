// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  budgetActif: true,
  postes: [] as { id: string; label: string; domaine: string }[],
}));

vi.mock("@/lib/baseDeDonnees", () => ({ pool: {} }));

import { enregistrerHistorique } from "@/lib/historiqueServer";
import type { EntreeHistorique } from "@/lib/historique";

const contexte = {
  auteurUserId: "user-1",
  uniteId: "unite-1",
  uniteLabel: "Louveteaux",
  uniteCouleur: "#112233",
};

const entree = (
  surcharge: Partial<EntreeHistorique> = {},
): EntreeHistorique => ({
  type: "depense",
  date: "2026-03-10",
  reference: null,
  modePaiement: "Carte du groupe",
  activite: "",
  description: "",
  lignes: [{ categorie: "Formation", montant: 12 }],
  ...surcharge,
});

const client = { query: mocks.query } as unknown as PoolClient;
const insertions = () =>
  mocks.query.mock.calls.filter(([texte]) =>
    String(texte).includes("INSERT INTO scouticket_historique"),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.budgetActif = true;
  mocks.postes = [
    { id: "poste-camp", label: "Camp", domaine: "depense" },
    { id: "poste-calendrier", label: "Calendrier", domaine: "recette" },
  ];
  mocks.query.mockImplementation(async (texte: string) => {
    if (texte.includes("SELECT historique_actif"))
      return {
        rows: [{ historique_actif: true, budget_actif: mocks.budgetActif }],
      };
    if (texte.includes("scouticket_postes_budgetaires"))
      return { rows: mocks.postes };
    return { rows: [] };
  });
});

describe("enregistrerHistorique : poste budgétaire", () => {
  it("enregistre l'id du poste et une copie texte de son libellé", async () => {
    await enregistrerHistorique(client, "org-1", contexte, [
      entree({ posteBudgetaireId: "poste-camp" }),
    ]);

    const [, valeurs] = insertions()[0];
    expect(valeurs.slice(-2)).toEqual(["poste-camp", "Camp"]);
  });

  it("n'interroge les postes qu'une fois pour tout l'envoi", async () => {
    await enregistrerHistorique(client, "org-1", contexte, [
      entree({ posteBudgetaireId: "poste-camp" }),
      entree({ posteBudgetaireId: "poste-camp" }),
      entree({ posteBudgetaireId: null }),
    ]);

    expect(
      mocks.query.mock.calls.filter(([texte]) =>
        String(texte).includes("scouticket_postes_budgetaires"),
      ),
    ).toHaveLength(1);
    expect(insertions().map(([, valeurs]) => valeurs.slice(-2))).toEqual([
      ["poste-camp", "Camp"],
      ["poste-camp", "Camp"],
      [null, null],
    ]);
  });

  it("ignore le poste quand le suivi budgétaire est désactivé", async () => {
    mocks.budgetActif = false;

    await enregistrerHistorique(client, "org-1", contexte, [
      entree({ posteBudgetaireId: "poste-camp" }),
    ]);

    expect(insertions()[0][1].slice(-2)).toEqual([null, null]);
    expect(
      mocks.query.mock.calls.some(([texte]) =>
        String(texte).includes("scouticket_postes_budgetaires"),
      ),
    ).toBe(false);
  });

  it("ignore un poste inconnu du groupe", async () => {
    await enregistrerHistorique(client, "org-1", contexte, [
      entree({ posteBudgetaireId: "poste-fantome" }),
    ]);

    expect(insertions()[0][1].slice(-2)).toEqual([null, null]);
  });

  it("ignore un poste du mauvais domaine (poste de recette sur une dépense)", async () => {
    await enregistrerHistorique(client, "org-1", contexte, [
      entree({ posteBudgetaireId: "poste-calendrier" }),
    ]);

    expect(insertions()[0][1].slice(-2)).toEqual([null, null]);
  });

  it("accepte un poste de recette pour une recette", async () => {
    await enregistrerHistorique(client, "org-1", contexte, [
      entree({ type: "recette", posteBudgetaireId: "poste-calendrier" }),
    ]);

    expect(insertions()[0][1].slice(-2)).toEqual([
      "poste-calendrier",
      "Calendrier",
    ]);
  });

  it("rattache aussi une note de frais aux postes de dépenses", async () => {
    await enregistrerHistorique(client, "org-1", contexte, [
      entree({ type: "note-de-frais", posteBudgetaireId: "poste-camp" }),
    ]);

    expect(insertions()[0][1].slice(-2)).toEqual(["poste-camp", "Camp"]);
  });
});
