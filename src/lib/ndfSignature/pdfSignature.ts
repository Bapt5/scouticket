import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFInvalidObject,
  PDFName,
  PDFNumber,
  PDFString,
  PDFStream,
  StandardFonts,
  type PDFFont,
  type PDFObject,
} from "pdf-lib";
import signpdf from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import {
  ANNOTATION_FLAGS,
  DEFAULT_BYTE_RANGE_PLACEHOLDER,
  SIG_FLAGS,
  SUBFILTER_ADOBE_PKCS7_DETACHED,
} from "@signpdf/utils";
import type { EtapeSignature } from "@/lib/ndfSignature/circuit";
import { LIBELLES_ETAPE } from "@/lib/ndfSignature/dossierPreuve";

/**
 * Signatures électroniques PAdES cumulatives du PDF d'une note de frais.
 *
 * Au dépôt, le document reçoit 3 pages de signature (une par étape), chacune
 * avec un champ de signature vide. À chaque étape, on REMPLIT le champ
 * correspondant et on le signe, en ajout incrémental : les octets déjà écrits
 * ne changent jamais (pdf-lib réécrirait tout le fichier et invaliderait les
 * signatures précédentes). Chaque signature couvre donc tous les octets
 * précédents, ce qui permet de vérifier la chaîne avec n'importe quel lecteur
 * PDF, sans le serveur. Remplir un champ de signature est une modification
 * explicitement autorisée après une signature d'approbation (contrairement à
 * l'ajout d'une page).
 */

export const ETAPES_SIGNATURE: EtapeSignature[] = [
  "beneficiaire",
  "responsable",
  "tresorier",
];

const LARGEUR_PAGE = 595.28;
const HAUTEUR_PAGE = 841.89;
const ZONE = { x: 40, y: 60, largeur: 515, hauteur: 700 };
const MARGE_INTERIEURE = 12;
/** Chiffres hexadécimaux réservés pour le CMS (4 096 octets ; une signature avec un certificat auto-signé en pèse environ 2 000). */
const LONGUEUR_SIGNATURE = 8192;

export interface SignataireDocument {
  etape: EtapeSignature;
  nom: string;
}

const nomChamp = (etape: EtapeSignature) => `signature-${etape}`;

// --- Texte ---

/** Remplace les caractères que l'encodage WinAnsi de la police ne sait pas écrire. */
function textePourPolice(police: PDFFont, texte: string): string {
  const supportes = new Set(police.getCharacterSet());
  return Array.from(texte)
    .map((c) => (supportes.has(c.codePointAt(0) ?? 0) ? c : "?"))
    .join("");
}

/** Découpe un texte en lignes qui tiennent dans `largeurMax` (coupe au mot, puis au caractère). */
function decouper(
  police: PDFFont,
  texte: string,
  taille: number,
  largeurMax: number,
): string[] {
  const propre = textePourPolice(police, texte);
  const lignes: string[] = [];
  let courante = "";
  const ajouter = (morceau: string) => {
    const candidat = courante ? `${courante} ${morceau}` : morceau;
    if (police.widthOfTextAtSize(candidat, taille) <= largeurMax) {
      courante = candidat;
      return;
    }
    if (courante) lignes.push(courante);
    courante = "";
    let reste = morceau;
    while (police.widthOfTextAtSize(reste, taille) > largeurMax) {
      let coupe = reste.length - 1;
      while (
        coupe > 1 &&
        police.widthOfTextAtSize(reste.slice(0, coupe), taille) > largeurMax
      )
        coupe--;
      lignes.push(reste.slice(0, coupe));
      reste = reste.slice(coupe);
    }
    courante = reste;
  };
  for (const mot of propre.split(" ")) ajouter(mot);
  if (courante) lignes.push(courante);
  return lignes;
}

// --- Apparence d'un champ de signature ---

interface ContenuApparence {
  titre: string;
  sousTitre: string;
  lignes: string[];
  couleurFond: [number, number, number];
}

function creerApparence(
  document: PDFDocument,
  police: PDFFont,
  gras: PDFFont,
  contenu: ContenuApparence,
) {
  const { largeur, hauteur } = ZONE;
  const largeurTexte = largeur - 2 * MARGE_INTERIEURE;
  const [r, v, b] = contenu.couleurFond;
  let operateurs = `q ${r} ${v} ${b} rg 0 0 ${largeur} ${hauteur} re f Q\n`;
  operateurs += `q 0.1 0.3 0.6 RG 1.5 w 1 1 ${largeur - 2} ${hauteur - 2} re S Q\n`;
  const texte = (
    fonte: "F1" | "FB",
    taille: number,
    y: number,
    police_: PDFFont,
    ligne: string,
  ) =>
    `BT /${fonte} ${taille} Tf ${MARGE_INTERIEURE} ${y} Td ${police_.encodeText(ligne).toString()} Tj ET\n`;
  let y = hauteur - 28;
  operateurs += texte("FB", 13, y, gras, textePourPolice(gras, contenu.titre));
  y -= 20;
  operateurs += texte(
    "F1",
    10,
    y,
    police,
    textePourPolice(police, contenu.sousTitre),
  );
  y -= 32;
  for (const ligne of contenu.lignes)
    for (const morceau of decouper(police, ligne, 9, largeurTexte)) {
      operateurs += texte("F1", 9, y, police, morceau);
      y -= 13;
    }
  const apparence = document.context.stream(Buffer.from(operateurs, "latin1"), {
    Type: "XObject",
    Subtype: "Form",
    BBox: [0, 0, largeur, hauteur],
    Resources: { Font: { F1: police.ref, FB: gras.ref } },
  });
  return document.context.register(apparence);
}

// --- Dépôt : pages de signature vides ---

/**
 * Ajoute au document les 3 pages de signature, chacune avec un champ de
 * signature vide et son apparence « en attente ». À appeler au dépôt, avant
 * le hash : ces pages font partie du document initial.
 */
export async function preparerPagesSignature(
  document: PDFDocument,
  signataires: SignataireDocument[],
): Promise<void> {
  const police = await document.embedFont(StandardFonts.Helvetica);
  const gras = await document.embedFont(StandardFonts.HelveticaBold);
  const acroForm = document.context.obj({ Fields: [], SigFlags: 0 });
  document.catalog.set(
    PDFName.of("AcroForm"),
    document.context.register(acroForm),
  );
  const champs = acroForm.get(PDFName.of("Fields")) as PDFArray;

  for (const etape of ETAPES_SIGNATURE) {
    const signataire = signataires.find((s) => s.etape === etape);
    if (!signataire) throw new Error(`Signataire manquant : ${etape}`);
    const page = document.addPage([LARGEUR_PAGE, HAUTEUR_PAGE]);
    page.drawText(`Signature : ${LIBELLES_ETAPE[etape]}`, {
      x: ZONE.x,
      y: 800,
      size: 16,
      font: gras,
    });
    const widget = document.context.register(
      document.context.obj({
        Type: "Annot",
        Subtype: "Widget",
        FT: "Sig",
        Rect: [ZONE.x, ZONE.y, ZONE.x + ZONE.largeur, ZONE.y + ZONE.hauteur],
        T: PDFString.of(nomChamp(etape)),
        F: ANNOTATION_FLAGS.PRINT,
        P: page.ref,
        AP: {
          N: creerApparence(document, police, gras, {
            titre: `${signataire.nom} (${LIBELLES_ETAPE[etape]})`,
            sousTitre: "En attente de signature",
            lignes: [],
            couleurFond: [0.97, 0.97, 0.97],
          }),
        },
      }),
    );
    page.node.set(PDFName.of("Annots"), document.context.obj([widget]));
    champs.push(widget);
  }
}

// --- Certificat de scellement ---

function chargerCertificat(): { p12: Buffer; motDePasse: string } {
  const p12Base64 = process.env.NDF_SCELLEMENT_P12_BASE64;
  const motDePasse = process.env.NDF_SCELLEMENT_P12_MOT_DE_PASSE;
  if (!p12Base64 || motDePasse === undefined)
    throw new Error(
      "NDF_SCELLEMENT_P12_BASE64 et NDF_SCELLEMENT_P12_MOT_DE_PASSE sont requis pour signer les notes de frais.",
    );
  return { p12: Buffer.from(p12Base64, "base64"), motDePasse };
}

// --- Ajout incrémental ---

function octets(objet: PDFObject): Buffer {
  const tampon = new Uint8Array(objet.sizeInBytes());
  objet.copyBytesInto(tampon, 0);
  return Buffer.from(tampon);
}

interface FinPdf {
  precedentXref: number;
  taille: number;
  racine: RegExpExecArray;
  info: RegExpExecArray | null;
  id: string | null;
}

/** Dernier `startxref` et trailer du PDF (table xref classique uniquement). */
function lireFin(pdf: Buffer): FinPdf {
  const positionStartxref = pdf.lastIndexOf("startxref");
  if (positionStartxref < 0) throw new Error("PDF invalide : startxref absent");
  const precedentXref = parseInt(
    pdf
      .subarray(positionStartxref + 9, positionStartxref + 40)
      .toString("latin1"),
    10,
  );
  if (
    pdf.subarray(precedentXref, precedentXref + 4).toString("latin1") !== "xref"
  )
    throw new Error(
      "PDF non supporté : table xref classique requise (enregistrer sans object streams)",
    );
  const trailer = pdf
    .subarray(pdf.lastIndexOf("trailer", positionStartxref), positionStartxref)
    .toString("latin1");
  const taille = /\/Size\s+(\d+)/.exec(trailer);
  const racine = /\/Root\s+(\d+)\s+(\d+)\s+R/.exec(trailer);
  if (!taille || !racine) throw new Error("PDF invalide : trailer incomplet");
  return {
    precedentXref,
    taille: parseInt(taille[1], 10),
    racine,
    info: /\/Info\s+(\d+)\s+(\d+)\s+R/.exec(trailer),
    id: /\/ID\s*\[[^\]]*\]/.exec(trailer)?.[0] ?? null,
  };
}

/** Sérialisation de chaque objet non-flux, pour repérer ceux que l'on a modifiés. */
function instantane(document: PDFDocument): Map<number, string> {
  const resultat = new Map<number, string>();
  for (const [ref, objet] of document.context.enumerateIndirectObjects()) {
    if (objet instanceof PDFStream) continue;
    resultat.set(ref.objectNumber, octets(objet).toString("latin1"));
  }
  return resultat;
}

/**
 * Écrit à la suite de `precedent` les objets nouveaux ou modifiés de
 * `document`, une table xref et un trailer qui pointe vers la précédente.
 */
function ajouterRevision(
  precedent: Buffer,
  document: PDFDocument,
  avant: Map<number, string>,
  plusGrandNumeroAvant: number,
  fin: FinPdf,
): Buffer {
  const aEcrire = [...document.context.enumerateIndirectObjects()]
    .filter(([ref, objet]) => {
      const numero = ref.objectNumber;
      if (numero > plusGrandNumeroAvant) return true;
      return (
        avant.has(numero) &&
        !(objet instanceof PDFStream) &&
        octets(objet).toString("latin1") !== avant.get(numero)
      );
    })
    .sort((a, b) => a[0].objectNumber - b[0].objectNumber);

  const morceaux: Buffer[] = [];
  let longueur = precedent.length;
  const pousser = (donnees: Buffer | string) => {
    const tampon =
      typeof donnees === "string" ? Buffer.from(donnees, "latin1") : donnees;
    morceaux.push(tampon);
    longueur += tampon.length;
  };
  if (precedent[precedent.length - 1] !== 0x0a) pousser("\n");

  const decalages = new Map<number, number>();
  for (const [ref, objet] of aEcrire) {
    decalages.set(ref.objectNumber, longueur);
    pousser(`${ref.objectNumber} ${ref.generationNumber} obj\n`);
    pousser(octets(objet));
    pousser("\nendobj\n");
  }

  const numeros = [...decalages.keys()];
  const positionXref = longueur;
  let xref = "xref\n";
  for (let i = 0; i < numeros.length;) {
    let j = i;
    while (j + 1 < numeros.length && numeros[j + 1] === numeros[j] + 1) j++;
    xref += `${numeros[i]} ${j - i + 1}\n`;
    for (let k = i; k <= j; k++)
      xref += `${String(decalages.get(numeros[k])).padStart(10, "0")} 00000 n \n`;
    i = j + 1;
  }
  const taille = Math.max(fin.taille, document.context.largestObjectNumber + 1);
  xref += `trailer\n<< /Size ${taille} /Root ${fin.racine[1]} ${fin.racine[2]} R`;
  if (fin.info) xref += ` /Info ${fin.info[1]} ${fin.info[2]} R`;
  if (fin.id) xref += ` ${fin.id}`;
  xref += ` /Prev ${fin.precedentXref} >>\nstartxref\n${positionXref}\n%%EOF\n`;
  pousser(xref);

  return Buffer.concat([precedent, ...morceaux]);
}

/** Seule la première signature du circuit certifie le document. */
const etapeCertifiante = (etape: EtapeSignature) =>
  etape === ETAPES_SIGNATURE[0];

export interface ParametresSignature {
  etape: EtapeSignature;
  /** Nom du signataire, affiché dans le rectangle. */
  nom: string;
  /** Dossier de preuve, voir `construireDossierPreuve`. */
  lignesDossier: string[];
  date: Date;
}

/**
 * Remplit et signe le champ de l'étape, en ajout incrémental. Les octets de
 * `pdf` sont conservés à l'identique en tête du résultat.
 */
export async function signerChamp(
  pdf: Buffer,
  parametres: ParametresSignature,
): Promise<Buffer> {
  const { p12, motDePasse } = chargerCertificat();
  const fin = lireFin(pdf);
  const document = await PDFDocument.load(pdf, { updateMetadata: false });
  const avant = instantane(document);
  const plusGrandNumeroAvant = document.context.largestObjectNumber;

  const acroForm = document.catalog.lookup(PDFName.of("AcroForm"), PDFDict);
  const champs = acroForm.lookup(PDFName.of("Fields"), PDFArray);
  let widget: PDFDict | null = null;
  for (let i = 0; i < champs.size(); i++) {
    const champ = champs.lookup(i, PDFDict);
    const nom = champ.lookupMaybe(PDFName.of("T"), PDFString, PDFHexString);
    if (nom?.decodeText() === nomChamp(parametres.etape)) widget = champ;
  }
  if (!widget)
    throw new Error(`Champ de signature introuvable : ${parametres.etape}`);
  if (widget.has(PDFName.of("V")))
    throw new Error(`Champ de signature déjà signé : ${parametres.etape}`);

  const police = await document.embedFont(StandardFonts.Helvetica);
  const gras = await document.embedFont(StandardFonts.HelveticaBold);
  const titre = `${parametres.nom} (${LIBELLES_ETAPE[parametres.etape]})`;
  widget.set(
    PDFName.of("AP"),
    document.context.obj({
      N: creerApparence(document, police, gras, {
        titre,
        sousTitre: `Signé électroniquement le ${parametres.date.toISOString()}`,
        lignes: parametres.lignesDossier,
        couleurFond: [0.93, 0.96, 1],
      }),
    }),
  );

  const plageOctets = PDFArray.withContext(document.context);
  plageOctets.push(PDFNumber.of(0));
  for (let i = 0; i < 3; i++)
    plageOctets.push(PDFName.of(DEFAULT_BYTE_RANGE_PLACEHOLDER));
  // La première signature certifie le document (DocMDP, P=2) : seuls le
  // remplissage et la signature des champs existants restent autorisés ensuite.
  const certification = etapeCertifiante(parametres.etape);
  const signature = document.context.obj({
    Type: "Sig",
    Filter: "Adobe.PPKLite",
    SubFilter: SUBFILTER_ADOBE_PKCS7_DETACHED,
    ByteRange: plageOctets,
    Contents: PDFHexString.of(
      String.fromCharCode(0).repeat(LONGUEUR_SIGNATURE),
    ),
    Reason: PDFString.of("Signature de la note de frais"),
    M: PDFString.fromDate(parametres.date),
    Name: PDFString.of(textePourPolice(police, parametres.nom)),
    Location: PDFString.of("Scouticket"),
    ...(certification && {
      Reference: [
        {
          Type: "SigRef",
          TransformMethod: "DocMDP",
          TransformParams: { Type: "TransformParams", P: 2, V: "1.2" },
        },
      ],
    }),
  });
  // PDFInvalidObject : pdf-lib ne doit pas relire/réécrire ce dictionnaire.
  const refSignature = document.context.register(
    PDFInvalidObject.of(octets(signature)),
  );
  widget.set(PDFName.of("V"), refSignature);
  // Le champ signé est verrouillé : plus aucune modification de sa valeur.
  widget.set(
    PDFName.of("Lock"),
    document.context.obj({
      Type: "SigFieldLock",
      Action: "Include",
      Fields: [PDFString.of(nomChamp(parametres.etape))],
    }),
  );
  if (certification)
    document.catalog.set(
      PDFName.of("Perms"),
      document.context.obj({ DocMDP: refSignature }),
    );
  acroForm.set(
    PDFName.of("SigFlags"),
    PDFNumber.of(SIG_FLAGS.SIGNATURES_EXIST | SIG_FLAGS.APPEND_ONLY),
  );

  // pdf-lib n'enregistre les polices qu'à l'écriture : forcer maintenant.
  await document.flush();

  const avecEspaceReserve = ajouterRevision(
    pdf,
    document,
    avant,
    plusGrandNumeroAvant,
    fin,
  );
  return signpdf.sign(
    avecEspaceReserve,
    new P12Signer(p12, { passphrase: motDePasse }),
    parametres.date,
  );
}
