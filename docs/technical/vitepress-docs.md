# Documentation VitePress (métadoc)

## Structure

```text
docs/
  index.md
  about.md
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
