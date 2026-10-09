# Mentions légales

Dernière mise à jour : {{ $frontmatter.donneesLegales.derniereMiseAJour }}.

## Éditeur du site

Scoutréso est un site non professionnel, gratuit et open source, édité à titre personnel par un particulier. L'éditeur a choisi de rester anonyme : conformément à l'article 1-1 de la loi pour la confiance dans l'économie numérique (LCEN), son identité a été communiquée à l'hébergeur du site, dont les coordonnées figurent ci-dessous.

Le directeur de la publication est l'éditeur du site, dans les mêmes conditions d'anonymat.

## Contact

Pour toute question sur le site, le signalement d'un contenu ou l'exercice de vos droits sur vos données personnelles : <a :href="`mailto:${$frontmatter.donneesLegales.contact}`">{{ $frontmatter.donneesLegales.contact }}</a>.

Les idées, retours et anomalies peuvent aussi être signalés sur les <a :href="`${$frontmatter.donneesLegales.depotCode}/issues`" target="_blank" rel="noopener noreferrer">issues GitHub</a>.

## Hébergement

Le site de documentation et l'application sont hébergés par les prestataires suivants.

<ul>
  <li v-for="hebergeur in $frontmatter.donneesLegales.hebergeurs" :key="hebergeur.nom">
    <strong>{{ hebergeur.raisonSociale }}</strong> : {{ hebergeur.role }}.<br />
    Adresse : {{ hebergeur.adresse }}.<br />
    Contact : {{ hebergeur.contact }} ·
    <a :href="hebergeur.siteWeb" target="_blank" rel="noopener noreferrer">{{ hebergeur.siteWeb }}</a>
  </li>
</ul>

## Nom de domaine

Le nom de domaine `scoutreso.me` est enregistré et géré (DNS) auprès de **{{ $frontmatter.donneesLegales.registrar.raisonSociale }}**, {{ $frontmatter.donneesLegales.registrar.adresse }}. Ce prestataire n'héberge ni le site ni les données des utilisateurs.

## Propriété intellectuelle

Le code source de Scoutréso est publié sous <a :href="`${$frontmatter.donneesLegales.depotCode}/blob/main/LICENSE`" target="_blank" rel="noopener noreferrer">licence MIT</a> : vous pouvez l'utiliser, l'héberger pour votre groupe et l'adapter. Les textes de cette documentation sont publiés avec le code, dans le même dépôt.

## Données personnelles et cookies

Le traitement des données personnelles est détaillé dans la [politique de confidentialité](/confidentialite).
