# Configurer un groupe

Cette page s’adresse aux responsables de groupe. Eux seuls peuvent configurer le groupe et inviter les membres.

## Créer et configurer le groupe

1. Créez votre compte, puis créez le groupe depuis le sélecteur de groupe en haut de l’application. Vous devenez automatiquement Trésorier de ce groupe (rôle `owner`).
2. Adaptez les unités de votre groupe puis enregistrez la configuration.

Une fois les unités enregistrées, le groupe est prêt à recevoir des notes de frais. Le Trésorier peut ensuite promouvoir d’autres membres (voir [Inviter les membres](#inviter-les-membres)) au rôle Trésorier ou Responsable de groupe.

## Unités, branches et couleurs

Chaque groupe peut adapter ses unités à son fonctionnement. L’application propose au départ :

- Farfadets : vert
- Louveteaux-Jeannettes : orange
- Scouts-Guides : bleu clair
- Pionniers-Caravelles : rouge
- Compagnons : turquoise
- Groupe : bleu foncé

Vous pouvez renommer ou supprimer une unité, en ajouter une autre et choisir sa couleur depuis **Administration** puis **Gérer les unités**. La couleur choisie apparaît dans l’e-mail de justificatif : elle aide la trésorerie à identifier rapidement l’unité concernée.

Conservez au moins une unité : un justificatif doit toujours être rattaché à une unité du groupe.

## Nomenclature des justificatifs

Par défaut, les pièces jointes envoyées à la trésorerie gardent le nom du fichier importé par le membre. Les responsables peuvent définir un format de nom depuis **Administration** puis **Nomenclature** ; en cochant l’option, le format est pré-rempli avec `date - unité - type - mode de paiement - montant` et reste modifiable. Un bascule en haut de la page permet de définir un format et une numérotation **différents pour les dépenses et pour les recettes** ; l’année comptable est commune aux deux (son format d’affichage se règle depuis l’onglet « Dépenses »).

Le format mélange du texte fixe et des variables entre accolades, par exemple `{YYYY}-{MM}-{DD} - {Branche} - {Type} - {Montant} - {Numero}` donne `2026-03-05 - Louveteaux - Carburant - 28.50 - 01.pdf`. Les boutons de la page insèrent les variables, et un aperçu montre le résultat. L’extension du fichier est ajoutée automatiquement.

| Variable                                          | Valeur                                                                                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{YYYY}` `{MM}` `{DD}`                            | Année, mois et jour du justificatif (pas de l’envoi)                                                                                                                          |
| `{Branche}` `{Type}` `{ModePaiement}` `{Montant}` | Unité, catégorie comptable, moyen de paiement du groupe (`NDF` pour une note de frais) et montant du justificatif (total de ses lignes ; `Multiples` si plusieurs catégories) |
| `{AnneeComptable}`                                | Année comptable du justificatif                                                                                                                                               |
| `{Numero}`                                        | Rang du justificatif dans l’envoi (01, 02…)                                                                                                                                   |
| `{GlobalNumeroComptable}`                         | Rang dans l’année comptable, tous envois confondus (001, 002…)                                                                                                                |
| `{GlobalNumero}`                                  | Rang dans l’ensemble des envois du groupe (001, 002…)                                                                                                                         |

**Année comptable.** Elle commence par défaut le 1er septembre et se termine le 31 août. Le jour et le mois de début se règlent dans **Administration** puis **Paramètres du groupe**, section « Année comptable », même sans nomenclature personnalisée (pas le 29 février). Lorsqu’elle chevauche deux années civiles, choisissez l’affichage de `{AnneeComptable}` : année de début (2023), année de fin (2024) ou les deux (2023-2024). La numérotation `{GlobalNumeroComptable}` repart de 001 à chaque nouvelle année comptable.

**Numéros.** Un numéro n’est consommé que si l’e-mail est bien parti : un envoi en échec ne crée pas de trou. Pour reprendre une numérotation existante, saisissez le prochain numéro à attribuer dans la page. Si deux justificatifs d’un même envoi devaient porter le même nom, un ` - 01`, ` - 02`… est ajouté.

Décochez la personnalisation pour revenir au nom du fichier importé. Dans les deux cas, si deux pièces jointes d’un même envoi portent le même nom, un ` - 01`, ` - 02`… est ajouté.

## Inviter les membres

Depuis **Administration**, choisissez **Gérer les membres** et saisissez son adresse e-mail. Better Auth lui envoie une invitation ; après l’avoir acceptée, cette personne rejoint le groupe et peut envoyer ses justificatifs. La liste **Utilisateurs** réunit les membres du groupe et les invitations encore en attente d’acceptation. Une invitation en attente peut être annulée.

![Liste des utilisateurs et invitations en attente](/guide/gestion-membres-utilisateurs.png)

La personne invitée se connecte avec l’adresse e-mail qui a reçu l’invitation. Si elle crée son compte, elle confirme d’abord cette adresse depuis le lien reçu par e-mail. Sur l’accueil, un bandeau **« invitation en attente »** indique le nom du groupe et propose **Voir l’invitation**. Il apparaît sur l’écran **Bienvenue**, même avant que la personne ne rejoigne son premier groupe, et reste visible si elle utilise déjà un autre groupe. Elle doit accepter l’invitation pour rejoindre le nouveau groupe.

Depuis la fiche d’un membre (clic sur son nom dans la liste), un responsable peut aussi changer son rôle (Membre, Responsable de groupe ou Trésorier) grâce à la liste déroulante en haut de la fenêtre, puis cliquer sur **Enregistrer les modifications**. Seul un Trésorier peut modifier le rôle d’un autre Trésorier ou promouvoir un membre au rang de Trésorier. Votre propre rôle ne peut pas être modifié depuis cet écran, pour éviter de vous retirer accidentellement vos responsabilités.

Les membres invités n’ont pas accès à la configuration du groupe ni à la gestion des invitations.

![Menu Administration de Scouticket](/guide/administration-groupe.png)

## Scan automatique des justificatifs

Les responsables peuvent activer le scan depuis **Administration** puis **Paramètres du groupe**. Il est désactivé par défaut. Une fois activé :

- en **prenant une photo** ou en **important une image**, Scouticket détecte le ticket ou la facture et propose un aperçu du recadrage : vous pouvez l’utiliser, ajuster les quatre coins à la main, garder l’image d’origine ou annuler. Si rien n’est détecté, un message jaune vous invite à ajuster les coins, qui s’ouvrent directement ;
- un **PDF** ou un autre fichier non image est ajouté tel quel.

Le traitement se fait dans votre navigateur : aucune image n’est envoyée à un service externe.

## Conversion des justificatifs en PDF

Depuis **Paramètres du groupe**, les responsables peuvent activer la conversion des justificatifs en PDF. Désactivée par défaut, les justificatifs sont envoyés à la trésorerie dans leur format d’origine. Activée, chaque photo ou image est convertie en PDF (un PDF par justificatif) avant l’envoi par e-mail ; les PDF sont envoyés tels quels. Rien n’est conservé par Scouticket.

## Logo des notes de frais signées

Quand les **notes de frais signées** sont activées, les responsables peuvent remplacer le logo SGDF affiché en haut du document depuis **Paramètres du groupe** (bloc « Logo de la note de frais »). Formats acceptés : PNG, JPEG ou WebP, 1 Mo maximum, de 100x30 à 2000x2000 px. N’y placez aucune donnée personnelle. Le bouton **Rétablir le logo SGDF** supprime le logo personnalisé. Le changement ne s’applique qu’aux notes de frais déposées ensuite.

## Notes de frais kilométriques

Quand les **notes de frais signées** sont activées, les responsables peuvent activer les **notes de frais kilométriques** depuis **Paramètres du groupe** et régler le **taux du kilomètre** (0,354 € / km par défaut, mis à jour le 05/11/25). La date de mise à jour du taux s’affiche et change dès que vous modifiez le taux. Désactiver les notes de frais signées désactive aussi les kilomètres (le taux est conservé).

Une fois activées, un bouton **Ajouter des kilomètres** apparaît à côté de « Prendre photo » et « Importer fichier » dans une note de frais. Chaque déplacement demande la date, la distance en km, l’activité liée et l’objet du déplacement (soyez précis sur les motifs et les destinations). Chaque déplacement occupe une ligne de la note de frais, comme un justificatif (12 lignes au maximum, justificatifs et déplacements confondus). Le montant remboursé (total des km x taux) apparaît sous le total des kilomètres. Le taux appliqué est celui en vigueur au moment de l’envoi.

## Moyens de paiement du groupe

Depuis **Paramètres du groupe**, les responsables gèrent la liste des moyens de paiement proposés lors d’une dépense avec un moyen de paiement du groupe (par exemple « Carte de procurement » ou « Espèces du groupe ») :

- pour **ajouter** un moyen, tapez son nom dans le champ puis cliquez sur **Ajouter** (le bouton reste désactivé si le moyen existe déjà ou si le champ est vide) ;
- pour **retirer** un moyen, cliquez sur l’icône poubelle à côté de son nom. Il doit toujours en rester au moins un.

Cette liste est propre à chaque groupe ; elle n’a aucun impact sur les notes de frais, qui ne demandent pas de moyen de paiement.

## Suivi budgétaire

Dans **Paramètres du groupe**, les responsables peuvent activer le **suivi budgétaire** (il nécessite l’historique). Chaque dépense, recette ou note de frais est alors rattachée à un **poste budgétaire** (« Camp », « Matériel », « Calendrier »…), choisi par le membre dans le formulaire. Des postes par défaut sont créés à l’activation et se modifient depuis la page **Suivi budgétaire**.

Cette page, réservée aux responsables et disponible sur ordinateur uniquement, compare pour l’année comptable choisie le budget prévu et le réalisé de chaque poste, avec camemberts et barres, une alerte en cas de dépassement et un export CSV. Un responsable peut corriger le poste d’une écriture depuis l’historique.

L’onglet **Tableau** sert à saisir les budgets et à gérer les postes. L’onglet **Pilotage** donne la vue d’ensemble : le résultat prévu et réalisé (recettes moins dépenses), l’avancement de l’année face à la consommation des budgets, les postes à surveiller (budget dépassé ou consommé à 80 % et plus, recettes en retard), et la comparaison avec l’année précédente. Un clic sur une ligne de poste affiche ses écritures ; un clic sur une écriture l’ouvre, pour la corriger ou la reclasser dans un autre poste.

Désactiver le suivi supprime les postes, les budgets et les affectations (les montants de l’historique sont conservés), après confirmation.
