# Vérifier une note de frais signée

Chaque note de frais signée est envoyée au trésorier sous forme de PDF. Ce PDF est signé électroniquement : on peut vérifier qu'il n'a pas été modifié depuis les signatures et qu'il a bien été scellé par Scoutréso.

## L'empreinte du certificat de Scoutréso {#empreinte}

Les signatures sont faites avec un certificat propre à cette instance de Scoutréso. Pour s'assurer qu'une signature vient bien de ce certificat, comparez son empreinte SHA-256 avec celle-ci :

<div v-if="$frontmatter.empreinteCertificat" class="empreinte-certificat">
  <code>{{ $frontmatter.empreinteCertificat }}</code>
</div>
<div v-else>

::: warning Empreinte non publiée
L'empreinte du certificat n'est pas définie sur ce site. Demandez-la à la personne qui administre votre instance de Scoutréso.
:::

</div>

Cette empreinte n'est pas secrète : elle est faite pour être publiée. Si elle change, c'est que le certificat a été renouvelé (par exemple après une fuite de la clé). Les notes signées avant ce changement restent vérifiables avec l'ancienne empreinte.

## Vérifier avec Adobe Reader

1. Ouvrez le PDF reçu dans Adobe Reader.
2. Ouvrez le panneau **Signatures**. Chaque étape (bénéficiaire, responsable, trésorier) apparaît comme une signature distincte.
3. Vérifiez que chaque signature indique que le document n'a pas été modifié depuis son application.
4. Faites un clic droit sur une signature, puis **Afficher les propriétés de la signature** et **Afficher le certificat du signataire**.
5. Dans les détails du certificat, repérez l'empreinte numérique et comparez-la avec l'empreinte ci-dessus. Selon la version d'Adobe, seule l'empreinte SHA-1 est affichée : dans ce cas, utilisez la méthode en ligne de commande ci-dessous.

Adobe affiche « identité du signataire inconnue » tant que le certificat n'est pas importé. C'est normal : le certificat est auto-signé, il n'est pas émis par une autorité reconnue. Seule la comparaison de l'empreinte prouve qu'il s'agit du bon certificat.

## Vérifier en ligne de commande

Avec `pdfsig` (outils poppler) et `openssl` :

```bash
pdfsig -dump note-de-frais.pdf
openssl pkcs7 -inform DER -in note-de-frais.pdf.sig1 -print_certs | openssl x509 -noout -fingerprint -sha256
```

`pdfsig` extrait les signatures du PDF, puis `openssl` affiche l'empreinte SHA-256 du certificat. Comparez-la avec celle publiée plus haut, sans tenir compte des deux-points ni des majuscules.

## Ce que cette vérification garantit

- Le document et son dossier de preuve (nom, e-mail, adresse IP, dates de chaque signature) n'ont pas été modifiés depuis qu'ils ont été signés.
- Chaque signature a été posée avec le certificat dont vous avez vérifié l'empreinte.

Ce n'est pas une signature électronique qualifiée au sens d'eIDAS, et les dates sont celles du serveur de Scoutréso. Le détail du circuit et des preuves est dans la [documentation technique](/technical/ndf-signee#verifier-un-pdf-signe).
