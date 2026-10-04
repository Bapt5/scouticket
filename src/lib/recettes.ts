import type { DetailRecette, LigneRecette } from "@/constants/piecesJointes";
import type { DepenseNomenclature } from "@/lib/nomenclature";
import {
  analyserMontantSaisi,
  dateDuJour,
  montantSaisiValide,
  totalLignes,
  type LigneSaisie,
} from "@/lib/depenses";

export const TYPE_RECETTE_MULTIPLE = "Multiples";

// Détail d'une recette tel que saisi dans le formulaire (le montant reste une
// chaîne). Pas d'« activité » (spécifique à la note de frais) : une recette
// n'a qu'un mode de paiement (liste fixe) et des lignes catégorie/montant.
export interface DetailSaisieRecette {
  date: string;
  modePaiement: string;
  description: string;
  lignes: LigneSaisie[];
  /** Poste budgétaire choisi (vide tant qu'aucun poste n'est sélectionné). */
  posteBudgetaireId: string;
}

export const detailSaisieRecetteVide = (): DetailSaisieRecette => ({
  date: dateDuJour(),
  modePaiement: "",
  description: "",
  lignes: [{ categorie: "", montant: "" }],
  posteBudgetaireId: "",
});

export const detailSaisieRecetteComplet = (detail: DetailSaisieRecette) =>
  Boolean(detail.date) &&
  Boolean(detail.modePaiement) &&
  detail.lignes.length > 0 &&
  detail.lignes.every(
    (ligne) => ligne.categorie && montantSaisiValide(ligne.montant),
  );

export const versDetailRecette = (
  detail: DetailSaisieRecette,
): DetailRecette => ({
  date: detail.date,
  modePaiement: detail.modePaiement,
  description: detail.description.trim(),
  lignes: detail.lignes.map((ligne): LigneRecette => ({
    categorie: ligne.categorie,
    montant: analyserMontantSaisi(ligne.montant),
  })),
});

// Une recette = une seule entrée de nomenclature : le montant est le total
// de la recette et le type est sa catégorie, ou « Multiples » s'il y en a
// plusieurs (même convention que versDepenseNomenclature).
export const versRecetteNomenclature = (
  detail: DetailRecette,
): DepenseNomenclature => {
  const categories = new Set(
    detail.lignes.map((ligne) => ligne.categorie).filter(Boolean),
  );
  return {
    typeDepense:
      categories.size > 1
        ? TYPE_RECETTE_MULTIPLE
        : (categories.values().next().value ?? ""),
    modePaiement: detail.modePaiement,
    montant: totalLignes(detail.lignes),
  };
};
