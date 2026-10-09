# Politique de confidentialité

Dernière mise à jour : {{ $frontmatter.donneesLegales.derniereMiseAJour }}.

Scoutréso permet d'envoyer des justificatifs à la trésorerie d'un groupe scout. Cette page explique quelles données personnelles sont traitées, pourquoi, pendant combien de temps et comment exercer vos droits. L'identité de l'éditeur et les coordonnées des hébergeurs sont dans les [mentions légales](/mentions-legales).

## Responsable du traitement et contact

Le responsable du traitement est l'éditeur du site, qui est anonyme (voir les [mentions légales](/mentions-legales)). Il n'y a pas de délégué à la protection des données : pour toute question ou pour exercer vos droits, écrivez à <a :href="`mailto:${$frontmatter.donneesLegales.contact}`">{{ $frontmatter.donneesLegales.contact }}</a>.

## Données traitées, finalités et bases légales

| Données                                                                                                                    | Pourquoi                                                                      | Base légale                                           |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------- |
| Nom, adresse e-mail, mot de passe (stocké haché)                                                                           | Créer votre compte, vous connecter, vous écrire (vérification, mot de passe)  | Exécution du service que vous demandez                |
| Identifiant de compte Google (si vous choisissez « Continuer avec Google »)                                                | Vous connecter sans mot de passe                                              | Votre consentement : vous pouvez ne pas l'utiliser    |
| Appartenance à un groupe, rôle, unités                                                                                     | Limiter chaque membre à ses unités et aux actions de son rôle                 | Exécution du service                                  |
| Contenu d'un envoi : date, montant, catégorie, description, justificatifs, RIB éventuel                                    | Transmettre votre demande de remboursement ou votre recette à la trésorerie   | Exécution du service                                  |
| Historique et suivi budgétaire (options activées par le groupe) : montants, catégories, noms des auteurs, postes           | Permettre à la trésorerie de retrouver et suivre les opérations               | Intérêt légitime du groupe (gestion de sa trésorerie) |
| Note de frais signée (option) : nom, adresse e-mail, adresse IP, navigateur, dates des codes reçus par e-mail              | Prouver qui a signé chaque étape                                              | Exécution du service                                  |
| Adresse IP, date et événements de sécurité (connexion, mot de passe, invitations), pseudonymisés dans les journaux d'audit | Sécurité du service, limitation du nombre de tentatives, résolution de pannes | Intérêt légitime (sécurité et bon fonctionnement)     |

Aucune donnée sensible au sens de l'article 9 du RGPD (santé, opinions, origine, etc.) n'est traitée. Les mineurs ne doivent pas voir leurs données personnelles collectées ou conservées : n'inscrivez pas de mineur.

## Caractère obligatoire des données

Le nom, l'adresse e-mail et le mot de passe (ou la connexion Google) sont nécessaires pour créer un compte : sans eux, vous ne pouvez pas utiliser le service. Les autres données dépendent de ce que vous choisissez d'envoyer. Le RIB est facultatif et n'est joint qu'à l'e-mail adressé à la trésorerie.

## Ce qui n'est pas conservé

- Les **justificatifs et le RIB** ne sont jamais enregistrés par Scoutréso : ils sont envoyés par e-mail à la trésorerie, avec une copie à l'expéditeur, puis oubliés.
- Le traitement des images (recadrage, conversion) se fait dans votre navigateur ou le temps de la requête.
- Une **note de frais signée** est conservée en base, avec son PDF, uniquement le temps de son circuit de signature, puis supprimée dès qu'il se termine. Les preuves de signature restent dans le PDF signé envoyé à la trésorerie.

## Destinataires et sous-traitants

- **Les trésoriers de votre groupe** reçoivent vos envois ; les responsables et trésoriers voient les informations nécessaires à leur rôle (membres, historique, budget).
- **Les prestataires techniques**, qui traitent des données pour le compte de l'éditeur :

<ul>
  <li v-for="prestataire in [...$frontmatter.donneesLegales.hebergeurs, ...$frontmatter.donneesLegales.sousTraitantsSupplementaires, $frontmatter.donneesLegales.registrar]" :key="prestataire.nom">
    <strong>{{ prestataire.raisonSociale }}</strong> : {{ prestataire.role }}.
    Données concernées : {{ prestataire.donnees }}.
    Localisation : {{ prestataire.localisation }}.
  </li>
</ul>

- **Google**, uniquement si vous utilisez « Continuer avec Google ».

Vos données ne sont ni vendues ni utilisées à des fins publicitaires.

## Durées de conservation

| Donnée                                         | Durée                                                                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compte                                         | Jusqu'à la suppression de votre compte (page « Mon compte », après avoir quitté vos groupes)                                                                                |
| Historique et suivi budgétaire d'un groupe     | Tant que le groupe garde l'option active. Désactiver l'option, ou supprimer le groupe, supprime les données. Supprimer votre compte anonymise votre nom (« Ancien membre ») |
| Note de frais signée et ses codes de signature | Le temps du circuit de signature, supprimés à sa clôture                                                                                                                    |
| Journaux techniques et d'audit                 | Selon la durée de conservation de l'hébergeur de journaux, avec identifiants pseudonymisés                                                     |
| E-mails envoyés                                | Dans les boîtes mail des destinataires, sous leur responsabilité                                                                                                            |

## Vos droits

Vous pouvez demander l'accès à vos données, leur rectification, leur effacement, la limitation ou l'opposition à un traitement, et la portabilité de vos données, en écrivant à <a :href="`mailto:${$frontmatter.donneesLegales.contact}`">{{ $frontmatter.donneesLegales.contact }}</a>. Vous pouvez modifier votre profil et supprimer votre compte directement dans l'application. Si vous estimez que vos droits ne sont pas respectés, vous pouvez déposer une réclamation auprès de la [CNIL](https://www.cnil.fr/fr/plaintes).

## Transferts hors de l'Union européenne

La base de données est hébergée à Francfort et les e-mails sont envoyés depuis l'Irlande, deux régions de l'Union européenne. Les prestataires Vercel, Resend et Namecheap sont toutefois des sociétés américaines : certaines données techniques (journaux d'accès, données de compte et journaux de Resend, enregistrement du domaine) sont traitées aux États-Unis. Vercel et Resend adhèrent au cadre de protection des données UE-États-Unis ; à défaut, les transferts s'appuient sur des clauses contractuelles types.

## Cookies et traceurs

- Un **cookie de session** est déposé à la connexion : il est strictement nécessaire au fonctionnement du service et ne demande donc pas votre consentement.
- Le navigateur garde, sur votre appareil seulement, quelques préférences (année comptable choisie, avis de nouveauté déjà vu, retour après invitation). Elles ne sont jamais envoyées à un tiers.
- L'application installable (PWA) met en cache uniquement des fichiers statiques, jamais vos pages ni vos données.
- Aucun outil de mesure d'audience, de publicité ou de réseau social n'est actif : il n'y a donc pas de bandeau de consentement aux cookies.
