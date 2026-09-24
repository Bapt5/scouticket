import type { CornerPoints, Scanner } from "scanic";

type ModuleScanic = typeof import("scanic");

/**
 * Scanic est servi depuis notre origine (public/assets/scanic/<version>/, copié
 * par scripts/copier-assets-scanic.mjs) et non compilé par le bundler : son
 * module ML est chargé par un import() dynamique ignoré des bundlers
 * (webpackIgnore) qui ne fonctionne que si les fichiers restent côte à côte.
 */
export const URL_SCANIC = `/assets/scanic/${process.env.NEXT_PUBLIC_SCANIC_VERSION ?? "local"}/scanic.js`;

const chargeurParDefaut = (): Promise<ModuleScanic> =>
  import(/* webpackIgnore: true */ /* turbopackIgnore: true */ URL_SCANIC);

let chargeur: () => Promise<ModuleScanic> = chargeurParDefaut;

/** Charge le module Scanic (navigateur uniquement). */
export function chargerScanic(): Promise<ModuleScanic> {
  return chargeur();
}

/**
 * Dossier public (versionné) contenant les assets du détecteur ML, copiés par
 * scripts/copier-assets-scanic.mjs. La version est injectée par next.config.js.
 */
export const DOSSIER_ASSETS_ML = `/assets/scanic-ml/${process.env.NEXT_PUBLIC_SCANIC_ML_VERSION ?? "local"}/`;

const QUALITE_JPEG_SCAN = 0.85;
/** Au-delà, la détection classique est abandonnée : l'utilisateur ajuste les coins à la main. */
const DELAI_DETECTION_MS = 30_000;
/** Le modèle ML (~2 Mo) est abandonné au profit du détecteur classique si la connexion est trop lente. */
const DELAI_DETECTION_ML_MS = 10_000;

interface OptionsScan {
  readonly signal?: AbortSignal;
}

function verifierAnnulation(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Scan annulé", "AbortError");
}

export function estErreurAnnulation(erreur: unknown) {
  return erreur instanceof DOMException && erreur.name === "AbortError";
}

// Instance unique : le WebAssembly n'est initialisé qu'une fois puis réutilisé
// pour tous les justificatifs (usage répété au cœur de l'application).
let promesseScanner: Promise<Scanner> | null = null;

function obtenirScanner(): Promise<Scanner> {
  promesseScanner ??= (async () => {
    // Import dynamique : Scanic manipule le DOM et ne doit jamais s'exécuter côté serveur.
    const { Scanner } = await chargerScanic();
    const scanner = new Scanner();
    await scanner.initialize();
    return scanner;
  })().catch((erreur) => {
    promesseScanner = null;
    throw erreur;
  });
  return promesseScanner;
}

/** Charge Scanic en avance pour que le premier scan soit rapide (erreurs ignorées). */
export function prechaufferScanner() {
  obtenirScanner().catch(() => {});
}

/** Réinitialise l'instance partagée et le chargeur du module (tests uniquement). */
export function reinitialiserScannerPourTests(
  chargeurDeTest?: () => Promise<ModuleScanic>,
) {
  promesseScanner = null;
  chargeur = chargeurDeTest ?? chargeurParDefaut;
}

/** Charge un fichier image dans un élément <img> exploitable par Scanic. */
export function chargerImage(fichier: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("IMAGE_ELEMENT_LOAD_FAILED"));
    };
    image.src = url;
  });
}

/** Coins couvrant toute l'image, point de départ de l'ajustement manuel. */
export function coinsParDefaut(image: HTMLImageElement): CornerPoints {
  const largeur = image.naturalWidth || image.width;
  const hauteur = image.naturalHeight || image.height;
  return {
    topLeft: { x: 0, y: 0 },
    topRight: { x: largeur, y: 0 },
    bottomRight: { x: largeur, y: hauteur },
    bottomLeft: { x: 0, y: hauteur },
  };
}

async function detecter(
  image: HTMLImageElement,
  detecteur: "ml" | "classical",
  delaiMs: number,
  signal?: AbortSignal,
): Promise<CornerPoints | null> {
  verifierAnnulation(signal);
  const scanner = await obtenirScanner();
  verifierAnnulation(signal);
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<never>((_resolve, rejeter) => {
    minuteur = setTimeout(
      () => rejeter(new Error("SCAN_DETECTION_TIMEOUT")),
      delaiMs,
    );
  });
  const resultat = await Promise.race([
    scanner.scan(image, {
      mode: "detect",
      detector: detecteur,
      ...(detecteur === "ml"
        ? { ml: { assetBaseUrl: DOSSIER_ASSETS_ML } }
        : {}),
    }),
    delai,
  ]).finally(() => clearTimeout(minuteur));
  verifierAnnulation(signal);
  return resultat.success && resultat.corners ? resultat.corners : null;
}

/**
 * Détecte les bords du justificatif ; `null` si rien n'est détecté.
 * Le détecteur ML (plus fiable) est essayé en premier ; s'il échoue, ne trouve
 * rien ou est trop long à charger (connexion lente), on se replie sur le
 * détecteur classique, sans que l'utilisateur n'ait à s'en soucier.
 */
export async function detecterCoins(
  image: HTMLImageElement,
  { signal }: OptionsScan = {},
): Promise<CornerPoints | null> {
  try {
    const coins = await detecter(image, "ml", DELAI_DETECTION_ML_MS, signal);
    if (coins) return coins;
  } catch (erreur) {
    if (estErreurAnnulation(erreur)) throw erreur;
    console.warn(
      "Détection ML indisponible, repli sur la détection classique:",
      erreur,
    );
  }
  return detecter(image, "classical", DELAI_DETECTION_MS, signal);
}

function nomEnJpeg(nom: string) {
  const sansExtension = nom.replace(/\.[^./\\]+$/, "");
  return `${sansExtension || "justificatif"}.jpg`;
}

/** Redresse et recadre l'image selon les coins donnés, en JPEG. */
export async function extraireJustificatif(
  image: HTMLImageElement,
  coins: CornerPoints,
  nomFichier: string,
  { signal }: OptionsScan = {},
): Promise<File> {
  verifierAnnulation(signal);
  const { extractDocument } = await chargerScanic();
  const resultat = await extractDocument(image, coins, { output: "canvas" });
  verifierAnnulation(signal);
  if (!resultat.success || !(resultat.output instanceof HTMLCanvasElement))
    throw new Error("SCAN_EXTRACTION_FAILED");

  const canvas = resultat.output;
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITE_JPEG_SCAN),
  );
  if (!blob) throw new Error("BLOB_CONVERSION_FAILED");
  return new File([blob], nomEnJpeg(nomFichier), { type: "image/jpeg" });
}
