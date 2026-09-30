import sharp from "sharp";
import { pool } from "@/lib/baseDeDonnees";

/** Poids maximal du fichier envoyé. */
export const TAILLE_MAX_LOGO_OCTETS = 1024 * 1024;
/** Poids maximal du logo normalisé (PNG) stocké en base. */
export const TAILLE_MAX_LOGO_STOCKE_OCTETS = 500 * 1024;
export const LARGEUR_MIN_LOGO = 100;
export const HAUTEUR_MIN_LOGO = 30;
export const DIMENSION_MAX_LOGO = 2000;
/** Largeur maximale du logo stocké (px), suffisante pour l'impression A4. */
export const LARGEUR_STOCKEE_LOGO = 600;
const FORMATS_ACCEPTES = new Set(["png", "jpeg", "webp"]);

export class ErreurLogo extends Error {}

/**
 * Valide le logo (format réel détecté par sharp, taille, dimensions) et le
 * normalise en PNG borné. Le SVG est refusé volontairement.
 */
export async function normaliserLogo(entree: Buffer): Promise<Buffer> {
  if (entree.length === 0) throw new ErreurLogo("Fichier vide");
  if (entree.length > TAILLE_MAX_LOGO_OCTETS)
    throw new ErreurLogo("Fichier trop volumineux (1 Mo maximum)");

  let metadonnees: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadonnees = await sharp(entree).metadata();
  } catch {
    throw new ErreurLogo("Image illisible ou corrompue");
  }
  if (!metadonnees.format || !FORMATS_ACCEPTES.has(metadonnees.format))
    throw new ErreurLogo("Format non supporté (PNG, JPEG ou WebP)");

  const { width, height } = metadonnees;
  if (!width || !height) throw new ErreurLogo("Image illisible ou corrompue");
  if (width < LARGEUR_MIN_LOGO || height < HAUTEUR_MIN_LOGO)
    throw new ErreurLogo(
      `Image trop petite (${LARGEUR_MIN_LOGO}x${HAUTEUR_MIN_LOGO} px minimum)`,
    );
  if (width > DIMENSION_MAX_LOGO || height > DIMENSION_MAX_LOGO)
    throw new ErreurLogo(
      `Image trop grande (${DIMENSION_MAX_LOGO}x${DIMENSION_MAX_LOGO} px maximum)`,
    );

  const sortie = await sharp(entree)
    .rotate()
    .resize({
      width: LARGEUR_STOCKEE_LOGO,
      height: LARGEUR_STOCKEE_LOGO,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
  if (sortie.length > TAILLE_MAX_LOGO_STOCKE_OCTETS)
    throw new ErreurLogo("Image trop lourde après optimisation");
  return sortie;
}

/**
 * Logo du groupe (PNG) s'il existe ET si les notes de frais signées sont
 * activées : le logo n'a de sens que pour ce mode.
 */
export async function recupererLogoGroupe(
  identifiantOrganisation: string,
): Promise<Buffer | null> {
  const resultat = await pool.query<{ ndf_logo: Buffer | null }>(
    `SELECT ndf_logo FROM scouticket_group_data
      WHERE organization_id = $1 AND ndf_signee_actif = TRUE`,
    [identifiantOrganisation],
  );
  return resultat.rows[0]?.ndf_logo ?? null;
}

export async function recupererLogoGroupeEnDataUri(
  identifiantOrganisation: string,
): Promise<string | undefined> {
  const logo = await recupererLogoGroupe(identifiantOrganisation);
  return logo ? `data:image/png;base64,${logo.toString("base64")}` : undefined;
}

export async function enregistrerLogoGroupe(
  identifiantOrganisation: string,
  logo: Buffer,
): Promise<void> {
  await pool.query(
    `UPDATE scouticket_group_data
        SET ndf_logo = $2, ndf_logo_type = 'image/png'
      WHERE organization_id = $1`,
    [identifiantOrganisation, logo],
  );
}

export async function supprimerLogoGroupe(
  identifiantOrganisation: string,
): Promise<void> {
  await pool.query(
    `UPDATE scouticket_group_data
        SET ndf_logo = NULL, ndf_logo_type = NULL
      WHERE organization_id = $1`,
    [identifiantOrganisation],
  );
}
