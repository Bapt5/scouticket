/**
 * Correspondance entre les catégories comptables de l'app
 * (`src/constants/configDepenses.ts`) et les 3 colonnes de frais du
 * template SGDF (`TRANSPORT avec justificatifs`, `HEBERGEMENT/INTENDANCE`,
 * `AUTRE FRAIS EN MISSION`). L'app ne capture pas de kilométrage : la
 * colonne "TRANSPORT Nb kilomètres" du template reste donc toujours à 0.
 * Toute catégorie non listée ci-dessous tombe par défaut dans "autreFrais".
 * Seules les catégories autorisées en note de frais
 * (`categoriesPourTypeEnvoi("note-de-frais")`) peuvent arriver ici : les
 * autres transports (autocar, avion, bateau, train, transports en commun) et
 * le carburant ne se paient qu'avec un moyen de paiement du groupe.
 */
export type ColonneSgdf = "transport" | "hebergementIntendance" | "autreFrais";

const CATEGORIES_TRANSPORT = new Set<string>([
  "Remboursement via Ndf frais de transport",
  "Péage-Parking",
]);

const CATEGORIES_HEBERGEMENT_INTENDANCE = new Set<string>([
  "Hébergement, séminaire",
  "Alimentation, Intendance",
]);

export function colonneSgdf(categorieComptable: string): ColonneSgdf {
  if (CATEGORIES_TRANSPORT.has(categorieComptable)) return "transport";
  if (CATEGORIES_HEBERGEMENT_INTENDANCE.has(categorieComptable))
    return "hebergementIntendance";
  return "autreFrais";
}
