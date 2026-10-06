# Variables d’environnement

Copiez `.env.example` vers `.env.local`, puis renseignez les variables suivantes. Ne commitez jamais `.env.local`.

## Better Auth

| Variable             | Requis | Description                                                                 |
| -------------------- | :----: | --------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` |   ✅   | Secret Better Auth pour les sessions et signatures                          |
| `BETTER_AUTH_URL`    |   ✅   | URL publique de l’application                                               |
| `AUDIT_LOG_SECRET`   |   ✅   | Secret distinct, utilisé pour chiffrer les identifiants des audits des logs |

Les événements `auth.audit.*` sont des lignes JSON sur stdout. OpenObserve doit ingérer les logs du conteneur applicatif ; ils ne contiennent ni e-mail, ni identifiant Better Auth brut, ni secret. Les champs `utilisateur` et `organisation` sont chiffrés avec AES-256-GCM et peuvent être déchiffrés avec `dechiffrerIdentifiant` et la même valeur de `AUDIT_LOG_SECRET`.

## Note de frais signée

| Variable                          |  Requis   | Description                                                                                                                                                                                                                                                                    |
| --------------------------------- | :-------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NDF_SCELLEMENT_P12_BASE64`       |    ✅     | Certificat de scellement (PKCS#12 en base64) utilisé pour signer électroniquement le PDF des notes de frais signées. Généré avec `pnpm ndf:certificat`                                                                                                                         |
| `NDF_SCELLEMENT_P12_MOT_DE_PASSE` |    ✅     | Mot de passe du certificat de scellement, généré avec lui                                                                                                                                                                                                                      |
| `PUPPETEER_EXECUTABLE_PATH`       | Optionnel | **Développement local uniquement.** Chemin vers un Chrome/Chromium installé sur la machine, utilisé pour générer le PDF des notes de frais signées. À laisser vide en production : `@sparticuz/chromium` (Linux) est utilisé automatiquement quand cette variable est absente. |

Requis pour signer une note de frais dès qu'un groupe active `ndf_signee_actif` (sinon la première signature échoue avec une erreur serveur). Voir [Note de frais signée](/technical/ndf-signee) pour le détail du circuit de signature et la génération du PDF (aucune variable supplémentaire en production : le rendu HTML→PDF utilise `@sparticuz/chromium`, embarqué, sans service externe).

En développement local, `@sparticuz/chromium` ne fournit qu'un binaire Linux : sans `PUPPETEER_EXECUTABLE_PATH` pointant vers un Chrome/Chromium local, la génération échoue avec `Failed to launch the browser process`.

## OpenObserve RUM

| Variable                               |  Requis   | Description                                    |
| -------------------------------------- | :-------: | ---------------------------------------------- |
| `NEXT_PUBLIC_OPENOBSERVE_SITE`         | Optionnel | URL de l’instance OpenObserve                  |
| `NEXT_PUBLIC_OPENOBSERVE_CLIENT_TOKEN` | Optionnel | Jeton navigateur OpenObserve                   |
| `NEXT_PUBLIC_OPENOBSERVE_ORGANISATION` | Optionnel | Organisation OpenObserve, `default` par défaut |

Lorsque le RUM est configuré et qu’un utilisateur est connecté, son adresse e-mail est transmise en clair à OpenObserve dans les contextes utilisateur RUM et Browser Logs. Les replays sont enregistrés pour 100 % des sessions. Cette configuration est réservée au mode test et ne prévoit pas de recueil de consentement.

## Mesure d’audience (Umami)

| Variable                       |  Requis   | Description                                                                                                  |
| ------------------------------ | :-------: | ------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_UMAMI_SCRIPT_URL` | Optionnel | URL du script Umami, par exemple `https://cloud.umami.is/script.js` (Umami Cloud) ou celle de votre instance |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | Optionnel | Identifiant du site fourni par Umami                                                                         |

Le script n’est ajouté aux pages que si **les deux** variables sont définies. Umami ne dépose pas de cookie et ne collecte pas d’identifiant personnel. Ces variables sont lues au build : redéployez après les avoir modifiées. Le site de documentation (VitePress) lit les mêmes variables au moment de `pnpm docs:build`.

## Publication des cartes sources OpenObserve

La publication GitHub Actions envoie automatiquement les cartes sources de chaque commit sur `main`, avant de publier l’image Docker. Configurez ces **secrets de dépôt GitHub** (et non des variables de l’application) :

| Secret               | Description                                                                    |
| -------------------- | ------------------------------------------------------------------------------ |
| `OPENOBSERVE_URL`    | URL HTTPS de l’instance OpenObserve, sans chemin d’API                         |
| `OPENOBSERVE_ORG_ID` | Identifiant de l’organisation OpenObserve                                      |
| `OPENOBSERVE_AUTH`   | Valeur complète de l’en-tête d’autorisation (`Basic …` ou `Bearer …`) de l’API |

Les cartes sont associées à `service=scoutreso-web`, `env=production` et au SHA complet du commit. Ces trois valeurs doivent correspondre exactement aux métadonnées RUM. Les fichiers `.map` ne sont jamais inclus dans l’image de production ni accessibles par les navigateurs.

## Connexion Google (optionnelle)

| Variable               |  Requis   | Description                        |
| ---------------------- | :-------: | ---------------------------------- |
| `GOOGLE_CLIENT_ID`     | Optionnel | Identifiant client OAuth de Google |
| `GOOGLE_CLIENT_SECRET` | Optionnel | Secret client OAuth de Google      |

Le bouton « Continuer avec Google » n’est affiché, et le fournisseur n’est activé côté serveur, que si les deux variables sont renseignées.

## Maintenance

| Variable           |  Requis   | Description                                                                                                                                                                                                     |
| ------------------ | :-------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAINTENANCE_MODE` | Optionnel | `true` affiche la page de maintenance, bloque les API avec un statut `503` et fait répondre `/api/health` avec `{ "ok": false, "status": "maintenance" }`. Toute autre valeur, dont `false`, désactive ce mode. |

Après avoir modifié cette variable dans l’environnement de production, redéployez ou redémarrez l’application.

## E-mail SMTP

| Variable          |  Requis   | Description                                | Exemple                          |
| ----------------- | :-------: | ------------------------------------------ | -------------------------------- |
| `SMTP_HOST`       |    ✅     | Serveur SMTP                               | `smtp.gmail.com`                 |
| `SMTP_PORT`       |    ✅     | Port SMTP                                  | `587`                            |
| `SMTP_SECURE`     |    ✅     | `true` pour le port 465, sinon `false`     | `false`                          |
| `SMTP_USER`       |    ✅     | Identifiant SMTP                           | `tresorerie@exemple.fr`          |
| `SMTP_PASSWORD`   |    ✅     | Mot de passe SMTP                          | Mot de passe d’application Gmail |
| `SMTP_FROM`       | Optionnel | Adresse ou expéditeur complet à utiliser   | `notes@exemple.fr`               |
| `SMTP_FROM_NAME`  | Optionnel | Nom affiché de l’expéditeur                | `Notes de frais`                 |
| `SMTP_FROM_EMAIL` | Optionnel | Adresse de repli si `SMTP_FROM` est absent | `notes@exemple.fr`               |

Il n’y a pas d’adresse de trésorerie configurée séparément : les notes de frais sont envoyées aux membres du groupe ayant le rôle Trésorier (`owner`), géré depuis la gestion des membres de l’application.

## Valeurs courantes

| Fournisseur     | `SMTP_HOST`             | `SMTP_PORT` | `SMTP_SECURE` |
| --------------- | ----------------------- | ----------- | ------------- |
| Gmail           | `smtp.gmail.com`        | `587`       | `false`       |
| Outlook/Hotmail | `smtp-mail.outlook.com` | `587`       | `false`       |
| Office 365      | `smtp.office365.com`    | `587`       | `false`       |
| SMTP avec SSL   | Selon le fournisseur    | `465`       | `true`        |
