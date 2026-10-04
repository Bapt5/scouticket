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
      budgetActif: false,
      anneeComptableDebut: { mois: 9, jour: 1 },
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

  it("valide l'activation du suivi budgétaire et sa confirmation de suppression", () => {
    const valide = (corps: unknown) =>
      schemaMiseAJourParametresGroupe.safeParse(corps).success;
    expect(valide({ budgetActif: true })).toBe(true);
    expect(
      valide({ budgetActif: false, confirmationSuppressionBudget: true }),
    ).toBe(true);
    expect(valide({ budgetActif: "oui" })).toBe(false);
    expect(valide({ confirmationSuppressionBudget: "oui" })).toBe(false);
  });

  it("valide le début de l'année comptable (jour et mois, pas de 29 février)", () => {
    const valide = (anneeComptableDebut: unknown) =>
      schemaMiseAJourParametresGroupe.safeParse({ anneeComptableDebut })
        .success;
    expect(valide({ mois: 9, jour: 1 })).toBe(true);
    expect(valide({ mois: 2, jour: 28 })).toBe(true);
    expect(valide({ mois: 12, jour: 31 })).toBe(true);
    expect(valide({ mois: 2, jour: 29 })).toBe(false);
    expect(valide({ mois: 4, jour: 31 })).toBe(false);
    expect(valide({ mois: 13, jour: 1 })).toBe(false);
    expect(valide({ mois: 0, jour: 1 })).toBe(false);
    expect(valide({ mois: 9, jour: 0 })).toBe(false);
    expect(valide({ mois: 9.5, jour: 1 })).toBe(false);
    expect(valide({ mois: "9", jour: 1 })).toBe(false);
    expect(valide({ mois: 9 })).toBe(false);
    // Le format d'affichage reste dans la nomenclature.
    expect(valide({ mois: 9, jour: 1, format: "debut" })).toBe(false);
  });
});
