import {
  LIBELLE_NON_AFFECTE,
  type DomaineBudget,
  type LigneSuiviBudget,
} from "./budget";
import { analyserDateIso } from "./nomenclature";

const arrondir = (valeur: number) => Math.round(valeur * 100) / 100;
const arrondirPourcentage = (valeur: number) => Math.round(valeur * 10) / 10;

/** Seuil à partir duquel un poste de dépenses est « à surveiller » (en % du budget). */
export const SEUIL_SURVEILLANCE_DEPENSES = 80;
/** Une recette est « en retard » quand son taux est inférieur à l'avancement de l'année de cet écart (en points). */
export const MARGE_RETARD_RECETTES = 20;

export interface TotauxPilotage {
  prevu: number;
  realise: number;
  /** Effet sur le résultat : positif = favorable (recette en plus, dépense en moins). */
  ecart: number;
  /** Réalisé en % du prévu, `null` sans prévu. */
  taux: number | null;
}

export interface SynthesePilotage {
  recettes: TotauxPilotage;
  depenses: TotauxPilotage;
  resultat: TotauxPilotage;
  /** Postes (hors « Non affecté ») sans budget saisi, prévu compté pour 0. */
  postesSansBudget: number;
  /** Au moins un budget a été saisi. */
  aDesBudgets: boolean;
}

const somme = (
  lignes: readonly LigneSuiviBudget[],
  champ: "budget" | "realise",
) => arrondir(lignes.reduce((total, ligne) => total + (ligne[champ] ?? 0), 0));

const taux = (prevu: number, realise: number) =>
  prevu > 0 ? arrondirPourcentage((realise / prevu) * 100) : null;

/** Totaux prévu / réalisé des recettes et des dépenses, et résultat (recettes moins dépenses). */
export function synthese(
  depense: readonly LigneSuiviBudget[],
  recette: readonly LigneSuiviBudget[],
): SynthesePilotage {
  const prevuRecettes = somme(recette, "budget");
  const realiseRecettes = somme(recette, "realise");
  const prevuDepenses = somme(depense, "budget");
  const realiseDepenses = somme(depense, "realise");
  const prevuResultat = arrondir(prevuRecettes - prevuDepenses);
  const realiseResultat = arrondir(realiseRecettes - realiseDepenses);
  const lignesDePoste = [...depense, ...recette].filter(
    (ligne) => ligne.id !== null,
  );
  return {
    recettes: {
      prevu: prevuRecettes,
      realise: realiseRecettes,
      ecart: arrondir(realiseRecettes - prevuRecettes),
      taux: taux(prevuRecettes, realiseRecettes),
    },
    depenses: {
      prevu: prevuDepenses,
      realise: realiseDepenses,
      ecart: arrondir(prevuDepenses - realiseDepenses),
      taux: taux(prevuDepenses, realiseDepenses),
    },
    resultat: {
      prevu: prevuResultat,
      realise: realiseResultat,
      ecart: arrondir(realiseResultat - prevuResultat),
      taux: null,
    },
    postesSansBudget: lignesDePoste.filter((ligne) => ligne.budget === null)
      .length,
    aDesBudgets: lignesDePoste.some((ligne) => ligne.budget !== null),
  };
}

const joursDepuisEpoque = (date: string): number | null => {
  const analysee = analyserDateIso(date);
  if (!analysee) return null;
  return (
    Date.UTC(analysee.annee, analysee.mois - 1, analysee.jour) / 86_400_000
  );
};

/**
 * Part de l'année comptable écoulée (en %, bornes incluses), de 0 avant le
 * début à 100 après la fin. `null` si une date est invalide.
 */
export function avancementAnnee(
  du: string,
  au: string,
  aujourdhui: string,
): number | null {
  const debut = joursDepuisEpoque(du);
  const fin = joursDepuisEpoque(au);
  const jour = joursDepuisEpoque(aujourdhui);
  if (debut === null || fin === null || jour === null || fin < debut)
    return null;
  const total = fin - debut + 1;
  const ecoules = Math.min(Math.max(jour - debut + 1, 0), total);
  return arrondirPourcentage((ecoules / total) * 100);
}

export type StatutSurveillance = "depasse" | "a-surveiller" | "en-retard";

export const LIBELLES_STATUTS_SURVEILLANCE: Record<StatutSurveillance, string> =
  {
    depasse: "Budget dépassé",
    "a-surveiller": "À surveiller",
    "en-retard": "En retard sur l'objectif",
  };

export interface PosteASurveiller {
  id: string | null;
  label: string;
  domaine: DomaineBudget;
  statut: StatutSurveillance;
  libelleStatut: string;
  budget: number;
  realise: number;
  taux: number | null;
  /** Montant à l'origine du statut : dépassement, ou reste à dépenser / à encaisser. */
  montantConcerne: number;
}

const GRAVITE: Record<StatutSurveillance, number> = {
  depasse: 0,
  "en-retard": 1,
  "a-surveiller": 2,
};

/**
 * Postes demandant de l'attention. Dépenses : budget dépassé, ou consommé à
 * 80 % et plus. Recettes : taux inférieur de plus de 20 points à l'avancement
 * de l'année. Les postes sans budget et « Non affecté » ne sont pas jugés.
 */
export function postesASurveiller(
  depense: readonly LigneSuiviBudget[],
  recette: readonly LigneSuiviBudget[],
  avancement: number | null,
): PosteASurveiller[] {
  const resultats: PosteASurveiller[] = [];
  const ajouter = (
    ligne: LigneSuiviBudget,
    domaine: DomaineBudget,
    statut: StatutSurveillance,
    montantConcerne: number,
  ) =>
    resultats.push({
      id: ligne.id,
      label: ligne.label,
      domaine,
      statut,
      libelleStatut: LIBELLES_STATUTS_SURVEILLANCE[statut],
      budget: ligne.budget ?? 0,
      realise: ligne.realise,
      taux: ligne.budget === null ? null : taux(ligne.budget, ligne.realise),
      montantConcerne: arrondir(montantConcerne),
    });

  for (const ligne of depense) {
    if (ligne.id === null || ligne.budget === null) continue;
    const tauxLigne = taux(ligne.budget, ligne.realise);
    if (ligne.realise > ligne.budget)
      ajouter(ligne, "depense", "depasse", ligne.realise - ligne.budget);
    else if (tauxLigne !== null && tauxLigne >= SEUIL_SURVEILLANCE_DEPENSES)
      ajouter(ligne, "depense", "a-surveiller", ligne.budget - ligne.realise);
  }
  if (avancement !== null)
    for (const ligne of recette) {
      if (ligne.id === null || ligne.budget === null || ligne.budget <= 0)
        continue;
      const tauxLigne = taux(ligne.budget, ligne.realise) ?? 0;
      if (tauxLigne < avancement - MARGE_RETARD_RECETTES)
        ajouter(ligne, "recette", "en-retard", ligne.budget - ligne.realise);
    }

  return resultats.sort(
    (a, b) =>
      GRAVITE[a.statut] - GRAVITE[b.statut] ||
      b.montantConcerne - a.montantConcerne,
  );
}

export interface LigneComparaison {
  id: string | null;
  label: string;
  budget: number | null;
  realise: number;
  /** Réalisé de l'année précédente, `null` si inconnu (poste absent ou année indisponible). */
  realisePrecedent: number | null;
  /** Réalisé moins réalisé N-1, `null` sans valeur N-1. */
  evolution: number | null;
  /** Évolution en % du réalisé N-1, `null` si N-1 est inconnu ou nul. */
  evolutionPourcentage: number | null;
}

/**
 * Compare le réalisé de l'année avec celui de l'année précédente, poste par
 * poste (même identifiant ; « Non affecté » par son libellé). Sans année
 * précédente (`null`), toutes les valeurs N-1 sont inconnues.
 */
export function comparerAvecPrecedente(
  lignes: readonly LigneSuiviBudget[],
  lignesPrecedentes: readonly LigneSuiviBudget[] | null,
): LigneComparaison[] {
  const correspondante = (ligne: LigneSuiviBudget) =>
    lignesPrecedentes?.find((candidate) =>
      ligne.id === null
        ? candidate.id === null && candidate.label === LIBELLE_NON_AFFECTE
        : candidate.id === ligne.id,
    );
  const construire = (
    ligne: LigneSuiviBudget,
    precedente: LigneSuiviBudget | undefined,
  ): LigneComparaison => {
    const realisePrecedent =
      lignesPrecedentes === null
        ? null
        : precedente
          ? precedente.realise
          : ligne.id === null
            ? 0
            : null;
    return {
      id: ligne.id,
      label: ligne.label,
      budget: ligne.budget,
      realise: ligne.realise,
      realisePrecedent,
      evolution:
        realisePrecedent === null
          ? null
          : arrondir(ligne.realise - realisePrecedent),
      evolutionPourcentage:
        realisePrecedent === null || realisePrecedent <= 0
          ? null
          : arrondirPourcentage(
              ((ligne.realise - realisePrecedent) / realisePrecedent) * 100,
            ),
    };
  };

  const comparaisons = lignes.map((ligne) =>
    construire(ligne, correspondante(ligne)),
  );
  // « Non affecté » de N-1 sans équivalent cette année : il reste visible.
  const nonAffectePrecedent = lignesPrecedentes?.find(
    (ligne) => ligne.id === null,
  );
  if (nonAffectePrecedent && !lignes.some((ligne) => ligne.id === null))
    comparaisons.push(
      construire(
        { ...nonAffectePrecedent, budget: null, realise: 0 },
        nonAffectePrecedent,
      ),
    );
  return comparaisons;
}

/** Poste dont l'utilisateur consulte le détail (`id` nul : « Non affecté »). */
export interface SelectionPoste {
  id: string | null;
  label: string;
  domaine: DomaineBudget;
}
