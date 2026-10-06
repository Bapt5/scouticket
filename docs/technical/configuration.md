# Configuration

## Authentification et groupes (Better Auth)

L’authentification, les groupes (organisations), les membres et les invitations sont gérés par l’application elle-même avec Better Auth : il n’y a pas de tableau de bord externe à configurer. Les données sont stockées dans votre base PostgreSQL.

1. Renseignez `DATABASE_URL`, `BETTER_AUTH_SECRET` (valeur aléatoire longue) et `BETTER_AUTH_URL` (URL publique de l’application). Voir la [référence des variables d’environnement](/technical/environment-variables).
2. Appliquez les migrations : `pnpm auth:migrate` (schéma Better Auth), puis `pnpm db:migrate` (tables de l’application).
3. Configurez le serveur SMTP ci-dessous : il sert à confirmer les adresses e-mail, à réinitialiser les mots de passe et à envoyer les invitations de membres.
4. Facultatif : renseignez `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` pour proposer « Continuer avec Google ».

Les rôles sont `owner` (Trésorier), `admin` (responsable) et `member`. Les responsables créent leur groupe et invitent les membres depuis l’application.

## Configuration SMTP

Configurez un serveur SMTP qui peut envoyer les e-mails de justificatifs. Consultez la [référence des variables d’environnement](/technical/environment-variables) pour les valeurs attendues.

Pour Gmail, activez la validation en deux étapes et créez un mot de passe d’application. Pour les autres fournisseurs, utilisez les paramètres SMTP fournis par votre hébergeur.

## Configuration dans l’application

Après le déploiement, le créateur du groupe (Trésorier, rôle `owner`) configure les unités et leurs couleurs dans l’application. Les notes de frais peuvent être envoyées dès que le groupe compte au moins un Trésorier, ce qui est automatiquement le cas dès sa création.

Le format de nom des justificatifs (`/gestion-nomenclature`, `GET`/`PATCH /api/group/nomenclature`, responsables uniquement) est facultatif : sans format, le nom historique est conservé. La page gère séparément le format et les compteurs des dépenses et des recettes (paramètre `domaine` du `PATCH`, `"depense"` par défaut), l’année comptable restant commune aux deux. Le **début de l’année comptable** se règle dans `/parametres-groupe` (section « Année comptable »), la page de nomenclature n’en conservant que le format d’affichage. Le suivi budgétaire s’active dans `/parametres-groupe` (voir [Suivi budgétaire](/technical/suivi-budgetaire)). Il n’y a aucune variable d’environnement à ajouter.

La page **Paramètres du groupe** (`/parametres-groupe`, `GET`/`PATCH /api/group/parametres`, responsables uniquement) regroupe les fonctionnalités activables par groupe. Elle permet aujourd’hui d’activer le scan automatique des justificatifs, la conversion des justificatifs en PDF avant l’envoi et de personnaliser les moyens de paiement du groupe ; voir [Scan automatique des justificatifs](/technical/scan-justificatifs). Ces paramètres n’ajoutent aucune variable d’environnement : il suffit d’appliquer la migration avec `pnpm db:migrate`.
