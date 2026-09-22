# Journalisation structurée

Les journaux techniques sont écrits au format JSON sur la sortie standard et peuvent être ingérés par OpenObserve.

Chaque événement contient un `evenement`, un `niveau` et un `contexte`. Le contexte impose une `categorie` parmi `api`, `authentification`, `email`, `base_de_donnees`, `depense`, `invitation`, `preference_unite`, `framework` ou `auth`.

Les champs communs sont en français avec la convention `camelCase` : `identifiantRequete`, `identifiantUtilisateur`, `methode`, `route`, `statutHttp`, `dureeMs`, `resultat`, `codeErreur` et `erreur`. Les informations de diagnostic ponctuelles sont placées dans `details`, qui n’accepte que des valeurs scalaires.

Pendant la bêta, les journaux techniques des requêtes contiennent l’identifiant Better Auth brut dans `identifiantUtilisateur`, ou `null` pour une requête anonyme. Les identifiants d’organisation restent exclus. Les événements de catégorie `auth` utilisent uniquement `identifiantUtilisateurPseudonymise` et `identifiantOrganisationPseudonymise`.
