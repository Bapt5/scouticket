# Note de frais signée

Quand `ndf_signee_actif` est activé pour un groupe (`/parametres-groupe`, voir [Scan automatique des justificatifs](/technical/scan-justificatifs#signataires-des-notes-de-frais) pour la gestion des signataires), l'envoi d'une note de frais (`typeEnvoi: "note-de-frais"`, jamais `depense-groupe`) ne part plus immédiatement à la trésorerie : elle est déposée dans un circuit de signature électronique à 3 niveaux (**bénéficiaire → responsable → trésorier**) avant d'être transmise, sous la forme d'un PDF fidèle au template SGDF (`templates/ndf_sgdf.xlsx`).

## Exception au principe de non-conservation des justificatifs

Un circuit de signature asynchrone (les 3 signataires peuvent agir à des jours différents) sur un document avec preuve d'identité et signatures cumulatives, est impossible sans persister le document généré pendant la fenêtre de signature. C'est une **exception documentée et bornée dans le temps** au principe général de l'application ("aucun justificatif n'est jamais stocké côté serveur") :

- `scouticket_notes_de_frais_signees` contient la note, avec son PDF (`pdf_document` : page note de frais + justificatifs + 3 pages de signature) et les données nécessaires à l'e-mail final (`donnees_ndf`, RIB compris), le temps du circuit : chaque signataire ajoute sa signature électronique au PDF.
- Dès que le circuit se termine (**validée** ou **refusée**), **la ligne est supprimée** (`cloturerCircuit`, `src/lib/ndfSignature/repository.ts`), avec ses codes de vérification (`scouticket_ndf_codes_verification`, cascade). **Rien ne reste en base** : la preuve des signatures (identité, adresse IP, user-agent, dates du code) est portée par le PDF signé lui-même, envoyé par e-mail.
- Seule trace de la clôture : une ligne de journal structuré (`ndf_signee.cloturee`, identifiant de la note et issue, sans donnée personnelle).

## Dépôt (`POST /api/send-expense`)

Quand `group.parametres.ndfSigneeActif` et `donneesEmail.typeEnvoi === "note-de-frais"`, la route délègue à `deposerNoteDeFraisSignee` (`src/lib/ndfSignature/depot.ts`) au lieu d'envoyer l'e-mail immédiatement :

1. **Résolution des signataires** (`resoudreSignataires`, `src/lib/ndfSignature/circuit.ts`) : applique la règle de remplacement en cas de conflit d'intérêt (bénéficiaire jamais signataire de sa propre note) documentée dans [Signataires des notes de frais](/technical/scan-justificatifs#signataires-des-notes-de-frais). Si aucune solution n'existe, le dépôt échoue (409).
2. **Génération de la page note de frais** : le HTML est construit à partir des données saisies (`src/lib/sgdf/remplirModele.ts`, fidèle au template SGDF, voir `src/lib/sgdf/modele.html` pour la référence visuelle), puis rendu en PDF par Chromium headless (`puppeteer-core` + `@sparticuz/chromium`, `src/lib/sgdf/genererPagePdf.ts`). Une ligne du tableau = une pièce jointe (pas une ligne de catégorie comptable) ; les montants de chaque pièce sont ventilés dans les colonnes SGDF via `src/lib/sgdf/mappingCategories.ts`. La colonne "TRANSPORT Nb kilomètres" reste toujours à 0 : l'application ne capture pas de kilométrage.
3. **Assemblage** (`assemblerDocumentInitial`, `src/lib/ndfSignature/document.ts`) : la page note de frais suivie de chaque justificatif (converti en PDF si besoin, comme pour `convertirJustificatifsEnPdf`), dans l'ordre des pièces, puis les 3 pages de signature (une par étape, avec un champ de signature vide : `preparerPagesSignature`, `src/lib/ndfSignature/pdfSignature.ts`). Le fichier est enregistré sans object streams (table xref classique), condition de l'ajout incrémental des signatures.
4. **Hash** (`hasherDocument`, SHA-256) du document assemblé (pages de signature vides comprises) : il est imprimé dans le dossier de preuve de chaque signataire et identifie le document déposé.
5. **Persistance** : `scouticket_notes_de_frais_signees` (statut `en_attente_beneficiaire`).
6. **Invitation à signer** envoyée par e-mail au bénéficiaire (« Le groupe … vous invite à signer votre note de frais »), avec un lien vers sa propre page de signature (1re étape). Le code de vérification n'est pas envoyé automatiquement à ce stade : le bénéficiaire (comme chaque signataire suivant) le demande depuis la page de signature (bouton **Envoyer le code**).

Après le dépôt, l'auteur de la note de frais est directement redirigé vers `/note-de-frais/[id]/signature` (pas de lien dans un message de confirmation).

Le n° de pièce affiché sur le PDF (page note de frais) est local à ce document (1..N, ordre des justificatifs) : il ne réserve aucun numéro de nomenclature au dépôt. La nomenclature du groupe (`src/lib/nomenclature.ts`) ne s'applique qu'à l'envoi final, une fois le circuit complet (voir « Envoi final » plus bas), sur le PDF fusionné devenu justificatif unique.

## Signature (`/note-de-frais/[id]/signature`)

Chaque signataire attendu (résolu au dépôt, jamais recalculé) reçoit un e-mail avec un lien vers cette page, qui affiche un résumé et le document.

**Lecture forcée avant signature** : le PDF (`GET /api/note-de-frais/[id]/document`, jamais mis en cache, servi uniquement au signataire attendu de l'étape courante) est rendu par `src/components/VisionneusePdf.tsx` (`react-pdf`/`pdfjs-dist`, auto-hébergé, sans barre d'outils native du navigateur ni service de conversion externe) dans un cadre défilant. Le bouton **Signer**/**Valider le traitement** reste désactivé tant que l'utilisateur n'a pas fait défiler le document jusqu'en bas (ou qu'il n'a pas besoin de défiler, document déjà entièrement visible).

**Signer/Refuser, code demandé dans une boîte de dialogue** : cliquer sur **Signer en tant que {nom}** (ou **Refuser**) ouvre une boîte de dialogue qui déclenche aussitôt l'envoi d'un code (`POST /api/note-de-frais/[id]/envoyer-code` : code numérique à 6 chiffres, haché, persisté avec une expiration de 10 minutes, voir `src/lib/ndfSignature/codesVerification.ts`) ; l'utilisateur le saisit (`src/components/SaisieCodeVerification.tsx`, une case par chiffre) puis reclique sur **Signer** dans la boîte de dialogue pour confirmer. Un lien « Renvoyer le code » redemande un code frais.

- **Signer / Refuser** (`POST /api/note-de-frais/[id]/signature`) : vérifie le code (usage unique, tentatives limitées), puis :
  - **remplit et signe le champ de signature de l'étape** dans le PDF stocké (`signerChamp`, `src/lib/ndfSignature/pdfSignature.ts`) : signature PAdES (`adbe.pkcs7.detached`, SHA-256) avec le certificat de scellement, écrite en **ajout incrémental** (les octets déjà écrits ne changent jamais), donc chaque signature couvre toutes les précédentes. Le rectangle visible de la page contient le **dossier de preuve** du signataire : nom, adresse e-mail à laquelle le code a été envoyé, identifiant utilisateur, adresse IP, user-agent, date d'envoi et de vérification du code, nombre de saisies (jamais le code lui-même), et pour le trésorier la date du virement ;
  - consomme le code seulement **après** le succès de la signature (un échec, par exemple un certificat absent, ne le brûle pas), puis enregistre le nouveau PDF et le nouveau statut en une seule requête conditionnée au statut attendu (`enregistrerPdfSigne`) : deux requêtes simultanées ne peuvent pas signer deux fois la même étape ;
  - en cas de **refus** : le circuit entier est annulé, la note est supprimée avec son PDF et ses codes, aucune signature n'est apposée, le bénéficiaire est notifié par e-mail (avec le motif s'il est fourni). Il doit soumettre une nouvelle note de frais depuis zéro ;
  - en cas de **signature** à l'étape bénéficiaire ou responsable : le statut avance, le signataire suivant est notifié ;
  - en cas de **signature** à l'étape trésorier (qui saisit aussi la **date du virement**, dans le même geste, un seul écran combiné) : c'est la validation finale.

Le circuit ne peut pas être signé hors ordre : la route dérive l'étape attendue depuis `note.statut`, et refuse toute tentative d'un utilisateur qui n'est pas le signataire attendu de l'étape courante.

**RIB, remis au trésorier dès son tour, pas à la fin** : si un RIB a été joint, il est envoyé au trésorier dans l'e-mail « c'est votre tour de signer » (`envoyerEmailTourDeSigner`, uniquement à l'étape trésorier), et consultable depuis la page de signature (`GET /api/note-de-frais/[id]/rib`). La page affiche une consigne explicite : effectuer le virement avant de signer, la signature atteste que le virement a été fait. Le RIB reste aussi joint à l'e-mail final, pour archivage.

## Signatures cumulatives et date du virement

Le PDF initial (haché au dépôt) contient 3 pages de signature vides. Chaque signature remplit le champ de sa page et **ajoute des octets à la suite** du fichier, sans toucher aux précédents, puis signe l'ensemble : modifier un octet d'une étape invalide sa signature et les suivantes, mais pas les précédentes. Remplir un champ de signature est une modification explicitement autorisée après une signature d'approbation : les lecteurs PDF ne signalent pas de modification suspecte sur les signatures antérieures. Ajouter ensuite du contenu après la dernière signature laisse les signatures valides mais est signalé comme « modifié depuis la dernière signature ».

La date du virement n'existe qu'à la signature du trésorier, longtemps après le dépôt : elle est écrite dans le dossier de preuve de sa signature, pas dans le document initial. Le PDF reçu par e-mail n'est jamais réenregistré par `pdf-lib` (cela réécrirait tout le fichier et invaliderait les signatures).

Seule fenêtre où le contenu n'est pas encore protégé : les quelques millisecondes côté serveur entre l'écriture du dossier et le calcul de la signature. C'est là que repose la confiance en Scouticket : les preuves d'identité sont une **attestation de Scouticket**, rendue inviolable par la signature. Un tiers peut vérifier qu'elles n'ont pas été modifiées, pas qu'elles sont vraies (l'adresse IP et le user-agent sont falsifiables ou partagés, la réception du mail ne se prouve pas).

## Envoi final

Une fois les 3 signatures obtenues et le virement fait, le remboursement est traité comme **une dépense avec moyen de paiement du groupe** (`typeEnvoi: "depense-groupe"`) : l'argent du groupe est réellement sorti à ce moment-là. `src/lib/ndfSignature/signer.ts` construit un unique justificatif (le PDF signé : note de frais + justificatifs + 3 pages de signature) avec les lignes de toutes les pièces d'origine regroupées, `modePaiement: "Virement du groupe"`, et l'envoie via le même chemin qu'une dépense de groupe classique :

- si une nomenclature dépense est configurée, `envoyerAvecNomenclature` (`src/lib/envoiNomenclature.ts`, partagée avec `POST /api/send-expense`) réserve un numéro et nomme le fichier normalement ;
- sinon, `envoyerEmailDepense` est appelé directement.

L'e-mail reçu par les trésoriers a donc le même format et les mêmes informations qu'une dépense de groupe (branche, demandeur, total, un seul justificatif nommé selon la nomenclature), sans RIB (déjà transmis au trésorier à sa propre étape, voir plus haut) et sans ventilation par catégorie détaillée par pièce d'origine (les lignes sont fusionnées en un seul justificatif). Puis `cloturerCircuit` supprime la note, son PDF et ses codes de vérification.

## Schéma de données

| Table                                                                      | Rôle                                                                                                               | En fin de circuit ?         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| `scouticket_notes_de_frais_signees` (`sql/016_notes_de_frais_signees.sql`) | Note en cours de signature : statut, signataires résolus, données de l'e-mail final, hash du document initial, PDF | Ligne supprimée             |
| `scouticket_ndf_codes_verification` (`sql/017_ndf_codes_verification.sql`) | Codes OTP (hachés, usage unique, expiration)                                                                       | Lignes supprimées (cascade) |

Un circuit **abandonné** (personne ne signe) reste en base, PDF compris, tant qu'il n'est pas terminé : `cree_le` permet de les repérer, mais aucune purge automatique n'existe pour l'instant.

## Certificat de scellement

Les signatures sont faites avec un certificat X.509 **auto-signé** propre à l'instance, fourni par `NDF_SCELLEMENT_P12_BASE64` et `NDF_SCELLEMENT_P12_MOT_DE_PASSE` (voir [Variables d'environnement](/technical/environment-variables#note-de-frais-sign%C3%A9e)). Il se génère avec `pnpm ndf:certificat ["Nom de l'organisation"]` ; la clé n'est pas écrite sur disque, le script affiche les valeurs à renseigner et l'**empreinte SHA-256 du certificat, à publier** pour que chacun puisse vérifier qu'une signature vient bien de ce certificat. La clé est stockée dans une variable d'environnement (pas dans un module matériel) : en limiter l'accès et la renouveler (nouveau certificat, nouvelle empreinte publiée) si elle a pu fuiter. Si le certificat est absent ou invalide, la signature échoue avec une erreur serveur claire, sans PDF non signé silencieux.

## Vérifier un PDF signé

Ouvrir le PDF dans Adobe Reader (ou un outil comme `pdfsig` de poppler, ou pyHanko) : chaque étape apparaît comme une signature distincte, valide si les octets qu'elle couvre n'ont pas changé. Comme le certificat est auto-signé, Adobe affiche « identité du signataire inconnue » tant que le certificat n'est pas importé ; comparer son empreinte SHA-256 avec celle qui est publiée.

Niveau de garantie réel : **intégrité et origine** du document et de son dossier de preuve. Ce n'est pas une signature électronique qualifiée au sens d'eIDAS (le certificat n'est pas émis par un prestataire qualifié) et il n'y a pas d'horodatage externe : les dates sont celles du serveur. La visionneuse de l'application (`react-pdf`) n'affiche pas l'état de validité des signatures.

## Données personnelles

Les dossiers de preuve contiennent des données personnelles (nom, e-mail, identifiant, adresse IP, user-agent). Finalité : prouver, pour chaque signature, qui a signé et que cette personne avait accès à sa messagerie. Elles vivent dans le PDF signé (envoyé aux trésoriers) ; en base, tout est supprimé à la clôture du circuit (la note, son PDF et ses codes), rien ne subsiste. Aucune donnée sensible au sens de l'article 9 du RGPD n'est traitée.
