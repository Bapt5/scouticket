import { describe, expect, it } from "vitest";
import {
  lireUniteSelectionnee,
  lireUnitesSelectionnees,
  type UniteGroupe,
} from "@/lib/group";

const UNITES_TEST: UniteGroupe[] = [
  {
    id: "pionniers-caravelles",
    label: "Pionniers-Caravelles",
    color: "#E30613",
  },
  { id: "groupe", label: "Groupe", color: "#1E3A8A" },
];

describe("préférences d’unité", () => {
  it("lit uniquement une unité existante du groupe actif", () => {
    expect(
      lireUniteSelectionnee(
        {
          unitesSelectionneesParOrganisation: {
            org_a: "pionniers-caravelles",
            org_b: "inconnue",
          },
        },
        "org_a",
        UNITES_TEST,
      ),
    ).toBe("pionniers-caravelles");
    expect(
      lireUniteSelectionnee(
        {
          unitesSelectionneesParOrganisation: { org_b: "inconnue" },
        },
        "org_b",
        UNITES_TEST,
      ),
    ).toBe("");
  });

  it("ignore les métadonnées malformées", () => {
    expect(lireUnitesSelectionnees(["pionniers-caravelles"])).toEqual({});
    expect(lireUnitesSelectionnees({ org_a: 42, org_b: "groupe" })).toEqual({
      org_b: "groupe",
    });
  });
});
