# Les e-mails de justificatifs et de recettes

À chaque envoi, l’application envoie un e-mail à tous les Trésoriers du groupe (membres ayant le rôle `owner`) et met l’utilisateur en copie. Les justificatifs ne sont pas conservés par l’application : ils sont transmis en pièces jointes dans cet e-mail (pièce jointe facultative pour une recette).

## Ce que contient l’e-mail

L’objet indique le type d’envoi : **Note de frais**, **Dépense avec moyen de paiement du groupe** ou **Recette**.

| Élément        | Note de frais                                                                                                                            | Dépense avec moyen de paiement du groupe                                                                | Recette                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Objet          | Note de frais, groupe, unité et date                                                                                                     | Dépense avec moyen de paiement du groupe, groupe, unité et date                                         | Recette, groupe, unité et date                                                                |
| Référence      | Nom généré par la nomenclature, si un format est configuré pour les dépenses (sinon absente)                                             | Idem                                                                                                    | Idem, avec le format et le compteur propres aux recettes, affichée **même sans pièce jointe** |
| Détail         | Pour chaque justificatif : référence, date de la dépense, activité liée, description, lignes catégorie comptable / montant et sous-total | Référence, date du justificatif, description, lignes catégorie comptable / montant et moyen de paiement | Référence, date, mode de paiement, description, lignes catégorie comptable / montant          |
| Informations   | Unité, demandeur, ventilation du total par catégorie comptable, total général et présence du RIB                                         | Unité, demandeur et total                                                                               | Unité, déclarant, ventilation par catégorie comptable et total                                |
| Pièces jointes | Les photos et PDF envoyés, puis le RIB s’il est fourni (nommé `RIB - {nom du demandeur}`)                                                | Le justificatif (un seul), ou aucune si envoyée sans justificatif                                       | Aucune, ou une seule pièce jointe facultative                                                 |
| Couleur        | La couleur de l’unité choisie dans la configuration du groupe                                                                            | La couleur de l’unité choisie dans la configuration du groupe                                           | La couleur de l’unité choisie dans la configuration du groupe                                 |

La référence apparaît dans le corps de l’e-mail dès qu’un format de nomenclature est configuré (page **Nomenclature**), y compris pour une recette ou une dépense sans justificatif envoyée sans pièce jointe : elle n’est alors visible nulle part ailleurs, puisqu’il n’y a pas de nom de fichier pour la porter.

Une dépense avec moyen de paiement du groupe envoyée sans justificatif (réservé aux responsables, voir le [guide d’usage](/guide/usage)) affiche en plus un encart d’avertissement rappelant qu’un responsable a attesté qu’aucun justificatif n’était nécessaire.

Vous pouvez ensuite rechercher le nom du groupe, une unité, une date, une référence ou un mot de la description dans votre boîte e-mail pour retrouver un justificatif ou une recette.

::: info Capture à venir

Ajoutez ici `guide/email-justificatif.png` : exemple d’e-mail reçu avec les informations de dépense et les pièces jointes.

:::
