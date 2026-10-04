# Suivi budgétaire

Quand `budget_actif` est activé pour un groupe (`/parametres-groupe`, section « Suivi budgétaire »), chaque dépense, recette et note de frais est rattachée à un **poste budgétaire**, et les responsables suivent le budget prévu et le réalisé par poste sur l'année comptable depuis `/suivi-budgetaire`. Le suivi est **désactivé par défaut** et ne reprend jamais l'existant : les écritures antérieures à l'activation figurent en « Non affecté ».

Un poste budgétaire est distinct d'une catégorie comptable : les catégories sont fixes et servent à la comptabilité, les postes sont propres au groupe et servent au pilotage du budget (« Camp », « Matériel », « Calendrier »…).

## Prérequis : l'historique

Le réalisé est calculé à partir de `scouticket_historique` (seule table qui conserve les montants par pièce). Le suivi **exige donc l'historique** :

- activer le suivi sans historique actif est refusé (`PATCH /api/group/parametres`, 400) ;
- désactiver l'historique tant que le suivi est actif est refusé (400, « Désactivez d'abord le suivi budgétaire ») ;
- l'état effectif `budgetActif` renvoyé par `recupererGroupeActif` vaut `historique_actif AND budget_actif`.

## Ce qui est stocké

Migration `sql/021_suivi_budgetaire.sql` :

| Table ou colonne                                  | Contenu                                                                                                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scouticket_group_data.budget_actif`              | Option du groupe.                                                                                                                                                   |
| `scouticket_postes_budgetaires`                   | Postes du groupe : `id`, `domaine` (`depense` ou `recette`), `label`, `ordre`. Un même libellé peut exister dans les deux domaines.                                 |
| `scouticket_budgets_postes`                       | Budget prévisionnel d'un poste pour une année comptable (`annee_debut`), supprimé avec le poste (`ON DELETE CASCADE`). Un budget à 0 diffère d'un budget non saisi. |
| `scouticket_historique.poste_id` et `poste_label` | Poste d'une écriture. `poste_label` est une **copie texte** du libellé à l'affectation.                                                                             |

Ne sont jamais stockés : justificatifs, RIB, ni aucune donnée personnelle supplémentaire (libellés de postes et montants uniquement). Aucune donnée sensible au sens de l'article 9 du RGPD.

À l'activation, si le groupe n'a aucun poste, les postes par défaut sont créés (`POSTES_PAR_DEFAUT` dans `src/lib/budget.ts`) :

- **Dépenses** : Adhésion (part national), Assurance, Camp, Conseil de groupe, Formation, Frais bancaire, Frais de déplacements, Matériel, Rencontre pendant l'année ;
- **Recettes** : Adhésion, Calendrier, Camp, Extra-job, Subventions.

## Affectation d'un poste

Le sélecteur de poste (`src/components/SelecteurPosteBudgetaire.tsx`) est **obligatoire** dans les formulaires quand le suivi est actif :

| Déclaration                              | Sélecteur                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Note de frais non signée                 | Un par justificatif (`expenses[i].budgetPostId`).                                                      |
| Dépense avec moyen de paiement du groupe | Un (un seul justificatif).                                                                             |
| Recette                                  | Un (`recette.budgetPostId`).                                                                           |
| Note de frais signée                     | Un seul, global (`budgetPostId` à la racine), repris par chaque pièce puis par l'unique entrée finale. |

Les postes proposés sont ceux du domaine : `depense` pour les notes de frais et les dépenses du groupe, `recette` pour les recettes.

Côté serveur :

- `validerCorpsRequete` et `validerCorpsRequeteRecette` lisent les identifiants (`posteBudgetaireId` sur `DetailDepense` et `DetailRecette`) ;
- `verifierPostesEnvoi` (`src/lib/budgetServer.ts`) exige un poste existant du bon domaine pour chaque pièce quand le suivi est actif (400 sinon, aucun e-mail envoyé). Quand le suivi est désactivé, les identifiants reçus sont ignorés ;
- `enregistrerHistorique` écrit `poste_id` et `poste_label` dans la **même transaction** que la réservation du numéro de nomenclature, avant l'envoi SMTP. Un poste inconnu ou du mauvais domaine n'est jamais enregistré.

Note de frais signée : le poste est conservé dans `donneesNdf` (JSON de la note, pour la durée du circuit seulement) et repris à la validation finale (`src/lib/ndfSignature/signer.ts`). S'il a été supprimé entre-temps, l'écriture est « Non affecté ». Les kilomètres n'existent que pour les notes signées et leur montant est déjà dans la ligne finale de l'historique : aucun traitement particulier.

## Correction et reclassement

Les responsables modifient le poste d'une écriture depuis `/historique` (`PATCH /api/historique/[id]`, champ `posteBudgetaireId`) : le poste doit exister dans le domaine de l'écriture. « Non affecté » n'est pas un choix. La colonne « Poste » et un filtre à sélection multiple (`poste`, avec la valeur spéciale `non-affecte`) sont ajoutés à la liste, et l'export CSV de l'historique reçoit une colonne « Poste budgétaire » **uniquement quand le suivi est actif**.

## Suppression d'un poste

La suppression est autorisée : la clé étrangère remet `poste_id` à `NULL` (`ON DELETE SET NULL`), les écritures passent en « Non affecté » et gardent leur libellé d'origine dans `poste_label`. Les montants de l'historique ne changent pas.

## Droits d'accès

Réservé aux **responsables** (`owner` et `admin`, comme `estResponsable`) : activer l'option, gérer les postes, saisir les budgets, consulter `/suivi-budgetaire` et reclasser une écriture. La vue est globale au groupe, jamais filtrée par unité. Les membres simples voient uniquement le sélecteur dans les formulaires (postes exposés par `GET /api/group/config`).

## API

Toutes les routes passent par `executerRouteAvecLogs` et passent par `recupererAccesBudget` (`src/lib/budgetAcces.ts`) : 401 sans groupe actif, 403 pour un non-responsable, 404 si le suivi n'est pas activé.

| Route                      | Rôle                                                                                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/budget`          | Postes, budgets et réalisé de l'année comptable `anneeComptable` (année de début, courante par défaut). Le réalisé somme `montant_total` des écritures de l'année, ligne « Non affecté » comprise. |
| `PUT /api/budget/postes`   | Remplace la liste complète des postes dans une transaction (ids générés pour les nouveaux, renvoyés).                                                                                              |
| `PUT /api/budget/montants` | Enregistre les budgets d'une année comptable ; un montant `null` supprime le budget du poste. Montants arrondis au centime.                                                                        |
| `GET /api/budget/export`   | Export CSV du suivi (budget, réalisé, solde, taux), même format que l'export de l'historique (UTF-8 avec BOM, séparateur `;`, neutralisation des formules).                                        |
| `GET /api/budget/donnees`  | Nombre de postes et d'écritures affectées, pour le message de confirmation avant désactivation.                                                                                                    |

Réalisé : les dépenses (`type <> 'recette'`, notes de frais comprises) sont comparées aux postes de dépenses, les recettes aux postes de recettes. Le solde d'une dépense est « budget moins réalisé » (négatif en cas de dépassement), l'écart d'une recette est « réalisé moins budget ».

## Année comptable

Le suivi porte sur l'année comptable du groupe. Son **début** (jour et mois) se règle désormais dans `/parametres-groupe`, section « Année comptable », même sans nomenclature personnalisée (colonnes `annee_comptable_debut_mois` et `annee_comptable_debut_jour`, inchangées). Le format d'affichage de `{AnneeComptable}` reste dans `/gestion-nomenclature`. `PATCH /api/group/parametres` accepte `anneeComptableDebut` (le 29 février est refusé), et `PATCH /api/group/nomenclature` n'écrit plus que le format. Le début d'année reste aussi exposé via `nomenclature.anneeComptable` pour les consommateurs existants.

## Désactivation

Désactiver le suivi **supprime** les postes, les budgets et les affectations. Le corps de `PATCH /api/group/parametres` doit contenir `confirmationSuppressionBudget: true` (400 sinon). Dans une transaction : mise à jour du paramètre, `poste_id` et `poste_label` remis à `NULL` sur toutes les écritures, suppression des postes (les budgets partent en cascade). Les montants de l'historique ne changent pas. L'événement est journalisé (`budget.desactive`, avec le nombre de postes supprimés). L'interface demande de saisir `SUPPRIMER` dans un dialog qui indique le nombre de postes et d'écritures concernés, et propose d'exporter le suivi en CSV avant suppression. À la réactivation, les postes par défaut sont recréés.

Supprimer le groupe supprime aussi postes et budgets (`ON DELETE CASCADE`).

## Interface

`/suivi-budgetaire` est **réservée aux ordinateurs**, comme `/historique` : sous le breakpoint `lg`, une page invite à l'ouvrir depuis un ordinateur, et le contenu utilise toute la largeur (`max-w-7xl`). Le sélecteur d'année comptable et l'export CSV sont communs aux deux vues, présentées en onglets **Tableau** et **Pilotage**.

### Onglet Tableau

- Onglets Dépenses et Recettes, tableau (budget éditable, réalisé, solde ou écart, taux de réalisation, ligne « Non affecté », totaux), gestion des postes (ajout, renommage, ordre, suppression), camemberts et barres.
- Le dépassement d'un budget de dépenses est signalé par une barre rouge **et** un texte (« budget dépassé »), pas par la couleur seule. Pour une recette, le dépassement se lit « objectif dépassé ».
- Une ligne du tableau est cliquable (souris, ou Entrée et Espace au clavier) et ouvre le détail de ses écritures (voir plus bas). Saisir un budget dans la ligne n'ouvre pas le détail.

### Onglet Pilotage

Vue de lecture, calculée à partir des mêmes données (`GET /api/budget`) ; l'année précédente est chargée en plus, uniquement à l'ouverture de l'onglet. Les règles de calcul sont des fonctions pures dans `src/lib/budgetPilotage.ts`, l'affichage est dans `src/components/PilotageBudget.tsx`.

- **Cartes de synthèse** : recettes, dépenses et résultat (recettes moins dépenses), chacun en prévu, réalisé et écart. Un écart est **favorable** quand il améliore le résultat : plus de recettes ou moins de dépenses que prévu. Les postes sans budget comptent pour 0 dans le prévu (leur nombre est rappelé), « Non affecté » compte dans le réalisé. Sans aucun budget saisi, le prévu et l'écart sont remplacés par un tiret et un message invite à saisir les budgets. Un résultat réalisé négatif est signalé par le texte « déficit » en plus de la couleur.
- **Avancement** : trois barres (`role="progressbar"`) : année comptable écoulée (jours écoulés sur la durée de l'année, bornes incluses), budget de dépenses consommé, objectif de recettes atteint. Un trait marque l'avancement de l'année sur les deux dernières.
- **Postes à surveiller** : dépenses « Budget dépassé » (réalisé supérieur au budget) ou « À surveiller » (80 % du budget et plus) ; recettes « En retard sur l'objectif » (taux inférieur de plus de 20 points à l'avancement de l'année). Les postes sans budget et « Non affecté » ne sont pas jugés. Tri par gravité puis par montant concerné. Seuils : `SEUIL_SURVEILLANCE_DEPENSES` et `MARGE_RETARD_RECETTES`.
- **Comparaison avec l'année précédente** : prévu et réalisé de l'année face au réalisé de l'année précédente, par poste (même identifiant de poste d'une année à l'autre ; « Non affecté » par son libellé), pour les dépenses ou les recettes. Une valeur inconnue (poste absent de l'année précédente) est un tiret, un réalisé N-1 nul donne une évolution en montant sans pourcentage. Si l'année précédente ne peut pas être chargée, seule cette section affiche « Comparaison indisponible ».
- Chaque graphique est accompagné d'un tableau des mêmes chiffres (`role="img"` et `aria-label` sur le graphique), les animations sont désactivées.

### Détail d'un poste

Une ligne du tableau ou un poste à surveiller (« Non affecté » compris) ouvre `DetailPosteBudget` : les écritures du poste pour l'année comptable, les plus importantes d'abord (100 au plus, avec le total réel indiqué au-delà). Il réutilise `GET /api/historique` (`poste`, `anneeComptable`, `type`, `tri=montant`) : aucun nouvel endpoint. Pour « Non affecté », le filtre `non-affecte` est combiné au type (`recette`, ou `depense,note-de-frais`) car il existe dans les deux domaines. Chaque ligne d'écriture est cliquable (souris ou clavier, sans lien) et ouvre `DialogHistorique` : un responsable peut la corriger ou la **reclasser** dans un autre poste, puis le suivi est rechargé.

### Autres éléments

- Les graphiques du tableau (`src/components/GraphiquesBudget.tsx`) sont deux camemberts (répartition du prévu et du réalisé) et des barres prévu / réalisé par poste ; ceux du pilotage sont dans `src/components/GraphiquesPilotage.tsx`.
- Le lien « Suivi budgétaire » de l'accueil n'apparaît que pour un responsable quand l'option est active.

## Dépendance : Recharts

Les graphiques utilisent [Recharts](https://recharts.org) (bibliothèque largement documentée, imports nommés dans `GraphiquesBudget.tsx` et `GraphiquesPilotage.tsx` pour limiter le poids du bundle). Elle s'exécute uniquement dans le navigateur et n'appelle aucun service externe : aucune variable d'environnement n'est nécessaire.

## Service externe

Aucun service tiers n'est ajouté. Les données sont dans PostgreSQL et suivent les sauvegardes de la base (volume `postgres_data` en Docker).
