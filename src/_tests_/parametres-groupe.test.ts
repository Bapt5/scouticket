import { describe, expect, it } from "vitest";
import {
  PARAMETRES_GROUPE_PAR_DEFAUT,
  schemaMiseAJourParametresGroupe,
} from "@/lib/parametresGroupe";
import { MOYENS_PAIEMENT_PAR_DEFAUT } from "@/constants/configDepenses";

describe("parametresGroupe", () => {
  it("désactive tout par défaut et propose les moyens de paiement par défaut", () => {
    expect(PARAMETRES_GROUPE_PAR_DEFAUT).toEqual({
      scanJustificatifsActif: false,
      convertirJustificatifsEnPdf: false,
      moyensPaiement: [...MOYENS_PAIEMENT_PAR_DEFAUT],
      ndfSigneeActif: false,
      kmActif: false,
      kmTaux: 0.354,
      kmTauxMajLe: "2025-11-05",
      logoPersonnalise: false,
      historiqueActif: false,
    });
  });

  it("accepte une mise à jour partielle mais refuse le vide et l'inconnu", () => {
    const valide = (corps: unknown) =>
      schemaMiseAJourParametresGroupe.safeParse(corps).success;
    expect(valide({ scanJustificatifsActif: true })).toBe(true);
    expect(valide({ convertirJustificatifsEnPdf: true })).toBe(true);
    expect(valide({ convertirJustificatifsEnPdf: "oui" })).toBe(false);
    expect(valide({ ndfSigneeActif: true })).toBe(true);
    expect(valide({ ndfSigneeActif: "oui" })).toBe(false);
    expect(valide({})).toBe(false);
    expect(valide({ scanJustificatifsMl: true })).toBe(false);
    expect(valide({ scanJustificatifsActif: 1 })).toBe(false);
  });

  it("valide les moyens de paiement et refuse les doublons ou une liste vide", () => {
    const valide = (moyensPaiement: unknown) =>
      schemaMiseAJourParametresGroupe.safeParse({ moyensPaiement }).success;
    expect(valide(["Espèces", "Virement"])).toBe(true);
    expect(valide([])).toBe(false);
    expect(valide([""])).toBe(false);
    expect(valide(["Espèces", "espèces"])).toBe(false);
    expect(valide(["Espèces", "Especes"])).toBe(false);
    expect(valide(Array.from({ length: 21 }, (_, i) => `Moyen ${i}`))).toBe(
      false,
    );
  });

  it("valide l'activation et le taux du kilomètre", () => {
    const valide = (corps: unknown) =>
      schemaMiseAJourParametresGroupe.safeParse(corps).success;
    expect(valide({ kmActif: true })).toBe(true);
    expect(valide({ kmTaux: 0.354 })).toBe(true);
    expect(valide({ kmTaux: 0 })).toBe(false);
    expect(valide({ kmTaux: -1 })).toBe(false);
    expect(valide({ kmTaux: 6 })).toBe(false);
    expect(valide({ kmTaux: 0.35412 })).toBe(false);
    expect(valide({ kmTaux: "0,354" })).toBe(false);
    // La date de mise à jour est fixée par le serveur.
    expect(valide({ kmTauxMajLe: "2026-01-01" })).toBe(false);
  });
});
