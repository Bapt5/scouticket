import type { CategorieComptable } from "@/constants/configDepenses";

export const CATEGORIES_COMPTABLES_RECETTES: readonly CategorieComptable[] = [
  {
    libelle: "Autres subventions publiques",
    description: "Autre organisme public dont la nature n'existe pas",
  },
  {
    libelle: "CAF : autres Subventions CAF et Bons CAF",
    description:
      "Uniquement les subventions (ex: Appel à projets) et les bons CAF",
  },
  {
    libelle: "CAF : PSCAF",
    description:
      "Exclusivement : Alsh extra scolaire PSCAF : Prestation de Service de la CAF -> voir avec le territoire / Centre de ressources",
  },
  {
    libelle: "Cotisations SGDF",
    description:
      "Uniquement les cotisations versées par tous les adhérents et prélevées par le national -> par tout moyen de règlement : chq, chq vacances, virt, paiement en ligne, espèces,... => y compris les frais de commission et frais adm ANCV, en montant négatif",
  },
  {
    libelle: "Dons avec Reçu Fiscal",
    description:
      "Le don est un acte désintéressé, en aucun cas la participation de parents pour une activité de Scoutisme ne peut-être considérée comme un Don. Le montant doit être au minima celui que vous avez saisi dans intranet pour émission des RF aux familles et les dons en dehors de la période d'adhésion dont vous avez fait la demande au service donateur",
  },
  {
    libelle: "Dons, calendriers (sans reçu fiscal)",
    description:
      "Toutes les sommes versées par des particuliers qui ne donnent pas lieu à un reçu fiscal (calendriers, dons dans le cas où un reçu n'est pas demandé)",
  },
  {
    libelle: "Extra-Jobs",
    description:
      "Toutes les sommes reçues lors des extra-Job des Pionniers-Caravelles ou des Compagnons. => N'oubliez pas de consulter la fiche https://chefscadres.sgdf.fr/ressources/#/explore/file/1427/ => L'extra-job ne doit pas pouvoir être requalifié par la loi comme une activité commerciale (achat sans transformation pour revente interdit) ou une activité salariale (lien de subordination)",
  },
  {
    libelle:
      "Flux financiers entre structures (SAUF la participation aux activités)",
    description:
      "Transfert de fond entre : un territoire et un groupe // un groupe de mon territoire // un groupe hors de mon territoire // national et un groupe ou territoire SAUF pour les participations aux activités camp, WE, ... sauf si la nature existe : reversement de subvention, subvention municipale, formation, ...",
  },
  {
    libelle: "Formation",
    description: "Formation des chefs et responsables",
  },
  { libelle: "Locations/Mise à disposition de Matériel", description: "" },
  { libelle: "Mise à disposition Bases", description: "" },
  {
    libelle: "Participation Activités",
    description:
      "Tous les versements correspondant à la participations aux activités SGDF (WE, journée, mini-camps et les camps d'été, ...) -> par tout moyen de règlement : chq, chq vacances, virt, paiement en ligne en début année, y compris les frais de commission et frais adm ANCV, en montant négatif",
  },
  {
    libelle: "Participation frais de Fonctionnement",
    description:
      "Participation des familles au fonctionnement du groupe lors de l'Adhésion",
  },
  { libelle: "Produits financiers bancaires", description: "" },
  { libelle: "Recettes diverses", description: "" },
  {
    libelle: "Refacturation médecins, pharmaciens",
    description:
      "Remboursement des frais avancés pour une consultation chez le médecin",
  },
  {
    libelle: "Subvention Associations (paroisse, diocèse, Rotary…)",
    description: "",
  },
  {
    libelle: "Subvention Autres organismes Sociaux (MSA, …)",
    description:
      "Subventions accordées par la Mutualité sociale agricole, autre que les bons vacances.",
  },
  {
    libelle: "Subvention Département",
    description: "Subventions départementales",
  },
  {
    libelle: "Subvention Jeunesse et Sport",
    description: "Subventions Jeunesse et Sport",
  },
  { libelle: "Subvention Municipale", description: "Subventions municipales" },
  {
    libelle:
      "Subvention Organismes Privés (Entreprises, Fondation d'entreprises,...)",
    description: "",
  },
  { libelle: "Subvention Région", description: "Subventions régionales" },
  {
    libelle: "Subventions Internationales (hors France)",
    description: "Ex. : subvention versée par des organismes européens.",
  },
  {
    libelle: "Taxe de séjour",
    description:
      "La taxe de séjour doit être soldée à la fin de chaque exercice.",
  },
  {
    libelle: "Vente article boutique",
    description:
      "Revente des articles de la boutique du scoutisme aux familles et autre (lumière de Bethléem, ...)",
  },
];

export const LIBELLES_CATEGORIES_COMPTABLES_RECETTES: readonly string[] =
  CATEGORIES_COMPTABLES_RECETTES.map((categorie) => categorie.libelle);

/** Liste fixe des modes de paiement d'une recette : non personnalisable par le groupe. */
export const MOYENS_PAIEMENT_RECETTE = [
  "Virement",
  "Chèque",
  "Liquide",
  "Carte bancaire",
] as const;

export type MoyenPaiementRecette = (typeof MOYENS_PAIEMENT_RECETTE)[number];
