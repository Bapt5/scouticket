import type { DetailDepense, LigneDepense } from "@/constants/piecesJointes";
import type { DepenseNomenclature } from "@/lib/nomenclature";

export const TYPE_DEPENSE_MULTIPLE = "Multiples";

// Ligne telle que saisie dans le formulaire (le montant reste une chaîne).
export interface LigneSaisie {
  categorie: string;
  montant: string;
}

export interface DetailSaisie {
  modePaiement: string;
  lignes: LigneSaisie[];
}

export const detailSaisieVide = (): DetailSaisie => ({
  modePaiement: "",
  lignes: [{ categorie: "", montant: "" }],
});

export const analyserMontantSaisi = (montant: string) =>
  montant.trim() === "" ? Number.NaN : Number(montant.replace(",", "."));

export const montantSaisiValide = (montant: string) => {
  const valeur = analyserMontantSaisi(montant);
  return Number.isFinite(valeur) && valeur > 0;
};

export const detailSaisiComplet = (detail: DetailSaisie) =>
  Boolean(detail.modePaiement) &&
  detail.lignes.length > 0 &&
  detail.lignes.every(
    (ligne) => ligne.categorie && montantSaisiValide(ligne.montant),
  );

export const versDetailDepense = (detail: DetailSaisie): DetailDepense => ({
  modePaiement: detail.modePaiement,
  lignes: detail.lignes.map((ligne) => ({
    categorie: ligne.categorie,
    montant: analyserMontantSaisi(ligne.montant),
  })),
});

// Arrondi au centime pour éviter les dérives des sommes flottantes (0,1 + 0,2).
export const totalLignes = (lignes: readonly Pick<LigneDepense, "montant">[]) =>
  Math.round(
    lignes.reduce(
      (total, ligne) =>
        total + (Number.isFinite(ligne.montant) ? ligne.montant : 0),
      0,
    ) * 100,
  ) / 100;

export const totalDetails = (details: readonly DetailDepense[]) =>
  Math.round(
    details.reduce((total, detail) => total + totalLignes(detail.lignes), 0) *
      100,
  ) / 100;

// Une pièce jointe = une entrée de nomenclature : le montant est le total du
// justificatif et le type est sa catégorie, ou « Multiples » s'il y en a plusieurs.
export const versDepenseNomenclature = (
  detail: DetailDepense,
): DepenseNomenclature => {
  const categories = new Set(
    detail.lignes.map((ligne) => ligne.categorie).filter(Boolean),
  );
  return {
    typeDepense:
      categories.size > 1
        ? TYPE_DEPENSE_MULTIPLE
        : (categories.values().next().value ?? ""),
    modePaiement: detail.modePaiement,
    montant: totalLignes(detail.lignes),
  };
};
