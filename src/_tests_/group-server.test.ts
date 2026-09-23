import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/lib/baseDeDonnees", () => ({ pool: { query: mocks.query } }));

import {
  estResponsable,
  recupererGroupeActif,
  recupererUnitesAutoriseesMembre,
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
