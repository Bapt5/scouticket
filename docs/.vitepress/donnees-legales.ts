// Données publiques des pages « Mentions légales » et « Politique de confidentialité ».
// Aucune donnée secrète ici : ce fichier est versionné pour que chaque changement
// (hébergeur, contact, sous-traitant) soit relu. À mettre à jour dès qu'un service
// tiers change (voir docs/technical/vitepress-docs.md).

export const A_COMPLETER = "[À COMPLÉTER]";

export interface Prestataire {
  nom: string;
  raisonSociale: string;
  role: string;
  adresse: string;
  contact: string;
  siteWeb: string;
  donnees: string;
  localisation: string;
}

export const donneesLegales = {
  derniereMiseAJour: "2026-10-10",
  contact: "contact@scoutreso.me",
  depotCode: "https://github.com/Bapt5/scoutreso",
  hebergeurs: [
    {
      nom: "Vercel",
      raisonSociale: "Vercel Inc.",
      role: "Hébergement du site de documentation (scoutreso.me) et de l'application (app.scoutreso.me)",
      adresse: "440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis",
      contact: "privacy@vercel.com",
      siteWeb: "https://vercel.com",
      donnees:
        "Exécution de l'application et journaux techniques d'accès (adresse IP, date, page demandée)",
      localisation:
        "Société américaine, adhérente au cadre de protection des données UE-États-Unis",
    },
    {
      nom: "Neon",
      raisonSociale: "Neon, LLC (groupe Databricks)",
      role: "Hébergement de la base de données PostgreSQL de l'application",
      adresse: "Databricks Inc., 160 Spear Street, Suite 1300, San Francisco, CA 94105",
      contact: "privacy@databricks.com",
      siteWeb: "https://neon.com",
      donnees:
        "Comptes, groupes, paramètres, historique et suivi budgétaire (si activés), notes de frais en cours de signature",
      localisation:
        "Région AWS Europe Central 1 (Francfort, Allemagne), dans l'Union européenne",
    },
  ] satisfies Prestataire[],
  registrar: {
    nom: "Namecheap",
    raisonSociale: "Namecheap, Inc.",
    role: "Enregistrement du nom de domaine scoutreso.me et gestion des DNS",
    adresse:
      "4600 East Washington Street, Suite 300, Phoenix, AZ 85034, États-Unis",
    contact: "support@namecheap.com",
    siteWeb: "https://www.namecheap.com",
    donnees: "Aucune donnée d'utilisateur de l'application",
    localisation: "Société américaine",
  } satisfies Prestataire,
  sousTraitantsSupplementaires: [
    {
      nom: "Resend",
      raisonSociale: "Plus Five Five, Inc. (Resend)",
      role: "Envoi des e-mails (justificatifs, vérification d'adresse, réinitialisation de mot de passe, invitations, signatures)",
      adresse: "2261 Market Street #5039, San Francisco, CA 94114",
      contact: "support@resend.com",
      siteWeb: "https://resend.com",
      donnees:
        "Adresses e-mail de l'expéditeur et des destinataires, contenu et pièces jointes des messages le temps de leur envoi",
      localisation:
        "Envoi depuis la région Irlande (UE). Les données de compte, métadonnées et journaux de Resend restent stockés aux États-Unis, société adhérente au cadre de protection des données UE-États-Unis",
    },
  ] satisfies Prestataire[],
};

export type DonneesLegales = typeof donneesLegales;
