# Scan automatique des justificatifs

Chaque groupe peut activer le recadrage automatique des justificatifs (ticket, facture) depuis **Administration** puis **Paramètres du groupe** (`/parametres-groupe`, responsables uniquement). Par défaut, le scan est désactivé et le comportement historique (simple réduction de l’image) est conservé.

## Comportement

| Situation                           | Scan désactivé             | Scan activé                                                                                                                                           |
| ----------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prendre une photo                   | Image réduite puis ajoutée | Détection des bords puis aperçu du recadrage. Si rien n’est détecté, un message jaune invite à ajuster les coins, dont l’éditeur s’ouvre directement. |
| Importer une image                  | Image réduite puis ajoutée | Détection puis aperçu du recadrage : **Utiliser le recadrage**, **Ajuster les coins**, **Garder l’original** ou **Annuler**.                          |
| Importer un PDF ou un autre fichier | Ajouté tel quel            | Ajouté tel quel (aucun recadrage).                                                                                                                    |

Le résultat du scan est un JPEG qui repasse par les mêmes contrôles qu’avant (type MIME, taille maximale, réduction à 1600 px, nombre de justificatifs). Le serveur (`POST /api/send-expense`) n’est pas modifié : les fichiers ne sont toujours ni stockés ni envoyés ailleurs que dans l’e-mail. Le nom d’origine du fichier est conservé dans `nomFichierOriginal`.

Un bouton **Annuler** interrompt une détection en cours ; en cas d’erreur de Scanic, l’image d’origine reste utilisable.

## Détection : ML puis repli classique

Il n’y a qu’un seul paramètre, le vocabulaire « ML » étant trop technique pour les membres. `detecterCoins` (`src/lib/scanJustificatif.ts`) essaie **toujours le détecteur ML en premier** (plus fiable sur les photos difficiles) puis se replie sur le détecteur classique de Scanic si :

- le modèle (~2 Mo) n’est pas chargé au bout de 10 s (connexion lente) ;
- le ML échoue (erreur de chargement, de WebAssembly, etc.) ;
- le ML ne trouve aucun document.

Ces échecs ne sont pas montrés aux membres (ils sont seulement journalisés dans la console du navigateur). Si les deux détecteurs échouent, l’aperçu affiche un message jaune invitant à ajuster les coins à la main.

## Paramètres du groupe

Les paramètres sont stockés dans `scouticket_group_data` (migrations `sql/008_parametres_groupe.sql` et `sql/009_convertir_justificatifs_pdf.sql`, à appliquer avec `pnpm db:migrate`) :

- `scan_justificatifs_actif` : active le scan (défaut : `false`).
- `convertir_justificatifs_pdf` : convertit les justificatifs en PDF avant l’envoi (défaut : `false`). Voir [Conversion en PDF](#conversion-en-pdf).

`GET /api/group/parametres` est lisible par tous les membres ; `PATCH /api/group/parametres` (mise à jour partielle) est réservé aux responsables. Les paramètres sont aussi renvoyés par `GET /api/group/config` (`parametres`), ce qui évite un appel supplémentaire depuis l’accueil. La page est conçue pour accueillir d’autres paramètres : il suffit d’ajouter une colonne, un champ dans `src/lib/parametresGroupe.ts` et un `InterrupteurParametre`.

## Conversion en PDF

Indépendante du scan, l’option `convertir_justificatifs_pdf` est appliquée **côté serveur** par `POST /api/send-expense` (`src/lib/conversionJustificatifs.ts`), à partir du paramètre lu en base : le client n’a pas à la connaître. Elle s’exécute avant le nommage des pièces jointes, pour que les extensions soient `.pdf`.

- Chaque image (JPEG, PNG, WebP) devient un PDF d’une page (un PDF par justificatif, pas de fusion), réduite pour tenir sur un A4 si nécessaire (`pdf-lib` ; `sharp` applique l’orientation EXIF et transcode le WebP).
- Les PDF sont conservés tels quels ; il n’y a pas de conversion PDF → image.
- Les limites de taille (8 Mo par fichier, 20 Mo au total) s’appliquent avant conversion. Aucun fichier n’est stocké.
- Dépendances : `pdf-lib` et `sharp` (binaire natif, disponible pour l’image Docker `node:alpine`). Aucune variable d’environnement.

## Bibliothèque Scanic

[Scanic](https://github.com/marquaye/scanic) (licence MIT, sans dépendance, cœur Rust compilé en WebAssembly) s’exécute **uniquement dans le navigateur** ; aucune image n’est envoyée à un service tiers.

- `src/lib/scanJustificatif.ts` garde une instance unique de la classe `Scanner`, initialisée une seule fois puis réutilisée pour tous les scans (le composant la préchauffe quand le scan est actif). La bibliothèque est chargée par import dynamique, jamais côté serveur.
- Les composants `ApercuScan` et `EditeurCoins` (éditeur de coins de Scanic) gèrent l’aperçu et l’ajustement manuel.
- **Scanic servi depuis notre origine** : Scanic n’est pas compilé par le bundler. Le paquet `scanic` est copié dans `public/assets/scanic/<version>/` et chargé par `import()` depuis `src/lib/scanJustificatif.ts` (`chargerScanic`). C’est nécessaire : son module ML est chargé par un `import()` marqué `webpackIgnore`, résolu à côté du fichier courant ; dans un bundle Next.js, il pointerait vers `/_next/static/chunks/scanic-mlDetector.js`, qui n’existe pas (erreur « Failed to fetch dynamically imported module »).
- **Détecteur ML auto-hébergé** : par défaut Scanic récupère son modèle (~2 Mo) sur le CDN jsDelivr. Ce comportement est évité : les assets du paquet `scanic-ml` (`.ort`, `.wasm`, `.mjs`) sont copiés dans `public/assets/scanic-ml/<version>/` et servis depuis l’origine de l’application (`ml.assetBaseUrl`). Les deux copies sont faites par `scripts/copier-assets-scanic.mjs` (lancé par `pnpm dev` et `pnpm build`, dossiers ignorés par Git). La version du paquet étant dans le chemin, ces fichiers sont servis avec `Cache-Control: public, max-age=31536000, immutable` (`next.config.js`) : le navigateur ne les retélécharge pas, et une mise à jour du paquet change l’URL. Aucun nouveau service tiers ni nouvelle variable d’environnement n’est nécessaire.
- Sans en-têtes COOP/COEP, le modèle ML s’exécute sur un seul thread (quelques dizaines de millisecondes) ; ne pas activer ces en-têtes sans vérifier les ressources tierces (OpenObserve RUM, par exemple).
- `src/proxy.ts` exclut les extensions `mjs`, `wasm` et `ort` de son `matcher` pour que ces assets soient accessibles sans redirection vers `/sign-in`. Le service worker ne les met pas en cache : le scan ML nécessite donc une connexion la première fois.

## Dépannage

- Le détecteur ML ne se charge pas (visible dans la console : « Détection ML indisponible, repli sur la détection classique ») : vérifiez que `public/assets/scanic/<version>/` et `public/assets/scanic-ml/<version>/` existent (relancer `node scripts/copier-assets-scanic.mjs`, puis redémarrer `pnpm dev` : les versions sont lues au démarrage) et que le reverse proxy sert `.js`, `.mjs`, `.wasm` et `.ort`. L’application reste utilisable grâce au repli sur la détection classique.
- Après une mise à jour, appliquez les migrations `008` et `009` (`pnpm db:migrate`) : sans elle, la lecture des paramètres échoue.
