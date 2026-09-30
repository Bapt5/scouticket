import { readFileSync } from "node:fs";
import { join } from "node:path";
import { echapperHtml } from "@/lib/email";
import { colonneSgdf } from "@/lib/sgdf/mappingCategories";

const LOGO_DATA_URI = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "src/assets/sgdf/logo.png"),
).toString("base64")}`;

/** Nombre de lignes du tableau dans le template SGDF (lignes 10 à 21). */
const NOMBRE_LIGNES_TEMPLATE = 12;

export interface LignePourPdf {
  categorie: string;
  montant: number;
}

export interface PieceJustificativePourPdf {
  /** N° de pièce (1..N, ordre des pièces jointes). */
  numero: number;
  /** Date d'affichage, déjà formatée (jj/mm/aaaa). */
  date: string;
  activite: string;
  description: string;
  lignes: LignePourPdf[];
}

export interface NoteDeFraisPourPdf {
  groupe: string;
  demandeur: string;
  unite: string;
  pieces: PieceJustificativePourPdf[];
  /** Noms des signataires déjà résolus (règle de conflit d'intérêt appliquée au dépôt). */
  responsableNom: string;
  tresorierNom: string;
}

const formateurMontant = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

function formaterMontant(valeur: number): string {
  return formateurMontant.format(valeur);
}

function totauxPiece(piece: PieceJustificativePourPdf) {
  const totaux = { transport: 0, hebergementIntendance: 0, autreFrais: 0 };
  for (const ligne of piece.lignes) {
    const colonne = colonneSgdf(ligne.categorie);
    totaux[colonne] += ligne.montant;
  }
  return totaux;
}

function celluleMontant(valeur: number): string {
  return valeur > 0 ? formaterMontant(valeur) : "";
}

function construireLigne(piece: PieceJustificativePourPdf | null): string {
  if (!piece) {
    return `<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
  }
  const totaux = totauxPiece(piece);
  return `<tr>
    <td>${piece.numero}</td>
    <td>${echapperHtml(piece.date)}</td>
    <td class="activite">${echapperHtml(piece.activite)}</td>
    <td class="description">${echapperHtml(piece.description)}</td>
    <td>${celluleMontant(totaux.transport)}</td>
    <td></td>
    <td>${celluleMontant(totaux.hebergementIntendance)}</td>
    <td>${celluleMontant(totaux.autreFrais)}</td>
  </tr>`;
}

/**
 * Construit le HTML de la page note de frais (fidèle au template SGDF
 * `templates/ndf_sgdf.xlsx`, voir `src/lib/sgdf/modele.html` pour la
 * référence visuelle) prêt à être rendu en PDF par `genererPagePdf.ts`.
 * Le bloc signatures n'affiche que le nom des 3 signataires attendus (jamais
 * de date ni de mention "signé le ...") : cette page est générée une seule
 * fois, avant que les signatures n'aient réellement eu lieu, donc toute date
 * y serait fausse ou toujours vide. La preuve de chaque signature (horodatage,
 * IP, etc.) vit dans le certificat récapitulatif ajouté à la fin du document
 * final, voir `src/lib/ndfSignature/document.ts`.
 */
export function construireHtmlNoteDeFrais(donnees: NoteDeFraisPourPdf): string {
  if (donnees.pieces.length > NOMBRE_LIGNES_TEMPLATE) {
    throw new Error("TROP_DE_PIECES_POUR_LE_TEMPLATE_SGDF");
  }

  const totalGeneral = {
    transport: 0,
    hebergementIntendance: 0,
    autreFrais: 0,
  };
  for (const piece of donnees.pieces) {
    const totaux = totauxPiece(piece);
    totalGeneral.transport += totaux.transport;
    totalGeneral.hebergementIntendance += totaux.hebergementIntendance;
    totalGeneral.autreFrais += totaux.autreFrais;
  }
  const totalARembourser =
    totalGeneral.transport +
    totalGeneral.hebergementIntendance +
    totalGeneral.autreFrais;

  const lignesRemplies = donnees.pieces.map(construireLigne);
  const lignesVides = Array.from(
    { length: NOMBRE_LIGNES_TEMPLATE - donnees.pieces.length },
    () => construireLigne(null),
  );
  const lignesHtml = [...lignesRemplies, ...lignesVides].join("\n");

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Feuille de remboursement de frais</title>
    <style>${CSS_MODELE}</style>
  </head>
  <body>
    <div class="page">
      <div class="entete">
        <div class="logo">
          <img src="${LOGO_DATA_URI}" alt="Scouts et Guides de France" />
        </div>
        <div class="titre">FEUILLE DE REMBOURSEMENT DE FRAIS</div>
        <div class="groupe">
          <div class="libelle">Groupe :</div>
          <div class="nom">${echapperHtml(donnees.groupe)}</div>
        </div>
      </div>

      <div class="instructions">
        <span class="libelle">Instructions :</span>
        <span>
          Remplir une ligne par pièce justificative. Numéroter les pièces et
          reporter ce numéro dans la première colonne. Joindre les
          justificatifs. Faire signer à votre responsable d'unité ou de
          groupe, avant d'envoyer à votre trésorier.
        </span>
      </div>

      <div class="identite">
        <div class="bloc">
          <div class="titre-champ">NOM - PRENOM DU DEMANDEUR</div>
          <div class="valeur">${echapperHtml(donnees.demandeur)}</div>
        </div>
        <div class="bloc">
          <div class="titre-champ">UNITE</div>
          <div class="valeur">${echapperHtml(donnees.unite)}</div>
        </div>
        <div class="paiement">
          <div class="titre-champ">PAIEMENT PAR VIREMENT</div>
          <div class="sous-titre">Joindre un RIB</div>
        </div>
      </div>

      <table class="lignes">
        <colgroup>
          <col style="width: 6.75%" />
          <col style="width: 10.65%" />
          <col style="width: 10.03%" />
          <col style="width: 37.94%" />
          <col style="width: 6.7%" />
          <col style="width: 10.65%" />
          <col style="width: 10.6%" />
          <col style="width: 6.7%" />
        </colgroup>
        <thead>
          <tr>
            <th>N° de pièce</th>
            <th>DATE des dépenses</th>
            <th>ACTIVITE LIEE<br />(journée, WE, camp)</th>
            <th>DESCRIPTION</th>
            <th>TRANSPORT<br />avec justificatifs</th>
            <th>TRANSPORT<br />Nb kilomètres</th>
            <th>HEBERGEMENT<br />INTENDANCE</th>
            <th>AUTRE FRAIS<br />EN MISSION</th>
          </tr>
        </thead>
        <tbody>
          ${lignesHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4" class="libelle-total">TOTAL COLONNES :</td>
            <td>${formaterMontant(totalGeneral.transport)}</td>
            <td>${formaterMontant(0)}</td>
            <td>${formaterMontant(totalGeneral.hebergementIntendance)}</td>
            <td>${formaterMontant(totalGeneral.autreFrais)}</td>
          </tr>
        </tfoot>
      </table>

      <div class="apres-tableau">
        <div class="taux">
          Taux du kilomètre utilisé : (mis à jour le 05/11/25)
          <strong>0,354 €</strong>
        </div>
        <div class="total-general">
          Total : <span class="montant">${formaterMontant(totalARembourser)}</span>
        </div>
      </div>

      <div class="signatures">
        <div class="colonne">
          <div class="intitule">Signature du demandeur</div>
          <div class="ligne-champ">
            <span class="label">Nom :</span>
            <span class="valeur">${echapperHtml(donnees.demandeur)}</span>
          </div>
          <div class="zone-signature">
            Signature électronique : voir le certificat de signature en fin
            de document.
          </div>
        </div>
        <div class="colonne">
          <div class="intitule">
            Visa pour approbation du responsable d'unité<br />
            (ou du responsable de groupe si le demandeur est le responsable
            d'unité)
          </div>
          <div class="ligne-champ">
            <span class="label">Nom :</span>
            <span class="valeur">${echapperHtml(donnees.responsableNom)}</span>
          </div>
          <div class="zone-signature">
            Signature électronique : voir le certificat de signature en fin
            de document.
          </div>
        </div>
        <div class="colonne">
          <div class="intitule">
            Traitement par le trésorier<br />
            (la même personne ne peut pas valider la NDF et effectuer le
            règlement)
          </div>
          <div class="ligne-champ">
            <span class="label">Nom :</span>
            <span class="valeur">${echapperHtml(donnees.tresorierNom)}</span>
          </div>
          <div class="zone-signature">
            Signature électronique : voir le certificat de signature en fin
            de document.
          </div>
          <div class="tresorier-extra">
            <span>Somme à rembourser : <strong>${formaterMontant(totalARembourser)}</strong></span>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

const CSS_MODELE = `
  @page { size: A4 landscape; margin: 10mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Aptos", "Calibri", "Segoe UI", Arial, sans-serif; color: #000; margin: 0; font-size: 12px; }
  .page { width: 273mm; }
  .entete { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 6px; }
  .entete .logo img { width: 62mm; height: auto; }
  .entete .titre { flex: 1; text-align: center; font-size: 24px; font-weight: bold; padding-top: 10px; }
  .entete .groupe { text-align: center; min-width: 60mm; }
  .entete .groupe .libelle { font-size: 9px; font-weight: bold; }
  .entete .groupe .nom { font-size: 22px; border-bottom: 1px solid #000; padding: 2px 6px; }
  .instructions { display: flex; gap: 8px; font-size: 10px; margin-bottom: 8px; }
  .instructions .libelle { font-weight: bold; white-space: nowrap; }
  .identite { display: flex; gap: 12px; margin-bottom: 8px; }
  .identite .bloc { flex: 1; border: 1px solid #000; }
  .identite .bloc .titre-champ { font-weight: bold; text-align: center; font-size: 11px; border-bottom: 1px solid #000; padding: 2px; background: #f2f2f2; }
  .identite .bloc .valeur { text-align: center; font-size: 16px; padding: 6px; min-height: 20px; }
  .identite .paiement { width: 55mm; border: 1px solid #000; text-align: center; padding: 4px; font-size: 10px; }
  .identite .paiement .titre-champ { font-weight: bold; }
  .identite .paiement .sous-titre { font-size: 13px; margin-top: 4px; }
  table.lignes { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.lignes th, table.lignes td { border: 1px solid #000; padding: 2px 4px; text-align: center; vertical-align: middle; overflow: hidden; }
  table.lignes thead th { font-size: 8px; font-weight: bold; line-height: 1.1; background: #f2f2f2; }
  table.lignes tbody td { font-size: 13px; height: 18px; }
  table.lignes td.description, table.lignes td.activite { text-align: left; }
  table.lignes tfoot td { font-weight: bold; font-size: 12px; }
  table.lignes tfoot td.libelle-total { text-align: right; font-size: 9px; }
  .apres-tableau { display: flex; justify-content: space-between; align-items: center; font-size: 11px; margin-bottom: 8px; }
  .apres-tableau .taux { text-align: right; }
  .apres-tableau .total-general { text-align: right; font-weight: bold; }
  .apres-tableau .total-general .montant { font-size: 15px; }
  .signatures { display: flex; gap: 0; border: 1px solid #000; }
  .signatures .colonne { flex: 1; border-right: 1px solid #000; padding: 6px 8px; font-size: 11px; }
  .signatures .colonne:last-child { border-right: none; }
  .signatures .colonne .intitule { font-weight: bold; text-align: center; margin-bottom: 10px; min-height: 42px; }
  .signatures .ligne-champ { display: flex; gap: 4px; margin-bottom: 6px; }
  .signatures .ligne-champ .label { white-space: nowrap; }
  .signatures .ligne-champ .valeur { border-bottom: 1px solid #000; flex: 1; min-height: 14px; }
  .signatures .zone-signature { margin-top: 10px; min-height: 30px; font-style: italic; font-size: 10px; color: #555; }
  .signatures .tresorier-extra { margin-top: 8px; font-size: 10px; }
`;
