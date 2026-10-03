import type {
  DetailDepense,
  DetailRecette,
  LigneDepense,
  TypeEnvoi,
} from "@/constants/piecesJointes";
import { CATEGORIES_COMPTABLES } from "@/constants/configDepenses";
import { CATEGORIES_COMPTABLES_RECETTES } from "@/constants/configRecettes";
import { totalLignes } from "@/lib/depenses";

export const TYPES_HISTORIQUE = [
  "depense",
  "recette",
  "note-de-frais",
] as const;
export type TypeHistorique = (typeof TYPES_HISTORIQUE)[number];

export const LIBELLES_TYPES_HISTORIQUE: Record<TypeHistorique, string> = {
  depense: "Dépense",
  recette: "Recette",
  "note-de-frais": "Note de frais",
};

/** Une recette augmente la trésorerie, les autres types la diminuent. */
export const estRecetteHistorique = (type: TypeHistorique) =>
  type === "recette";

export type LigneHistorique = Pick<LigneDepense, "categorie" | "montant">;

/** Contexte d'un envoi, commun à toutes les lignes d'historique qu'il produit. */
export interface ContexteHistorique {
  auteurUserId: string;
  uniteId: string | null;
  uniteLabel: string;
  uniteCouleur: string;
}

/** Une entrée de nomenclature (un justificatif) à enregistrer dans l'historique. */
export interface EntreeHistorique {
  type: TypeHistorique;
  date: string;
  reference: string | null;
  modePaiement: string;
  activite: string;
  description: string;
  lignes: LigneHistorique[];
}

/** Une entrée par justificatif d'une dépense ou d'une note de frais. */
export const versEntreesDepense = (
  details: readonly DetailDepense[],
  type: Exclude<TypeHistorique, "recette">,
): EntreeHistorique[] =>
  details.map((detail) => ({
    type,
    date: detail.date,
    reference: detail.reference ?? null,
    modePaiement: detail.modePaiement,
    activite: detail.activite,
    description: detail.description,
    lignes: detail.lignes.map(({ categorie, montant }) => ({
      categorie,
      montant,
    })),
  }));

export const versEntreeRecette = (detail: DetailRecette): EntreeHistorique => ({
  type: "recette",
  date: detail.date,
  reference: detail.reference ?? null,
  modePaiement: detail.modePaiement,
  activite: "",
  description: detail.description,
  lignes: detail.lignes.map(({ categorie, montant }) => ({
    categorie,
    montant,
  })),
});

export const montantTotalEntree = (entree: Pick<EntreeHistorique, "lignes">) =>
  totalLignes(entree.lignes);

/** Ligne d'historique telle que renvoyée par l'API. */
export interface LigneHistoriqueApi {
  id: string;
  envoiId: string;
  type: TypeHistorique;
  date: string;
  uniteId: string | null;
  uniteLabel: string;
  uniteCouleur: string;
  reference: string | null;
  modePaiement: string;
  activite: string;
  description: string;
  montantTotal: number;
  lignes: LigneHistorique[];
  /** Nom de l'auteur, ou `null` si son compte a été supprimé. */
  auteurNom: string | null;
  creeLe: string;
  modifieLe: string | null;
  modifieParNom: string | null;
}

export const COLONNES_TRI_HISTORIQUE = [
  "date",
  "reference",
  "type",
  "unite",
  "montant",
] as const;
export type ColonneTriHistorique = (typeof COLONNES_TRI_HISTORIQUE)[number];

// ─── Export CSV ───

/** Neutralise l'injection de formules (tableurs) et échappe les guillemets. */
export function cellulesCsv(valeur: string): string {
  const neutralisee = /^[=+\-@\t\r]/.test(valeur) ? `'${valeur}` : valeur;
  return /[";\r\n]/.test(neutralisee)
    ? `"${neutralisee.replace(/"/g, '""')}"`
    : neutralisee;
}

export const montantCsv = (montant: number) =>
  montant.toFixed(2).replace(".", ",");

const ENTETES_CSV = [
  "Date",
  "Référence",
  "Type",
  "Unité",
  "Mode de paiement",
  "Activité",
  "Description",
  "Montant total",
];

/** Ordre des catégories comptables : liste des dépenses, puis des recettes. */
const ORDRE_CATEGORIES: readonly string[] = [
  ...new Set([
    ...CATEGORIES_COMPTABLES.map((categorie) => categorie.libelle),
    ...CATEGORIES_COMPTABLES_RECETTES.map((categorie) => categorie.libelle),
  ]),
];

/**
 * Catégories présentes dans les lignes exportées, dans l'ordre comptable ;
 * une catégorie inconnue (liste modifiée depuis) suit, par ordre alphabétique.
 */
export function categoriesExportees(
  lignes: readonly Pick<LigneHistoriqueApi, "lignes">[],
): string[] {
  const presentes = new Set(
    lignes.flatMap((ligne) => ligne.lignes.map((l) => l.categorie)),
  );
  const connues = ORDRE_CATEGORIES.filter((categorie) =>
    presentes.has(categorie),
  );
  const inconnues = [...presentes]
    .filter((categorie) => !ORDRE_CATEGORIES.includes(categorie))
    .sort((a, b) => a.localeCompare(b, "fr"));
  return [...connues, ...inconnues];
}

/**
 * CSV de l'historique : une colonne par catégorie comptable présente dans
 * l'export, contenant le montant de la ligne dans cette catégorie (cellule
 * vide sinon). Une même catégorie répétée dans une ligne est additionnée.
 */
export function genererCsvHistorique(
  lignes: readonly LigneHistoriqueApi[],
): string {
  const categories = categoriesExportees(lignes);
  const entetes = [...ENTETES_CSV, ...categories].map(cellulesCsv).join(";");
  const corps = lignes.map((ligne) => {
    const parCategorie = new Map<string, number>();
    for (const { categorie, montant } of ligne.lignes)
      parCategorie.set(categorie, (parCategorie.get(categorie) ?? 0) + montant);
    return [
      ...[
        ligne.date,
        ligne.reference ?? "",
        LIBELLES_TYPES_HISTORIQUE[ligne.type],
        ligne.uniteLabel,
        ligne.modePaiement,
        ligne.activite,
        ligne.description,
      ].map(cellulesCsv),
      // Les montants restent des nombres : pas de neutralisation.
      montantCsv(ligne.montantTotal),
      ...categories.map((categorie) => {
        const montant = parCategorie.get(categorie);
        return montant === undefined ? "" : montantCsv(montant);
      }),
    ].join(";");
  });
  return `\uFEFF${[entetes, ...corps].join("\r\n")}\r\n`;
}

/** Type d'historique d'un envoi de dépense : la dépense de groupe est une « dépense ». */
export const typeHistoriqueDepense = (
  typeEnvoi: TypeEnvoi,
): Exclude<TypeHistorique, "recette"> =>
  typeEnvoi === "note-de-frais" ? "note-de-frais" : "depense";

/** Bornes (incluses, AAAA-MM-JJ) de l'année comptable commençant en `anneeDebut`. */
export function intervalleAnneeComptable(
  anneeDebut: number,
  debut: { mois: number; jour: number },
): { du: string; au: string } {
  const jourSuivantLaFin = Date.UTC(anneeDebut + 1, debut.mois - 1, debut.jour);
  const fin = new Date(jourSuivantLaFin - 24 * 60 * 60 * 1000);
  const deuxChiffres = (n: number) => String(n).padStart(2, "0");
  return {
    du: `${anneeDebut}-${deuxChiffres(debut.mois)}-${deuxChiffres(debut.jour)}`,
    au: `${fin.getUTCFullYear()}-${deuxChiffres(fin.getUTCMonth() + 1)}-${deuxChiffres(fin.getUTCDate())}`,
  };
}

/** AAAA-MM-JJ -> JJ/MM/AAAA (sans passer par `Date`, donc sans décalage de fuseau). */
export const formaterDateHistorique = (date: string) =>
  date.split("-").reverse().join("/");

const formateurMontant = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});
export const formaterMontantHistorique = (montant: number) =>
  formateurMontant.format(montant);
