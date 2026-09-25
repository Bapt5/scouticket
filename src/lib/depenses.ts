import type {
  DetailDepense,
  LigneDepense,
  TypeEnvoi,
} from "@/constants/piecesJointes";
import type { DepenseNomenclature } from "@/lib/nomenclature";

export const TYPE_DEPENSE_MULTIPLE = "Multiples";
// Une note de frais n'a pas de moyen de paiement : la variable {ModePaiement}
// de la nomenclature prend cette valeur.
export const MODE_PAIEMENT_NOTE_DE_FRAIS = "NDF";

// Ligne telle que saisie dans le formulaire (le montant reste une chaîne).
export interface LigneSaisie {
  categorie: string;
  montant: string;
}

export interface DetailSaisie {
  date: string;
  modePaiement: string;
  activite: string;
  description: string;
  lignes: LigneSaisie[];
}

export const dateDuJour = () => new Date().toISOString().split("T")[0];

export const detailSaisieVide = (): DetailSaisie => ({
  date: dateDuJour(),
  modePaiement: "",
  activite: "",
  description: "",
  lignes: [{ categorie: "", montant: "" }],
});

export const analyserMontantSaisi = (montant: string) =>
  montant.trim() === "" ? Number.NaN : Number(montant.replace(",", "."));

export const montantSaisiValide = (montant: string) => {
  const valeur = analyserMontantSaisi(montant);
  return Number.isFinite(valeur) && valeur > 0;
};

export const detailSaisiComplet = (
  detail: DetailSaisie,
  typeEnvoi: TypeEnvoi,
) =>
  Boolean(detail.date) &&
  (typeEnvoi === "depense-groupe"
    ? Boolean(detail.modePaiement)
    : Boolean(detail.activite.trim())) &&
  detail.lignes.length > 0 &&
  detail.lignes.every(
    (ligne) => ligne.categorie && montantSaisiValide(ligne.montant),
  );

export const versDetailDepense = (
  detail: DetailSaisie,
  typeEnvoi: TypeEnvoi,
): DetailDepense => ({
  date: detail.date,
  modePaiement: typeEnvoi === "depense-groupe" ? detail.modePaiement : "",
  activite: typeEnvoi === "note-de-frais" ? detail.activite.trim() : "",
  description: detail.description.trim(),
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
    modePaiement: detail.modePaiement || MODE_PAIEMENT_NOTE_DE_FRAIS,
    montant: totalLignes(detail.lignes),
  };
};

// Total par catégorie comptable sur tous les justificatifs, dans l'ordre de
// première apparition.
export const ventilerParCategorie = (details: readonly DetailDepense[]) => {
  const totaux = new Map<string, number>();
  for (const ligne of details.flatMap((detail) => detail.lignes)) {
    totaux.set(
      ligne.categorie,
      (totaux.get(ligne.categorie) ?? 0) + ligne.montant,
    );
  }
  return [...totaux].map(([categorie, montant]) => ({
    categorie,
    montant: totalLignes([{ montant }]),
  }));
};
