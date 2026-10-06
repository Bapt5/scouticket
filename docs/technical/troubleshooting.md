# Dépannage

## Erreurs d’authentification fréquentes

- **Redirection en boucle** : vérifier que `BETTER_AUTH_URL` correspond à l’URL publique de l’application
- **Accès refusé** : vérifier `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` et que les migrations (`pnpm auth:migrate`, `pnpm db:migrate`) ont été appliquées
- **Impossible de créer ou sélectionner un groupe** : vérifier que les migrations ont été appliquées et consulter les logs du serveur
- **Impossible d’inviter un membre** : vérifier la configuration SMTP, l’invitation étant envoyée par e-mail

## Erreurs SMTP fréquentes

- **Invalid login** : identifiants SMTP incorrects
- **Connection error** : hôte/port/firewall non valides
- **Envoi partiel** : vérifier quotas fournisseur email

## Problèmes mobile / PWA

- Caméra indisponible : vérifier HTTPS
- PWA non installable : ouvrir `https://app.scoutreso.me/manifest.json` dans le navigateur. Il doit afficher du JSON (et non la page de connexion) ; puis vérifier le service worker. Sur Android, utiliser Chrome, ouvrir le menu ⋮ puis choisir « Installer l'application » ou « Ajouter à l'écran d'accueil ».
- Hors ligne limité : comportement normal (envoi nécessite réseau)

## Checklist rapide

- Variables d’environnement complètes
- `BETTER_AUTH_URL` identique à l’URL publique
- Test d’envoi vers Trésorier(s) + utilisateur validé
- Migrations Better Auth et applicatives appliquées
- Le groupe compte au moins un membre avec le rôle Trésorier
- Build local et déploiement sans erreur
