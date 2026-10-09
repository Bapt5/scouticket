import { defineConfig } from "vitepress";

const urlDocumentation = "https://scoutreso.me";
// Mesure d'audience Umami, activée uniquement si les deux variables sont définies au build.
const urlScriptAudience = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL;
const identifiantSiteAudience = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
// Empreinte SHA-256 du certificat de scellement (non secrète), affichée sur /verifier-signature si définie au build.
const empreinteCertificat = process.env.NDF_SCELLEMENT_EMPREINTE_SHA256?.trim();
const imagePartage = `${urlDocumentation}/og-scoutreso.png`;

const metadonneesPages: Record<string, { titre: string; description: string }> =
  {
    "index.md": {
      titre: "Envoyez vos justificatifs dès que vous les avez",
      description:
        "Scoutréso aide les groupes scouts à centraliser leurs justificatifs et notes de frais : photos ou PDF envoyés immédiatement à la trésorerie, avec une copie pour chaque membre. Scan, note de frais signée, historique et suivi budgétaire sont des options.",
    },
    "about.md": {
      titre: "À propos",
      description:
        "Découvrez Scoutréso, l’outil gratuit et open source qui simplifie la gestion des justificatifs des groupes scouts.",
    },
    "verifier-signature.md": {
      titre: "Vérifier une note de frais signée",
      description:
        "Vérifiez qu'une note de frais signée Scoutréso n'a pas été modifiée : empreinte SHA-256 du certificat, Adobe Reader et ligne de commande.",
    },
    "guide/usage.md": {
      titre: "Envoyer un justificatif",
      description:
        "Apprenez à photographier ou importer un justificatif et à l’envoyer à la trésorerie avec Scoutréso.",
    },
    "guide/groupes.md": {
      titre: "Configurer un groupe",
      description:
        "Configurez la trésorerie, les unités et les invitations de votre groupe scout dans Scoutréso.",
    },
    "guide/e-mails.md": {
      titre: "Les e-mails de justificatifs",
      description:
        "Comprenez les informations, pièces jointes et copies envoyées par Scoutréso après chaque note de frais.",
    },
    "technical/overview.md": {
      titre: "Vue d’ensemble technique",
      description:
        "Architecture, fonctionnalités et choix techniques de Scoutréso : Next.js, Better Auth, SMTP et PWA.",
    },
    "technical/scan-justificatifs.md": {
      titre: "Scan automatique des justificatifs",
      description:
        "Activez et comprenez le recadrage automatique des justificatifs avec Scanic : paramètres du groupe, ML auto-hébergé et fonctionnement.",
    },
    "technical/ndf-signee.md": {
      titre: "Note de frais signée",
      description:
        "Comprenez le circuit de signature électronique à 3 niveaux des notes de frais Scoutréso : dépôt, code de vérification, chaînage cryptographique et certificat.",
    },
    "technical/historique.md": {
      titre: "Historique des dépenses et recettes",
      description:
        "Comprenez l'historique optionnel des dépenses, recettes et notes de frais de Scoutréso : données conservées, droits, rétention et écriture atomique.",
    },
    "technical/suivi-budgetaire.md": {
      titre: "Suivi budgétaire",
      description:
        "Comprenez le suivi budgétaire optionnel de Scoutréso : postes, budgets par année comptable, réalisé issu de l'historique, droits et suppression.",
    },
    "technical/local-installation.md": {
      titre: "Installation locale",
      description:
        "Installez et lancez Scoutréso en local pour contribuer au projet ou l’adapter à votre groupe.",
    },
    "technical/configuration.md": {
      titre: "Configuration",
      description:
        "Configurez Scoutréso pour l’authentification, l’envoi d’e-mails et le déploiement de l’application.",
    },
    "technical/environment-variables.md": {
      titre: "Variables d’environnement",
      description:
        "Référence des variables d’environnement nécessaires pour configurer Scoutréso en toute sécurité.",
    },
    "technical/docker.md": {
      titre: "Déploiement Docker",
      description:
        "Déployez Scoutréso avec Docker pour héberger l’application dans votre propre environnement.",
    },
    "technical/journalisation.md": {
      titre: "Journalisation structurée",
      description:
        "Référence des journaux structurés Scoutréso et de leurs champs pour un collecteur de logs.",
    },
    "technical/troubleshooting.md": {
      titre: "Dépannage",
      description:
        "Résolvez les problèmes fréquents d’installation, de configuration et d’envoi d’e-mails de Scoutréso.",
    },
    "technical/vitepress-docs.md": {
      titre: "Documentation VitePress",
      description:
        "Découvrez l’organisation et les conventions de rédaction de la documentation Scoutréso avec VitePress.",
    },
  };

export default defineConfig({
  lang: "fr-FR",
  title: "Scoutréso",
  description:
    "Documentation du projet Scoutréso, application de gestion de justificatifs et de notes de frais pour les scouts",
  base: "/",
  lastUpdated: true,
  head: [
    ["meta", { property: "og:site_name", content: "Scoutréso" }],
    ["meta", { property: "og:locale", content: "fr_FR" }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ...(urlScriptAudience && identifiantSiteAudience
      ? [
          [
            "script",
            {
              defer: "",
              src: urlScriptAudience,
              "data-website-id": identifiantSiteAudience,
            },
          ] as [string, Record<string, string>],
        ]
      : []),
    [
      "link",
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "https://scoutreso.me/favicon.svg",
      },
    ],
  ],
  transformPageData(pageData) {
    if (pageData.relativePath === "verifier-signature.md") {
      pageData.frontmatter.empreinteCertificat = empreinteCertificat;
    }
    const metadonnees = metadonneesPages[pageData.relativePath];
    if (!metadonnees) return;

    const chemin =
      pageData.relativePath === "index.md"
        ? "/"
        : `/${pageData.relativePath.replace(/\.md$/, ".html")}`;
    const urlCanonique = new URL(chemin, urlDocumentation).toString();
    const titre = `${metadonnees.titre} | Scoutréso`;

    pageData.frontmatter.title = metadonnees.titre;
    pageData.frontmatter.description = metadonnees.description;
    pageData.description = metadonnees.description;
    pageData.frontmatter.head = [
      ...(pageData.frontmatter.head ?? []),
      ["link", { rel: "canonical", href: urlCanonique }],
      ["meta", { property: "og:type", content: "website" }],
      ["meta", { property: "og:title", content: titre }],
      [
        "meta",
        { property: "og:description", content: metadonnees.description },
      ],
      ["meta", { property: "og:url", content: urlCanonique }],
      ["meta", { property: "og:image", content: imagePartage }],
      ["meta", { property: "og:image:width", content: "1730" }],
      ["meta", { property: "og:image:height", content: "909" }],
      ["meta", { name: "twitter:title", content: titre }],
      [
        "meta",
        { name: "twitter:description", content: metadonnees.description },
      ],
      ["meta", { name: "twitter:image", content: imagePartage }],
    ];
  },
  themeConfig: {
    nav: [
      { text: "Guide d’utilisation", link: "/guide/usage" },
      { text: "Vérifier une note signée", link: "/verifier-signature" },
      { text: "À propos", link: "/about" },
    ],
    sidebar: [
      {
        text: "Utilisateur",
        items: [
          { text: "Découvrir l’outil", link: "/" },
          { text: "Guide d'utilisation", link: "/guide/usage" },
          { text: "Configurer un groupe", link: "/guide/groupes" },
          { text: "Les e-mails de justificatifs", link: "/guide/e-mails" },
          { text: "Vérifier une note signée", link: "/verifier-signature" },
          { text: "À propos", link: "/about" },
        ],
      },
      {
        text: "Déploiement",
        collapsed: true,
        items: [
          { text: "Vue d'ensemble", link: "/technical/overview" },
          {
            text: "Installation locale",
            link: "/technical/local-installation",
          },
          { text: "Configuration", link: "/technical/configuration" },
          {
            text: "Scan des justificatifs",
            link: "/technical/scan-justificatifs",
          },
          {
            text: "Note de frais signée",
            link: "/technical/ndf-signee",
          },
          {
            text: "Historique",
            link: "/technical/historique",
          },
          {
            text: "Suivi budgétaire",
            link: "/technical/suivi-budgetaire",
          },
          {
            text: "Variables d'environnement",
            link: "/technical/environment-variables",
          },
          { text: "Déploiement Docker", link: "/technical/docker" },
          {
            text: "Journalisation structurée",
            link: "/technical/journalisation",
          },
          { text: "Dépannage", link: "/technical/troubleshooting" },
          {
            text: "Méta documentation VitePress",
            link: "/technical/vitepress-docs",
          },
        ],
      },
    ],
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/Bapt5/scoutreso",
      },
    ],
  },
  sitemap: {
    hostname: "https://scoutreso.me",
    lastmodDateOnly: false,
  },
});
