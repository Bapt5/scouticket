# Configuration

## Configuration indispensable de Clerk

L’application utilise une organisation Clerk pour chaque groupe scout. Sans cette fonctionnalité, il est impossible de créer des groupes, de distinguer leurs configurations ou d’inviter les membres.

Dans le tableau de bord Clerk :

1. Activez **Organizations** dans les réglages de l’application.
2. Activez l’authentification par **e-mail** : les invitations de membres sont envoyées par e-mail.
3. Autorisez la création d’organisations par les utilisateurs : les responsables créent leur groupe depuis l’application.
4. Réglez la limite de membres par organisation pour qu’elle couvre les besoins de vos groupes.
5. Conservez les rôles par défaut : le créateur du groupe est administrateur et les personnes invitées sont membres.

Le mode « adhésion obligatoire » est recommandé : l’application est conçue pour fonctionner dans le contexte d’un groupe. Consultez la [documentation officielle de configuration des organisations Clerk](https://clerk.com/docs/guides/organizations/configure) si les libellés du tableau de bord évoluent.

## Configuration SMTP

Configurez un serveur SMTP qui peut envoyer les e-mails de justificatifs. Consultez la [référence des variables d’environnement](/technical/environment-variables) pour les valeurs attendues.

Pour Gmail, activez la validation en deux étapes et créez un mot de passe d’application. Pour les autres fournisseurs, utilisez les paramètres SMTP fournis par votre hébergeur.

## Configuration dans l’application

Après le déploiement, le créateur du groupe (Trésorier, rôle `owner`) configure les unités et leurs couleurs dans l’application. Les notes de frais peuvent être envoyées dès que le groupe compte au moins un Trésorier, ce qui est automatiquement le cas dès sa création.

Le format de nom des justificatifs (`/gestion-nomenclature`, `GET`/`PATCH /api/group/nomenclature`, responsables uniquement) est facultatif : sans format, le nom historique est conservé. La page gère séparément le format et les compteurs des dépenses et des recettes (paramètre `domaine` du `PATCH`, `"depense"` par défaut), l’année comptable restant commune aux deux. Le **début de l’année comptable** se règle dans `/parametres-groupe` (section « Année comptable »), la page de nomenclature n’en conservant que le format d’affichage. Le suivi budgétaire s’active dans `/parametres-groupe` (voir [Suivi budgétaire](/technical/suivi-budgetaire)). Il n’y a aucune variable d’environnement à ajouter.

La page **Paramètres du groupe** (`/parametres-groupe`, `GET`/`PATCH /api/group/parametres`, responsables uniquement) regroupe les fonctionnalités activables par groupe. Elle permet aujourd’hui d’activer le scan automatique des justificatifs, la conversion des justificatifs en PDF avant l’envoi et de personnaliser les moyens de paiement du groupe ; voir [Scan automatique des justificatifs](/technical/scan-justificatifs). Ces paramètres n’ajoutent aucune variable d’environnement : il suffit d’appliquer la migration avec `pnpm db:migrate`.
