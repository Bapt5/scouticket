# Historique des dépenses, recettes et notes de frais

Quand `historique_actif` est activé pour un groupe (`/parametres-groupe`, section « Historique »), chaque envoi de dépense, de recette ou de note de frais est aussi enregistré en base, pour être consulté depuis `/historique`. L'historique est **désactivé par défaut** et ne reprend jamais l'existant : il démarre à l'activation.

## Ce qui est stocké, et ce qui ne l'est pas

**Jamais stockés** : les justificatifs, le RIB, tout fichier et tout contenu de pièce jointe. Ils sont uniquement envoyés par e-mail au trésorier, qui doit les archiver.

Stockés dans `scouticket_historique` (migration `sql/020_historique.sql`) :

- le type (`depense`, `recette` ou `note-de-frais`), la date, la référence de nomenclature (`NULL` sans format configuré), le mode de paiement, l'activité (note de frais), la description saisie ;
- le montant total et les lignes `catégorie comptable / montant` ;
- quand le [suivi budgétaire](/technical/suivi-budgetaire) est actif, le poste budgétaire (`poste_id`) et une copie texte de son libellé (`poste_label`) ;
- l'unité, **copiée en texte** (libellé et couleur) : renommer ou supprimer une unité ou une catégorie ne modifie pas l'historique (`unite_id` passe à `NULL` à la suppression de l'unité) ;
- l'auteur (`auteur_user_id`, sans nom ni e-mail copié), et le dernier modificateur avec la date de modification.

Les kilomètres d'une note de frais signée ne sont pas conservés : seul le montant remboursé figure, comme dans l'e-mail, sous la catégorie « Remboursement via Ndf frais de transport ». La description d'une note de frais signée est « Note de frais signée » (la description de l'e-mail contient l'adresse du demandeur, qui n'est donc pas recopiée).

## Rétention et RGPD

- Conservation **tant que l'option est active**. Pas de purge automatique.
- **Désactiver** l'option (`PATCH /api/group/parametres`, `historiqueActif: false`, refusé tant que le suivi budgétaire est actif) supprime toutes les entrées du groupe dans la même transaction que la mise à jour du paramètre. Le corps doit contenir `confirmationSuppressionHistorique: true`, sinon la requête est refusée (400). L'interface demande de saisir `SUPPRIMER` dans un dialog qui indique le nombre d'entrées supprimées. Si l'historique n'est pas vide, ce dialog propose d'abord d'exporter tout l'historique en CSV (même export que `GET /api/historique/export`, sans filtre) pour en garder une copie ; l'export n'est jamais obligatoire. L'événement est journalisé (`historique.desactive`, avec le nombre d'entrées, sans donnée personnelle).
- **Supprimer le groupe** supprime ses entrées (`ON DELETE CASCADE`).
- **Supprimer le compte d'un auteur** conserve l'entrée mais anonymise l'auteur (`ON DELETE SET NULL`, affiché « Ancien membre »).
- Aucune donnée sensible au sens de l'article 9 du RGPD n'est stockée.

## Granularité : une ligne par entrée de nomenclature

Une ligne d'historique correspond à une entrée de nomenclature, c'est-à-dire à un justificatif :

| Envoi                                    | Lignes d'historique                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Dépense avec moyen de paiement du groupe | 1                                                                                               |
| Recette                                  | 1                                                                                               |
| Note de frais non signée                 | une par justificatif, chacune avec sa référence                                                 |
| Note de frais signée                     | 1 seule (le PDF signé est le justificatif unique), qui regroupe les lignes de toutes les pièces |

Les lignes d'un même envoi partagent un `envoi_id`. Modifier ou supprimer une ligne n'affecte pas les autres.

Une note de frais signée n'écrit rien au dépôt : l'entrée est créée à la validation finale (signature du trésorier), au moment de l'envoi de l'e-mail. Les circuits refusés ou abandonnés n'apparaissent pas, ce qui respecte la règle « rien ne reste en base » de [Note de frais signée](/technical/ndf-signee).

## Écriture atomique avec l'envoi

L'écriture se fait dans la **même transaction** que la réservation des numéros de nomenclature, **avant** l'envoi de l'e-mail (`src/lib/envoiNomenclature.ts`, `src/lib/historiqueServer.ts`) :

`BEGIN` → réservation des numéros → insertion de l'historique → envoi SMTP → `COMMIT`

- Si l'insertion échoue, la requête échoue (`ROLLBACK`) : **aucun e-mail n'est envoyé et aucun numéro de nomenclature n'est consommé**. L'utilisateur peut réessayer sans créer de doublon.
- Si l'envoi SMTP échoue, l'insertion est annulée aussi.
- Sans format de nomenclature, `envoyerAvecHistorique` applique la même séquence (sans réservation).
- Seul un échec du `COMMIT` lui-même, après l'envoi, peut laisser un e-mail parti sans entrée ni numéro réservé : cas très rare, journalisé par la route.

Points d'appel : `POST /api/send-expense`, `POST /api/send-recette` et la validation finale d'une note signée (`src/lib/ndfSignature/signer.ts`, type `note-de-frais` forcé).

## Lien dans l'e-mail

Quand l'historique est activé, les e-mails de dépense, de recette et de note de frais contiennent un bouton « Consulter dans l'historique » (et une ligne équivalente dans la version texte), construit à partir de `APP_URL` (`src/lib/historiqueLien.ts`) :

- une seule entrée créée par l'envoi (dépense, recette, note signée, note non signée avec un seul justificatif) : le lien ouvre `/historique?entree=<id>`, la page affiche directement le dialog de cette entrée ;
- plusieurs entrées (note de frais non signée avec plusieurs justificatifs) : le lien ouvre simplement `/historique`.

Sans historique activé ou sans `APP_URL`, aucun lien n'est ajouté et l'envoi n'échoue pas. Le lien ne contient qu'un identifiant opaque : l'accès exige d'être connecté, et l'entrée reste soumise aux droits habituels (un membre ne voit que ses unités). Si l'entrée n'existe plus (supprimée) ou n'est pas accessible, la page l'indique. Le paramètre est retiré de l'URL après ouverture, pour qu'un rechargement ne rouvre pas le dialog.

## Droits d'accès

- **Responsables** (rôles `admin` et `owner`) : lecture, modification et suppression de toutes les entrées.
- **Membres** : lecture seule, limitée aux unités auxquelles ils ont accès (`scouticket_acces_unite_membre`). Le filtrage est fait en SQL, y compris pour l'export et le détail d'une entrée.

## API

Toutes les routes passent par `executerRouteAvecLogs` et répondent 404 si l'historique n'est pas activé.

| Route                         | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/historique`         | Liste paginée côté serveur. Paramètres : `page`, `taille` (100 max), `tri` (`date`, `reference`, `type`, `unite`, `montant`), `sens`, `type`, `unite`, `poste` (suivi budgétaire actif ; valeur `non-affecte` pour les lignes sans poste), `du`, `au`, `anneeComptable`, `q`. Renvoie aussi les totaux de la sélection (dépenses, recettes, solde).                                                                                                                                                                                                      |
| `GET /api/historique/export`  | Export CSV (UTF-8 avec BOM, séparateur `;`, montants à la française) des lignes filtrées, 20 000 lignes au plus. Une colonne par catégorie comptable présente dans l'export (ordre comptable, dépenses puis recettes) contient le montant de la ligne dans cette catégorie, cellule vide sinon ; une catégorie répétée dans une ligne est additionnée. Les cellules commençant par `=`, `+`, `-`, `@` sont neutralisées contre l'injection de formules. Quand le suivi budgétaire est actif, une colonne « Poste budgétaire » est ajoutée après l'unité. |
| `GET /api/historique/[id]`    | Détail d'une entrée.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `PATCH /api/historique/[id]`  | Modification (responsables).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `DELETE /api/historique/[id]` | Suppression définitive (responsables).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Le filtre `anneeComptable` (année de début) est converti en intervalle de dates avec le début d'année comptable du groupe, puis combiné par intersection avec `du` et `au`.

## Modification et suppression

- La modification ne renvoie **aucun e-mail** : l'historique devient la référence interne et l'e-mail déjà envoyé n'est pas modifié. L'entrée affiche « modifié le … par … ».
- Sont modifiables : la date, l'unité, le poste budgétaire (suivi actif), le moyen de paiement, l'activité, la description et les lignes comptables (ajout, suppression, changement de catégorie ou de montant). Le montant total est **toujours recalculé côté serveur** à partir des lignes.
- La **référence de nomenclature n'est jamais modifiable**. Elle reste figée alors qu'elle encode le type et le montant d'origine : elle peut donc diverger du contenu après une modification. Elle identifie l'e-mail et le justificatif d'origine.
- Les catégories sont validées contre la liste du groupe pour le type de l'entrée, l'unité contre les unités du groupe.
- La suppression est définitive. Le **numéro de nomenclature d'une entrée supprimée n'est pas réattribué** : la numérotation garde un trou, assumé.

## Interface

- `/historique` : tableau triable et paginé (date, référence, type, unité, montant, description), recherche, filtres par type, unité et dates, sélecteur d'année comptable en tête (indépendant du filtre par date), filtres type et unité à sélection multiple (« Tout sélectionner » : tout coché ne filtre pas, tout décoché ne renvoie rien), totaux de la sélection, export CSV. Seul le montant total figure sur la ligne ; un clic ouvre le détail par catégorie comptable (`src/components/DialogHistorique.tsx`).
- L'écran n'est pas adapté aux mobiles : sous le breakpoint `lg`, une page invite à ouvrir l'historique depuis un ordinateur.
- La dernière année comptable choisie est mémorisée dans le navigateur de l'utilisateur (`localStorage`, une clé par groupe, `scouticket:historique:anneeComptable:<groupe>`) et restaurée à l'ouverture de la page ; seul « Toutes » l'efface (« Réinitialiser » remet les autres filtres à zéro mais conserve l'année). Rien n'est envoyé au serveur.
- Le lien « Historique » de l'accueil n'apparaît que si l'option est active.

## Service externe

Aucun service tiers n'est ajouté et aucune variable d'environnement n'est nécessaire. Les données sont dans PostgreSQL et suivent les sauvegardes de la base (volume `postgres_data` en Docker).
