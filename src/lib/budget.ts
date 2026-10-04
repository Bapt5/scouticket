/** Domaine d'un poste budgétaire : une dépense ou une recette. */
export const DOMAINES_BUDGET = ["depense", "recette"] as const;
export type DomaineBudget = (typeof DOMAINES_BUDGET)[number];

export const LIBELLES_DOMAINES_BUDGET: Record<DomaineBudget, string> = {
  depense: "Dépenses",
  recette: "Recettes",
};

export interface PosteBudgetaire {
  id: string;
  domaine: DomaineBudget;
  label: string;
}

/**
 * Poste en cours d'édition côté responsable : `id` vaut `null` tant qu'il n'a
 * pas été enregistré (l'identifiant est généré côté serveur).
 */
export interface PosteBrouillon {
  id: string | null;
  domaine: DomaineBudget;
  label: string;
}

export const NOMBRE_MAX_POSTES_PAR_DOMAINE = 40;
export const LONGUEUR_MAX_LIBELLE_POSTE = 80;
/** Libellé affiché pour les écritures sans poste (antérieures, supprimé). */
export const LIBELLE_NON_AFFECTE = "Non affecté";
/** Valeur du filtre `poste` de l'historique pour les lignes sans poste. */
export const VALEUR_NON_AFFECTE = "non-affecte";

const POSTES_DEPENSES_PAR_DEFAUT = [
  "Adhésion (part national)",
  "Assurance",
  "Camp",
  "Conseil de groupe",
  "Formation",
  "Frais bancaire",
  "Frais de déplacements",
  "Matériel",
  "Rencontre pendant l'année",
];

const POSTES_RECETTES_PAR_DEFAUT = [
  "Adhésion",
  "Calendrier",
  "Camp",
  "Extra-job",
  "Subventions",
];

/** Postes créés à l'activation du suivi quand le groupe n'en a aucun. */
export const POSTES_PAR_DEFAUT: PosteBrouillon[] = [
  ...POSTES_DEPENSES_PAR_DEFAUT.map((label) => ({
    id: null,
    domaine: "depense" as const,
    label,
  })),
  ...POSTES_RECETTES_PAR_DEFAUT.map((label) => ({
    id: null,
    domaine: "recette" as const,
    label,
  })),
];

function normaliser(libelle: string): string {
  return libelle.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Valide une liste de postes (labels non vides, uniques par domaine). `null` si invalide. */
export function validerPostes(valeur: unknown): PosteBrouillon[] | null {
  if (!Array.isArray(valeur)) return null;
  const postes: PosteBrouillon[] = [];
  for (const element of valeur) {
    if (!element || typeof element !== "object") return null;
    const { id, domaine, label } = element as Record<string, unknown>;
    if (id !== null && (typeof id !== "string" || id.length === 0)) return null;
    if (!DOMAINES_BUDGET.includes(domaine as DomaineBudget)) return null;
    if (typeof label !== "string") return null;
    const libelle = label.trim();
    if (libelle.length === 0 || libelle.length > LONGUEUR_MAX_LIBELLE_POSTE)
      return null;
    postes.push({ id, domaine: domaine as DomaineBudget, label: libelle });
  }
  for (const domaine of DOMAINES_BUDGET) {
    const libelles = postes
      .filter((poste) => poste.domaine === domaine)
      .map((poste) => normaliser(poste.label));
    if (libelles.length > NOMBRE_MAX_POSTES_PAR_DOMAINE) return null;
    if (new Set(libelles).size !== libelles.length) return null;
  }
  const ids = postes.flatMap((poste) => (poste.id ? [poste.id] : []));
  if (new Set(ids).size !== ids.length) return null;
  return postes;
}

/** Ligne du tableau de suivi pour un poste (ou « Non affecté » quand `id` vaut `null`). */
export interface LigneSuiviBudget {
  id: string | null;
  label: string;
  /** Budget prévisionnel de l'année comptable, `null` tant qu'il n'est pas saisi. */
  budget: number | null;
  realise: number;
}

/** Solde restant : budget moins réalisé pour une dépense, réalisé moins budget pour une recette. */
export function soldeLigne(
  ligne: LigneSuiviBudget,
  domaine: DomaineBudget,
): number | null {
  if (ligne.budget === null) return null;
  const solde =
    domaine === "depense"
      ? ligne.budget - ligne.realise
      : ligne.realise - ligne.budget;
  return Math.round(solde * 100) / 100;
}

/** Part du budget consommée (en %), `null` sans budget ou budget nul. */
export function tauxRealisation(ligne: LigneSuiviBudget): number | null {
  if (ligne.budget === null || ligne.budget <= 0) return null;
  return Math.round((ligne.realise / ligne.budget) * 1000) / 10;
}

/** Vrai quand le réalisé dépasse le budget prévu. */
export function depasseBudget(ligne: LigneSuiviBudget): boolean {
  return ligne.budget !== null && ligne.realise > ligne.budget;
}

const ENTETES_CSV_SUIVI = [
  "Type",
  "Poste",
  "Budget",
  "Réalisé",
  "Solde",
  "Taux de réalisation (%)",
];

/** CSV du suivi budgétaire (dépenses puis recettes) pour l'année comptable choisie. */
export function genererCsvSuivi(
  suivi: Record<DomaineBudget, LigneSuiviBudget[]>,
  formaterCellule: (valeur: string) => string,
  formaterMontant: (montant: number) => string,
): string {
  const corps = DOMAINES_BUDGET.flatMap((domaine) =>
    suivi[domaine].map((ligne) => {
      const solde = soldeLigne(ligne, domaine);
      const taux = tauxRealisation(ligne);
      return [
        formaterCellule(LIBELLES_DOMAINES_BUDGET[domaine]),
        formaterCellule(ligne.label),
        ligne.budget === null ? "" : formaterMontant(ligne.budget),
        formaterMontant(ligne.realise),
        solde === null ? "" : formaterMontant(solde),
        taux === null ? "" : String(taux).replace(".", ","),
      ].join(";");
    }),
  );
  const entetes = ENTETES_CSV_SUIVI.map(formaterCellule).join(";");
  return `﻿${[entetes, ...corps].join("\r\n")}\r\n`;
}
