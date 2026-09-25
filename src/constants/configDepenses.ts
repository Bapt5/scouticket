export interface CategorieComptable {
  readonly libelle: string;
  readonly description: string;
}

export const CATEGORIES_COMPTABLES: readonly CategorieComptable[] = [
  {
    libelle: "Abonnements documentation",
    description:
      "Tous types d'abonnements à des organismes extérieurs aux SGDF",
  },
  {
    libelle: "Achat destiné à la revente",
    description:
      'Achats faits à la boutique du scoutisme (scoutik) qui sont "revendus" aux familles (chemise, badges, livres, ...), lumière de Bethléem, ... Pour ce qui n\'est pas revendu -> achat de matériel pédagogique',
  },
  {
    libelle: "Achat Fournitures administratives",
    description: "Stylos, papeterie, ...",
  },
  { libelle: "Achat Gros Matériel", description: "" },
  {
    libelle: "Achat Matériel Pédagogique",
    description:
      "Achats faits par le groupe pour du matériel pédagogique : livres, bougies, écussons, déguisements pour imaginaire, ...",
  },
  {
    libelle: "Achat Petit Matériel",
    description: "Achat de petit matériel, sauf matériel pédagogique",
  },
  {
    libelle: "Affranchissement",
    description:
      "Affranchissement de la correspondance : timbres, lettre recommandée, lettre suivie, ...",
  },
  {
    libelle: "Alimentation, Intendance",
    description:
      "Alimentation pour les camps, les week-ends, les rassemblements, ... Détailler les tickets de caisse et tout ce qui n'est pas alimentaire -> achat de petit matériel",
  },
  {
    libelle: "Assurances",
    description:
      "Toutes les assurances contractées et prélevées directement par le national (locaux, véhicule, ...) ou contractées dans d'autres organismes",
  },
  {
    libelle: "Autres cotisations",
    description:
      'Toutes les autres cotisations qui ne sont pas les "cotisations SGDF" prélevées par le national (via le journal de structure de l\'intranet)',
  },
  {
    libelle: "Cadeaux, pourboires, dons",
    description:
      "Achats de cadeaux offerts ou pourboires, cadeaux au propriétaire du lieu de camp, dons faits par le groupe",
  },
  {
    libelle: "CAF : Reversion PSCAF",
    description:
      "Pour les territoires qui reçoivent la PSCAF et la reversent aux groupes (1 écriture par groupe)",
  },
  {
    libelle: "Carburant",
    description:
      "Achat de carburant pour les voitures, camions (par un moyen de paiement de la structure, sinon remboursement NDF)",
  },
  {
    libelle: "Eau",
    description:
      "Abonnement et consommation rattachés au local ou à l'activité",
  },
  {
    libelle: "Electricité",
    description:
      "Abonnement et consommation rattachés au local ou à l'activité",
  },
  {
    libelle: "Entretien Locaux",
    description:
      "Tous les entretiens des locaux petits ou gros, y compris achat de clef pour le local, ...",
  },
  {
    libelle: "Entretien Matériel",
    description:
      "Achat de pièces de rechange en vue de réparer ou entretenir du matériel existant",
  },
  {
    libelle: "Entretien Véhicule/Bateau",
    description:
      "Entretien des véhicules et des bateaux. S'il y a eu une déclaration d'assurance, mettre le remboursement par une écriture de dépense avec une somme négative",
  },
  {
    libelle:
      "Flux financiers entre structures (SAUF la participation aux activités)",
    description:
      "Transfert de fonds entre un territoire et un groupe, un groupe de mon territoire, un groupe hors de mon territoire, le national et un groupe ou territoire. SAUF pour les participations aux activités (camp, WE, ...), sauf si la nature existe : reversement de subvention, subvention municipale, formation, ...",
  },
  {
    libelle: "Formation",
    description: "Formation des chefs et responsables",
  },
  {
    libelle: "Frais Bancaires",
    description:
      "Frais de tenue de compte bancaire, de commande et d'envoi de chéquiers, de vol ou perte de chéquiers, de cartes bancaires. Pas les frais des chèques vacances ni les commissions de paiement en ligne -> à mettre en recette de la nature initiale, en somme négative",
  },
  {
    libelle: "Frais communication et Internet",
    description: "Factures de téléphone, abonnement internet",
  },
  {
    libelle: "Gaz : abonnement au réseau",
    description:
      'Uniquement "gaz de ville" (EDF, Engie, Total Direct Energie, ...). NB : les achats de bouteilles de gaz sont à mettre en "Gaz : achat de bouteille"',
  },
  {
    libelle: "Gaz : achat de bouteille",
    description:
      'Uniquement bouteilles de gaz. NB : le gaz de ville est à mettre dans "Gaz : abonnement au réseau"',
  },
  {
    libelle: "Honoraires/prestataires extérieurs",
    description:
      "Sommes dues que vous versez à certains intervenants extérieurs ou artistes pour leur prestation dans le cadre d'une activité exceptionnelle (veillée, colloque)",
  },
  {
    libelle: "Hébergement, séminaire",
    description:
      "Pour une unité qui dormirait lors d'un week-end ou camp dans une structure payante",
  },
  {
    libelle: "Imprimés, Annonces",
    description:
      "Tout ce qui concerne la publicité, les documents édités pour de la communication à l'extérieur de l'association SGDF",
  },
  {
    libelle: "Location Matériel",
    description: "Toute location de matériel : outillage, sono, podium, etc.",
  },
  {
    libelle: "Location Véhicule/Bateau",
    description:
      "Location d'un véhicule pour une activité ou un camp, sans chauffeur. Location de bateaux",
  },
  {
    libelle: "Loyer et Charges locatives",
    description: "Location de bâtiment et charges afférentes à ce bâtiment",
  },
  {
    libelle: "Médecin, Pharmacie",
    description:
      "Frais avancés pour une consultation chez le médecin et pharmacie. Achats pour mise à niveau d'une trousse de secours, d'une petite pharmacie, avance de médicaments à la suite d'une visite chez le médecin. Penser à demander le remboursement aux familles (nature de la recette = refacturation médecin, pharmacie)",
  },
  {
    libelle: "Participation Activités",
    description:
      "Tous les versements correspondant à la participation aux activités SGDF (WE, journée, mini-camps et camps d'été, ...), par tout moyen de règlement : chèque, chèque vacances, virement, paiement en ligne en début d'année, y compris les frais de commission et frais administratifs ANCV, en montant négatif",
  },
  {
    libelle: "Péage-Parking",
    description:
      "Ticket de péage payé avec la carte du groupe, ainsi que les parkings",
  },
  {
    libelle: "Remboursement via Ndf frais de transport",
    description:
      "Tous les déplacements rentrant dans le cadre d'activités scoutes ou guides avancés par les personnes (donc note de frais), sauf péage",
  },
  {
    libelle: "Reversion Subvention",
    description:
      "Reversion d'une subvention perçue par un échelon pour un autre échelon (PSCAF par exemple)",
  },
  {
    libelle: "Taxe de séjour",
    description:
      "La taxe de séjour doit être soldée à la fin de chaque exercice",
  },
  { libelle: "Taxes foncières", description: "Impôt taxes foncières" },
  { libelle: "Taxes habitations", description: "Impôt taxes d'habitation" },
  { libelle: "Taxes portuaires et droits de douane", description: "" },
  {
    libelle: "Transport collectif : en Autocar",
    description:
      "Autocar privé avec chauffeur. Autocar public longue distance (exemple : Flixbus, compagnies diverses)",
  },
  {
    libelle: "Transport collectif : en Avion",
    description:
      "Achat de billet d'avion avec un des moyens de paiement du groupe",
  },
  {
    libelle: "Transport collectif : en Bateau",
    description:
      "Achat de billet de bateau avec un des moyens de paiement du groupe",
  },
  {
    libelle: "Transport collectif en commun (RER, métro, Tram, bus, etc.)",
    description: "Transport en commun ville et banlieue",
  },
  {
    libelle: "Transport collectif Train",
    description:
      "Achat de billet de train avec un des moyens de paiement du groupe",
  },
  {
    libelle: "Travaux, Gros entretiens",
    description: "Investissements autorisés par le conseil d'administration",
  },
  {
    libelle: "Visas/passeport",
    description:
      "Frais liés à l'obtention de visas et de passeports pour les participants aux activités SGDF",
  },
];

export const LIBELLES_CATEGORIES_COMPTABLES: readonly string[] =
  CATEGORIES_COMPTABLES.map((categorie) => categorie.libelle);

export const MOYENS_PAIEMENT_GROUPE = [
  "Carte de procurement",
  "Espèces du groupe",
  "Virement du groupe",
  "Chèque du groupe",
] as const;

export type MoyenPaiementGroupe = (typeof MOYENS_PAIEMENT_GROUPE)[number];
