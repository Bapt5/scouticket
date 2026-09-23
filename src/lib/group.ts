export const COULEURS_UNITES = [
  "#6CC24A",
  "#F28C00",
  "#0072CE",
  "#E30613",
  "#00A19A",
  "#1E3A8A",
] as const;

const COULEUR_HEXADECIMALE = /^#[0-9a-f]{6}$/i;

export interface UniteGroupe {
  id: string;
  label: string;
  color: string;
}

/**
 * Unité en cours d'édition côté admin : `id` vaut `null` tant qu'elle n'a
 * pas encore été enregistrée, l'identifiant opaque étant généré côté base.
 */
export interface UniteBrouillon {
  id: string | null;
  label: string;
  color: string;
}

export const CLE_UNITE_SELECTIONNEE_PAR_ORGANISATION =
  "unitesSelectionneesParOrganisation";

export function lireUnitesSelectionnees(
  valeur: unknown,
): Record<string, string> {
  if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) return {};

  return Object.fromEntries(
    Object.entries(valeur).filter(
      ([identifiantOrganisation, uniteId]) =>
        typeof identifiantOrganisation === "string" &&
        typeof uniteId === "string",
    ),
  );
}

export function lireUniteSelectionnee(
  metadonnees: unknown,
  identifiantOrganisation: string | undefined,
  unites: UniteGroupe[],
): string {
  if (
    !metadonnees ||
    typeof metadonnees !== "object" ||
    !identifiantOrganisation
  )
    return "";

  const valeur = (metadonnees as Record<string, unknown>)[
    CLE_UNITE_SELECTIONNEE_PAR_ORGANISATION
  ];
  const uniteId = lireUnitesSelectionnees(valeur)[identifiantOrganisation];
  return typeof uniteId === "string" &&
    unites.some((unite) => unite.id === uniteId)
    ? uniteId
    : "";
}

// Les ids sont attribués côté base à l'enregistrement (voir appliquerUnites) :
// ces unités par défaut n'en portent volontairement pas encore.
export const UNITES_PAR_DEFAUT: UniteBrouillon[] = [
  ["Farfadets", "#6CC24A"],
  ["Louveteaux-Jeannettes", "#F28C00"],
  ["Scouts-Guides", "#0072CE"],
  ["Pionniers-Caravelles", "#E30613"],
  ["Compagnons", "#00A19A"],
  ["Groupe", "#1E3A8A"],
].map(([label, color]) => ({ id: null, label, color }));

function lireUnites(valeur: unknown): UniteBrouillon[] {
  if (!Array.isArray(valeur)) return [];
  return valeur.filter(
    (unite): unite is UniteBrouillon =>
      !!unite &&
      typeof unite === "object" &&
      (unite.id === null || typeof unite.id === "string") &&
      typeof unite.label === "string" &&
      typeof unite.color === "string",
  );
}

export function validerUnites(valeur: unknown): UniteBrouillon[] | null {
  const unites = lireUnites(valeur);
  if (unites.length === 0 || unites.length > 30) return null;
  const identifiants = new Set<string>();
  for (const unite of unites) {
    if (unite.id !== null) {
      if (!/^[a-z0-9-]{1,64}$/i.test(unite.id) || identifiants.has(unite.id))
        return null;
      identifiants.add(unite.id);
    }
    if (!unite.label.trim() || unite.label.trim().length > 80) return null;
    if (!COULEUR_HEXADECIMALE.test(unite.color)) return null;
  }
  return unites.map((unite) => ({ ...unite, label: unite.label.trim() }));
}
