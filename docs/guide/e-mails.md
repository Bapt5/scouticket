# Les e-mails de justificatifs

À chaque envoi, l’application envoie un e-mail à l’adresse de trésorerie du groupe et met l’utilisateur en copie. Les justificatifs ne sont pas conservés par l’application : ils sont transmis en pièces jointes dans cet e-mail.

## Ce que contient l’e-mail

L’objet indique le type d’envoi : **Note de frais** ou **Dépense avec moyen de paiement du groupe**.

| Élément        | Note de frais                                                                                                                 | Dépense avec moyen de paiement du groupe                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Objet          | Note de frais, groupe, unité et date                                                                                          | Dépense avec moyen de paiement du groupe, groupe, unité et date                              |
| Justificatif   | Pour chaque justificatif : date de la dépense, activité liée, description, lignes catégorie comptable / montant et sous-total | Date du justificatif, description, lignes catégorie comptable / montant et moyen de paiement |
| Informations   | Unité, demandeur, ventilation du total par catégorie comptable, total général et présence du RIB                              | Unité, demandeur et total                                                                    |
| Pièces jointes | Les photos et PDF envoyés, puis le RIB s’il est fourni (nommé `RIB - {nom du demandeur}`)                                     | Le justificatif (un seul)                                                                    |
| Couleur        | La couleur de l’unité choisie dans la configuration du groupe                                                                 | La couleur de l’unité choisie dans la configuration du groupe                                |

Vous pouvez ensuite rechercher le nom du groupe, une unité, une date ou un mot de la description dans votre boîte e-mail pour retrouver un justificatif.

::: info Capture à venir

Ajoutez ici `guide/email-justificatif.png` : exemple d’e-mail reçu avec les informations de dépense et les pièces jointes.

:::
