# Configurer un groupe

Cette page s’adresse aux responsables de groupe. Eux seuls peuvent configurer le groupe et inviter les membres.

## Créer et configurer le groupe

1. Créez votre compte, puis créez le groupe depuis le sélecteur de groupe en haut de l’application.
2. À l’étape **1 — E-mail**, renseignez l’adresse de la trésorerie qui doit recevoir les justificatifs.
3. À l’étape **2 — Unités**, adaptez les unités de votre groupe puis envoyez la demande de validation.
4. À l’étape **3 — Validation**, la trésorerie reçoit un e-mail de confirmation. Cet écran reste affiché à tous les membres tant que le lien n’est pas confirmé ; il se débloque automatiquement après validation.

Les responsables peuvent renvoyer l’e-mail ou modifier l’adresse et les unités depuis l’écran de validation. Si l’e-mail n’arrive pas, vérifiez les courriers indésirables avant de demander un nouvel envoi.

![Écran d’attente de validation de la trésorerie](/guide/validation-tresorerie.png)

## Unités, branches et couleurs

Chaque groupe peut adapter ses unités à son fonctionnement. L’application propose au départ :

- Farfadets — vert
- Louveteaux-Jeannettes — orange
- Scouts-Guides — bleu clair
- Pionniers-Caravelles — rouge
- Compagnons — turquoise
- Groupe — bleu foncé

Vous pouvez renommer ou supprimer une unité, en ajouter une autre et choisir sa couleur depuis **Administration** puis **Gérer les unités**. Cette page ne modifie pas l’adresse de trésorerie. La couleur choisie apparaît dans l’e-mail de justificatif : elle aide la trésorerie à identifier rapidement l’unité concernée.

Conservez au moins une unité : un justificatif doit toujours être rattaché à une unité du groupe.

## Nom des justificatifs

Par défaut, les pièces jointes envoyées à la trésorerie gardent le nom du fichier importé par le membre. Les responsables peuvent définir un format de nom depuis **Administration** puis **Nom des justificatifs** ; en cochant l’option, le format est pré-rempli avec `date - unité - type - mode de paiement - montant` et reste modifiable.

Le format mélange du texte fixe et des variables entre accolades, par exemple `{YYYY}-{MM}-{DD} - {Branche} - {Type} - {Montant} - {Numero}` donne `2026-03-05 - Louveteaux - Carburants - 28.50 - 01.pdf`. Les boutons de la page insèrent les variables, et un aperçu montre le résultat. L’extension du fichier est ajoutée automatiquement.

| Variable                                          | Valeur                                                         |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `{YYYY}` `{MM}` `{DD}`                            | Année, mois et jour du justificatif (pas de l’envoi)           |
| `{Branche}` `{Type}` `{ModePaiement}` `{Montant}` | Unité, type de dépense, mode de paiement et montant            |
| `{AnneeComptable}`                                | Année comptable du justificatif                                |
| `{Numero}`                                        | Rang du justificatif dans l’envoi (01, 02…)                    |
| `{GlobalNumeroComptable}`                         | Rang dans l’année comptable, tous envois confondus (001, 002…) |
| `{GlobalNumero}`                                  | Rang dans l’ensemble des envois du groupe (001, 002…)          |

**Année comptable.** Elle commence par défaut le 1er septembre et se termine le 31 août. Vous pouvez changer le jour et le mois de début (pas le 29 février). Lorsqu’elle chevauche deux années civiles, choisissez l’affichage de `{AnneeComptable}` : année de début (2023), année de fin (2024) ou les deux (2023-2024). La numérotation `{GlobalNumeroComptable}` repart de 001 à chaque nouvelle année comptable.

**Numéros.** Un numéro n’est consommé que si l’e-mail est bien parti : un envoi en échec ne crée pas de trou. Pour reprendre une numérotation existante, saisissez le prochain numéro à attribuer dans la page. Si deux justificatifs d’un même envoi devaient porter le même nom, un ` - 01`, ` - 02`… est ajouté.

Décochez la personnalisation pour revenir au nom du fichier importé. Dans les deux cas, si deux pièces jointes d’un même envoi portent le même nom, un ` - 01`, ` - 02`… est ajouté.

## Inviter les membres

Depuis **Administration**, choisissez **Gérer les membres** et saisissez son adresse e-mail. Better Auth lui envoie une invitation ; après l’avoir acceptée, cette personne rejoint le groupe et peut envoyer ses justificatifs. La liste **Utilisateurs** réunit les membres du groupe et les invitations encore en attente d’acceptation. Une invitation en attente peut être annulée.

![Liste des utilisateurs et invitations en attente](/guide/gestion-membres-utilisateurs.png)

La personne invitée se connecte avec l’adresse e-mail qui a reçu l’invitation. Si elle crée son compte, elle confirme d’abord cette adresse depuis le lien reçu par e-mail. Sur l’accueil, un bandeau **« invitation en attente »** indique le nom du groupe et propose **Voir l’invitation**. Il apparaît sur l’écran **Bienvenue**, même avant que la personne ne rejoigne son premier groupe, et reste visible si elle utilise déjà un autre groupe. Elle doit accepter l’invitation pour rejoindre le nouveau groupe.

Depuis la fiche d’un membre (clic sur son nom dans la liste), un responsable peut aussi changer son rôle (Membre, Administrateur ou Responsable) grâce à la liste déroulante en haut de la fenêtre, puis cliquer sur **Enregistrer les modifications**. Seul un responsable (rôle Responsable) peut modifier le rôle d’un autre responsable ou promouvoir un membre au rang de responsable. Votre propre rôle ne peut pas être modifié depuis cet écran, pour éviter de vous retirer accidentellement vos responsabilités.

Les membres invités n’ont pas accès à la configuration du groupe, à l’adresse de trésorerie ni à la gestion des invitations.

![Menu Administration de Scouticket](/guide/administration-groupe.png)
