import { assainirSegmentNomFichier } from "./attachments";

export type FormatAnneeComptable = "debut" | "fin" | "debut-fin";

export interface ParametresAnneeComptable {
  mois: number;
  jour: number;
  format: FormatAnneeComptable;
}

export const PARAMETRES_ANNEE_COMPTABLE_PAR_DEFAUT: ParametresAnneeComptable = {
  mois: 9,
  jour: 1,
  format: "debut-fin",
};

export const FORMATS_ANNEE_COMPTABLE: FormatAnneeComptable[] = [
  "debut",
  "fin",
  "debut-fin",
];

export const LONGUEUR_MAX_FORMAT = 120;
export const LONGUEUR_MAX_NOM_FICHIER = 150;

export const VARIABLES_NOMENCLATURE = [
  { nom: "YYYY", description: "Année du justificatif", exemple: "2026" },
  { nom: "MM", description: "Mois du justificatif", exemple: "03" },
  { nom: "DD", description: "Jour du justificatif", exemple: "05" },
  { nom: "Branche", description: "Unité", exemple: "Louveteaux" },
  { nom: "Type", description: "Type de dépense", exemple: "Carburants" },
  {
    nom: "ModePaiement",
    description: "Mode de paiement",
    exemple: "Carte bancaire",
  },
  { nom: "Montant", description: "Montant", exemple: "28.50" },
  {
    nom: "AnneeComptable",
    description: "Année comptable",
    exemple: "2025-2026",
  },
  { nom: "Numero", description: "Numéro dans l'envoi", exemple: "01" },
  {
    nom: "GlobalNumeroComptable",
    description: "Numéro dans l'année comptable",
    exemple: "013",
  },
  { nom: "GlobalNumero", description: "Numéro global", exemple: "042" },
] as const;

export type NomVariableNomenclature =
  (typeof VARIABLES_NOMENCLATURE)[number]["nom"];

const NOMS_VARIABLES = new Set<string>(
  VARIABLES_NOMENCLATURE.map((variable) => variable.nom),
);
const EXPRESSION_JETON = /\{([^{}]*)\}/g;
const EXTENSION_FINALE = /\.(pdf|jpe?g|png|webp|heic|heif|gif)$/i;
const CARACTERES_INTERDITS = /[\\/:*?"<>|]/;

export interface PartieFormat {
  type: "texte" | "variable";
  valeur: string;
}

/** Retire une éventuelle extension saisie : elle est toujours ajoutée à la génération. */
export function normaliserFormatNomenclature(format: string): string {
  return format.trim().replace(EXTENSION_FINALE, "").trim();
}

export function decouperFormat(format: string): PartieFormat[] {
  const parties: PartieFormat[] = [];
  let curseur = 0;
  for (const correspondance of format.matchAll(EXPRESSION_JETON)) {
    const debut = correspondance.index ?? 0;
    if (debut > curseur) {
      parties.push({ type: "texte", valeur: format.slice(curseur, debut) });
    }
    parties.push({ type: "variable", valeur: correspondance[1] });
    curseur = debut + correspondance[0].length;
  }
  if (curseur < format.length) {
    parties.push({ type: "texte", valeur: format.slice(curseur) });
  }
  return parties;
}

/** Renvoie un message d'erreur, ou `null` si le format est valide. */
export function validerFormatNomenclature(format: unknown): string | null {
  if (typeof format !== "string") return "Le format doit être du texte";
  const normalise = normaliserFormatNomenclature(format);
  if (normalise.length === 0) return "Le format ne peut pas être vide";
  if (normalise.length > LONGUEUR_MAX_FORMAT)
    return `Le format est trop long (maximum ${LONGUEUR_MAX_FORMAT} caractères)`;

  const parties = decouperFormat(normalise);
  let nombreVariables = 0;
  for (const partie of parties) {
    if (partie.type === "variable") {
      if (!NOMS_VARIABLES.has(partie.valeur))
        return `Variable inconnue : {${partie.valeur}}`;
      nombreVariables += 1;
    } else {
      if (/[{}]/.test(partie.valeur))
        return "Accolades non appariées dans le format";
      if (CARACTERES_INTERDITS.test(partie.valeur))
        return 'Caractères interdits dans un nom de fichier : \\ / : * ? " < > |';
    }
  }
  if (nombreVariables === 0)
    return "Le format doit contenir au moins une variable";
  return null;
}

export function validerParametresAnneeComptable(
  parametres: unknown,
): parametres is ParametresAnneeComptable {
  if (!parametres || typeof parametres !== "object") return false;
  const { mois, jour, format } = parametres as Record<string, unknown>;
  if (!Number.isInteger(mois) || !Number.isInteger(jour)) return false;
  if (!FORMATS_ANNEE_COMPTABLE.includes(format as FormatAnneeComptable))
    return false;
  const moisNombre = mois as number;
  const jourNombre = jour as number;
  if (moisNombre < 1 || moisNombre > 12 || jourNombre < 1) return false;
  // 28 jours pour février : le 29 février est refusé pour éviter des années
  // comptables ambiguës selon les années bissextiles.
  const joursParMois = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return jourNombre <= joursParMois[moisNombre - 1];
}

export function analyserDateIso(
  date: string,
): { annee: number; mois: number; jour: number } | null {
  const correspondance = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!correspondance) return null;
  const annee = Number(correspondance[1]);
  const mois = Number(correspondance[2]);
  const jour = Number(correspondance[3]);
  const controle = new Date(Date.UTC(annee, mois - 1, jour));
  if (
    controle.getUTCFullYear() !== annee ||
    controle.getUTCMonth() !== mois - 1 ||
    controle.getUTCDate() !== jour
  )
    return null;
  return { annee, mois, jour };
}

/** Année de début de l'année comptable qui contient la date. */
export function anneeComptableDebut(
  date: string,
  parametres: Pick<ParametresAnneeComptable, "mois" | "jour">,
): number {
  const analysee = analyserDateIso(date);
  if (!analysee) throw new Error("DATE_INVALIDE");
  const avantDebut =
    analysee.mois < parametres.mois ||
    (analysee.mois === parametres.mois && analysee.jour < parametres.jour);
  return avantDebut ? analysee.annee - 1 : analysee.annee;
}

export function libelleAnneeComptable(
  anneeDebut: number,
  parametres: ParametresAnneeComptable,
): string {
  const commenceEnJanvier = parametres.mois === 1 && parametres.jour === 1;
  if (commenceEnJanvier || parametres.format === "debut")
    return String(anneeDebut);
  if (parametres.format === "fin") return String(anneeDebut + 1);
  return `${anneeDebut}-${anneeDebut + 1}`;
}

export function variablesUtilisees(format: string): Set<string> {
  return new Set(
    decouperFormat(normaliserFormatNomenclature(format))
      .filter((partie) => partie.type === "variable")
      .map((partie) => partie.valeur),
  );
}

export interface ReservationNumeros {
  global: number;
  comptable: { annee: number; nombre: number } | null;
}

/** Nombre de numéros à réserver côté serveur pour un envoi de `nombrePieces`. */
export function calculerReservation(
  format: string,
  date: string,
  nombrePieces: number,
  parametres: ParametresAnneeComptable,
): ReservationNumeros {
  const utilisees = variablesUtilisees(format);
  return {
    global: utilisees.has("GlobalNumero") ? nombrePieces : 0,
    comptable: utilisees.has("GlobalNumeroComptable")
      ? { annee: anneeComptableDebut(date, parametres), nombre: nombrePieces }
      : null,
  };
}

export interface DepenseNomenclature {
  typeDepense: string;
  modePaiement: string;
  montant: number;
}

export interface ParametresGenerationNoms {
  format: string;
  parametresAnnee: ParametresAnneeComptable;
  date: string;
  branche: string;
  depenses: DepenseNomenclature[];
  extensions: string[];
  /** Premier numéro attribué (dernier + 1) ; ignoré si la variable est absente du format. */
  premierGlobal?: number;
  premierComptable?: number;
  /** Aperçu : les numéros globaux, attribués à l'envoi, sont remplacés par « ### ». */
  apercu?: boolean;
}

function remplirNumero(numero: number, largeur: number): string {
  return String(numero).padStart(largeur, "0");
}

function limiterLongueur(nom: string, extension: string): string {
  const suffixe = `.${extension}`;
  const longueurBase = LONGUEUR_MAX_NOM_FICHIER - suffixe.length;
  return `${nom.slice(0, Math.max(longueurBase, 1)).trim()}${suffixe}`;
}

function remplacerVariables(
  format: string,
  valeurs: Record<string, string>,
): string {
  const resultat: PartieFormat[] = [];
  let sauterProchainTexte = false;
  for (const partie of decouperFormat(format)) {
    if (partie.type === "texte") {
      if (sauterProchainTexte) sauterProchainTexte = false;
      else resultat.push(partie);
      continue;
    }
    const valeur = assainirSegmentNomFichier(valeurs[partie.valeur] ?? "");
    if (valeur) {
      sauterProchainTexte = false;
      resultat.push({ type: "variable", valeur });
    } else if (resultat[resultat.length - 1]?.type === "texte") {
      // Variable vide : on retire un séparateur adjacent (le précédent, à
      // défaut le suivant) pour éviter des « -  - » orphelins.
      resultat.pop();
    } else {
      sauterProchainTexte = true;
    }
  }
  return assainirSegmentNomFichier(
    resultat.map((partie) => partie.valeur).join(""),
  );
}

/** Génère le nom de chaque pièce jointe (extension comprise). */
export function genererNomsNomenclature(
  parametres: ParametresGenerationNoms,
): string[] {
  const format = normaliserFormatNomenclature(parametres.format);
  const analysee = analyserDateIso(parametres.date);
  if (!analysee) throw new Error("DATE_INVALIDE");
  const anneeDebut = anneeComptableDebut(
    parametres.date,
    parametres.parametresAnnee,
  );

  const noms = parametres.depenses.map((depense, index) => {
    const valeurs: Record<string, string> = {
      YYYY: String(analysee.annee),
      MM: remplirNumero(analysee.mois, 2),
      DD: remplirNumero(analysee.jour, 2),
      Branche: parametres.branche,
      Type: depense.typeDepense,
      ModePaiement: depense.modePaiement,
      Montant: depense.montant.toFixed(2),
      AnneeComptable: libelleAnneeComptable(
        anneeDebut,
        parametres.parametresAnnee,
      ),
      Numero: remplirNumero(index + 1, 2),
      GlobalNumeroComptable: parametres.apercu
        ? "###"
        : parametres.premierComptable === undefined
          ? ""
          : remplirNumero(parametres.premierComptable + index, 3),
      GlobalNumero: parametres.apercu
        ? "###"
        : parametres.premierGlobal === undefined
          ? ""
          : remplirNumero(parametres.premierGlobal + index, 3),
    };
    return remplacerVariables(format, valeurs);
  });

  // Deux pièces ne doivent jamais porter le même nom dans l'e-mail.
  const doublons = new Set(noms).size !== noms.length;
  return noms.map((nom, index) => {
    const base =
      doublons && noms.length > 1
        ? `${nom} - ${remplirNumero(index + 1, 2)}`
        : nom;
    return limiterLongueur(base, parametres.extensions[index] ?? "bin");
  });
}

/** Ajoute ` - 01`, ` - 02`… avant l'extension quand plusieurs noms sont identiques. */
export function dedoublonnerNomsFichiers(noms: string[]): string[] {
  if (new Set(noms).size === noms.length) return noms;
  return noms.map((nom, index) => {
    const suffixe = ` - ${remplirNumero(index + 1, 2)}`;
    const point = nom.lastIndexOf(".");
    return point <= 0
      ? `${nom}${suffixe}`
      : `${nom.slice(0, point)}${suffixe}${nom.slice(point)}`;
  });
}
