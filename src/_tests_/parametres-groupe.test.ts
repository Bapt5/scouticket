import { describe, expect, it } from "vitest";
import {
  PARAMETRES_GROUPE_PAR_DEFAUT,
  schemaMiseAJourParametresGroupe,
} from "@/lib/parametresGroupe";

describe("parametresGroupe", () => {
  it("désactive tout par défaut", () => {
    expect(PARAMETRES_GROUPE_PAR_DEFAUT).toEqual({
      scanJustificatifsActif: false,
    });
  });

  it("accepte une mise à jour partielle mais refuse le vide et l'inconnu", () => {
    const valide = (corps: unknown) =>
      schemaMiseAJourParametresGroupe.safeParse(corps).success;
    expect(valide({ scanJustificatifsActif: true })).toBe(true);
    expect(valide({})).toBe(false);
    expect(valide({ scanJustificatifsMl: true })).toBe(false);
    expect(valide({ scanJustificatifsActif: 1 })).toBe(false);
  });
});
