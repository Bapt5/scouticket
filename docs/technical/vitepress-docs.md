# Documentation VitePress (métadoc)

## Structure

```text
docs/
  index.md
  about.md
  verifier-signature.md
  mentions-legales.md
  confidentialite.md
  guide/
    usage.md
    groupes.md
    e-mails.md
  technical/
    overview.md
    local-installation.md
    configuration.md
    environment-variables.md
    docker.md
    historique.md
    journalisation.md
    ndf-signee.md
    scan-justificatifs.md
    suivi-budgetaire.md
    troubleshooting.md
    vitepress-docs.md
  .vitepress/config.mts
  .vitepress/donnees-legales.ts
  .vitepress/theme/custom.css
```

## Navigation

- Navigation haute : accès rapide aux sections clés
- Sidebar : parcours complet par thème

## Convention de rédaction

- Français simple, orienté action
- Titres explicites
- Étapes numérotées pour les procédures
- Blocs « Captures à venir » avec un nom de fichier et une légende pour les captures à ajouter

## Schémas et maquettes de la page d'accueil

Les schémas et démos de `index.md` sont en HTML/CSS (aucun plugin), stylés dans `.vitepress/theme/custom.css` avec les variables VitePress (thèmes clair et sombre).

- `.schema-flux` / `.schema-etape` / `.schema-fleche` : suite d'étapes numérotées
- `.fonction` : une fonctionnalité, avec `.fonction-texte` (schéma, exemple) et une `.maquette`
- `.badge-base` / `.badge-option` : pastille « Toujours disponible » / « Optionnel »
- `.maquette` (`-barre`, `-corps`, `-ligne`, `-champ`, `-bouton`, `-code`, `-scan`, `-jauge`) : mini-écran de démonstration
- `.schema-dependances` / `.schema-chaine` : options qui en supposent une autre

Chaque schéma ou maquette porte `role="img"` et un `aria-label`; les éléments décoratifs ont `aria-hidden="true"`. Dans un bloc HTML, aucune ligne vide (sauf autour du contenu Markdown d'un `.fonction-texte`).

## Mentions légales et confidentialité

Les pages `mentions-legales.md` et `confidentialite.md` lisent leurs données (hébergeurs, contact, sous-traitants, date de mise à jour) dans `.vitepress/donnees-legales.ts`, injectées dans le frontmatter par `transformPageData`. Ce sont des données publiques : pas de variable d'environnement. Les modifier quand un hébergeur ou le contact change, et à chaque nouveau service tiers (voir la règle « Intégration de services externes » de `CLAUDE.md`). Les valeurs `[À COMPLÉTER]` doivent être remplacées avant mise en ligne. Les liens vers ces pages sont dans la sidebar (groupe « Informations légales ») et dans le pied de page de l'accueil, le thème par défaut masquant le pied de page quand la sidebar est affichée.
