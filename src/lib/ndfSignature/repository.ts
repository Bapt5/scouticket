import { pool } from "@/lib/baseDeDonnees";
import type {
  DetailDepense,
  DonneesKilometrage,
} from "@/constants/piecesJointes";
import type { EtapeSignature } from "@/lib/ndfSignature/circuit";

export type StatutNoteDeFraisSignee =
  "en_attente_beneficiaire" | "en_attente_responsable" | "en_attente_tresorier";

/** Données nécessaires pour reconstruire l'e-mail final au(x) trésorier(s). */
export interface DonneesNdfPourEnvoi {
  emailUtilisateur: string;
  date: string;
  branche: string;
  couleur?: string;
  groupe: string;
  montant: number;
  detailsDepenses: DetailDepense[];
  kilometrage?: DonneesKilometrage;
  emailsTresoriers: string[];
  rib?: {
    nomAffiche: string;
    typeMime: string;
    donneesBase64: string;
    nomFichierOriginal: string;
    nomFichierNormalise: string;
  };
}

export interface NoteDeFraisSignee {
  id: string;
  organizationId: string;
  beneficiaireUserId: string;
  responsableSignataireUserId: string;
  tresorierSignataireUserId: string;
  statut: StatutNoteDeFraisSignee;
  donneesNdf: DonneesNdfPourEnvoi;
  documentHash: string;
}

export async function creerDepot(params: {
  organizationId: string;
  beneficiaireUserId: string;
  responsableSignataireUserId: string;
  tresorierSignataireUserId: string;
  donneesNdf: DonneesNdfPourEnvoi;
  documentHash: string;
  pdf: Buffer;
}): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO scouticket_notes_de_frais_signees
       (id, organization_id, beneficiaire_user_id,
        responsable_signataire_user_id, tresorier_signataire_user_id,
        statut, donnees_ndf, document_hash, pdf_document)
     VALUES ($1, $2, $3, $4, $5, 'en_attente_beneficiaire', $6, $7, $8)`,
    [
      id,
      params.organizationId,
      params.beneficiaireUserId,
      params.responsableSignataireUserId,
      params.tresorierSignataireUserId,
      JSON.stringify(params.donneesNdf),
      params.documentHash,
      params.pdf,
    ],
  );
  return id;
}

function versNoteDeFrais(ligne: {
  id: string;
  organization_id: string;
  beneficiaire_user_id: string;
  responsable_signataire_user_id: string;
  tresorier_signataire_user_id: string;
  statut: StatutNoteDeFraisSignee;
  donnees_ndf: DonneesNdfPourEnvoi;
  document_hash: string;
}): NoteDeFraisSignee {
  return {
    id: ligne.id,
    organizationId: ligne.organization_id,
    beneficiaireUserId: ligne.beneficiaire_user_id,
    responsableSignataireUserId: ligne.responsable_signataire_user_id,
    tresorierSignataireUserId: ligne.tresorier_signataire_user_id,
    statut: ligne.statut,
    donneesNdf: ligne.donnees_ndf,
    documentHash: ligne.document_hash,
  };
}

export async function recupererNoteDeFrais(
  id: string,
): Promise<NoteDeFraisSignee | null> {
  const resultat = await pool.query(
    `SELECT id, organization_id, beneficiaire_user_id,
            responsable_signataire_user_id, tresorier_signataire_user_id,
            statut, donnees_ndf, document_hash
       FROM scouticket_notes_de_frais_signees
      WHERE id = $1`,
    [id],
  );
  const ligne = resultat.rows[0];
  return ligne ? versNoteDeFrais(ligne) : null;
}

export async function recupererPdf(id: string): Promise<Buffer | null> {
  const resultat = await pool.query<{ pdf_document: Buffer | null }>(
    `SELECT pdf_document FROM scouticket_notes_de_frais_signees WHERE id = $1`,
    [id],
  );
  return resultat.rows[0]?.pdf_document ?? null;
}

/**
 * Enregistre le PDF signé de l'étape et fait avancer le statut, en une seule
 * requête conditionnée au statut attendu : si une autre requête a déjà
 * traité cette étape, rien n'est écrit et la fonction renvoie `false`.
 */
export async function enregistrerPdfSigne(
  id: string,
  pdf: Buffer,
  statutAttendu: StatutNoteDeFraisSignee,
  nouveauStatut: StatutNoteDeFraisSignee,
): Promise<boolean> {
  const resultat = await pool.query(
    `UPDATE scouticket_notes_de_frais_signees
        SET pdf_document = $2, statut = $4
      WHERE id = $1 AND statut = $3`,
    [id, pdf, statutAttendu, nouveauStatut],
  );
  return (resultat.rowCount ?? 0) > 0;
}

/**
 * Fin de circuit (validée ou refusée) : supprime la note, avec son PDF et ses
 * codes de vérification (cascade). Rien n'est conservé en base : la preuve
 * des signatures est portée par le PDF signé envoyé par e-mail.
 */
export async function cloturerCircuit(id: string) {
  await pool.query(
    `DELETE FROM scouticket_notes_de_frais_signees WHERE id = $1`,
    [id],
  );
}

// --- Codes de vérification (OTP) ---

export async function creerCodeVerification(params: {
  noteDeFraisId: string;
  etape: EtapeSignature;
  userId: string;
  codeHash: string;
  expireLe: Date;
}): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO scouticket_ndf_codes_verification
       (id, note_de_frais_id, etape, user_id, code_hash, expire_le)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      params.noteDeFraisId,
      params.etape,
      params.userId,
      params.codeHash,
      params.expireLe,
    ],
  );
  return id;
}

export interface CodeVerificationActif {
  id: string;
  codeHash: string;
  expireLe: Date;
  utilise: boolean;
  tentatives: number;
  creeLe: Date;
}

/** Le code le plus récent pour cette étape/ce signataire (un seul valide à la fois en pratique). */
export async function recupererDernierCode(
  noteDeFraisId: string,
  etape: EtapeSignature,
  userId: string,
): Promise<CodeVerificationActif | null> {
  const resultat = await pool.query<{
    id: string;
    code_hash: string;
    expire_le: Date;
    utilise: boolean;
    tentatives: number;
    cree_le: Date;
  }>(
    `SELECT id, code_hash, expire_le, utilise, tentatives, cree_le
       FROM scouticket_ndf_codes_verification
      WHERE note_de_frais_id = $1 AND etape = $2 AND user_id = $3
      ORDER BY cree_le DESC LIMIT 1`,
    [noteDeFraisId, etape, userId],
  );
  const ligne = resultat.rows[0];
  if (!ligne) return null;
  return {
    id: ligne.id,
    codeHash: ligne.code_hash,
    expireLe: ligne.expire_le,
    utilise: ligne.utilise,
    tentatives: ligne.tentatives,
    creeLe: ligne.cree_le,
  };
}

export async function incrementerTentativeCode(id: string) {
  await pool.query(
    `UPDATE scouticket_ndf_codes_verification SET tentatives = tentatives + 1 WHERE id = $1`,
    [id],
  );
}

export async function recupererUtilisateur(
  userId: string,
): Promise<{ nom: string; email: string } | null> {
  const resultat = await pool.query<{ name: string; email: string }>(
    `SELECT name, email FROM "user" WHERE id = $1`,
    [userId],
  );
  const ligne = resultat.rows[0];
  return ligne ? { nom: ligne.name, email: ligne.email } : null;
}

/** Marque le code comme utilisé. Renvoie `false` s'il l'était déjà (requête concurrente). */
export async function marquerCodeUtilise(id: string): Promise<boolean> {
  const resultat = await pool.query(
    `UPDATE scouticket_ndf_codes_verification SET utilise = TRUE
      WHERE id = $1 AND utilise = FALSE`,
    [id],
  );
  return (resultat.rowCount ?? 0) > 0;
}
