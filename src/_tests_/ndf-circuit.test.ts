// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recupererOrdreSignatairesUserId: vi.fn(),
}));

vi.mock("@/lib/groupServer", () => ({
  recupererOrdreSignatairesUserId: mocks.recupererOrdreSignatairesUserId,
}));

import { resoudreSignataires } from "@/lib/ndfSignature/circuit";

const membre = (userId: string) => ({
  userId,
  nom: `Nom ${userId}`,
  email: `${userId}@example.test`,
});

function listes(responsables: string[], tresoriers: string[]) {
  mocks.recupererOrdreSignatairesUserId.mockImplementation(
    async (_organisation: string, role: "admin" | "owner") =>
      (role === "admin" ? responsables : tresoriers).map(membre),
  );
}

const resoudre = async (beneficiaire = "B") => {
  const resultat = await resoudreSignataires("org", beneficiaire);
  return resultat
    ? {
        responsable: resultat.responsable.userId,
        tresorier: resultat.tresorier.userId,
      }
    : null;
};

describe("resoudreSignataires", () => {
  beforeEach(() => mocks.recupererOrdreSignatairesUserId.mockReset());

  it("prend le premier responsable et le premier trésorier", async () => {
    listes(["R1", "R2"], ["T1", "T2"]);
    expect(await resoudre()).toEqual({ responsable: "R1", tresorier: "T1" });
  });

  it("remplace le bénéficiaire par le suivant dans la même liste", async () => {
    listes(["B", "R2"], ["B", "T2"]);
    expect(await resoudre()).toEqual({ responsable: "R2", tresorier: "T2" });
  });

  it("le 2e trésorier approuve quand il n'y a pas d'autre responsable", async () => {
    listes(["B"], ["T1", "T2", "T3"]);
    expect(await resoudre()).toEqual({ responsable: "T2", tresorier: "T1" });
  });

  it("le 1er responsable traite et le suivant approuve quand il n'y a pas d'autre trésorier", async () => {
    listes(["R1", "R2"], ["B"]);
    expect(await resoudre()).toEqual({ responsable: "R2", tresorier: "R1" });
  });

  it("échoue s'il ne reste qu'un responsable pour remplacer l'unique trésorier", async () => {
    listes(["R1"], ["B"]);
    expect(await resoudre()).toBeNull();
  });

  it("échoue quand le bénéficiaire est le seul responsable et qu'il n'y a qu'un trésorier", async () => {
    listes(["B"], ["T1"]);
    expect(await resoudre()).toBeNull();
  });

  it("échoue quand aucune liste n'a de signataire", async () => {
    listes([], []);
    expect(await resoudre()).toBeNull();
  });

  it("ne fait jamais signer les deux étapes par la même personne", async () => {
    listes(["X"], ["X"]);
    expect(await resoudre()).toBeNull();
  });
});
