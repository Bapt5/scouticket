export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const MAX_ATTACHMENT_COUNT = 6;
export const MAX_ATTACHMENT_SIZE_BYTES = 8 * 1024 * 1024; // 8MB
export const MAX_TOTAL_ATTACHMENTS_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export const MAX_LIGNES_PAR_JUSTIFICATIF = 20;

export const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export interface PieceJointeDepense {
  nomAffiche: string;
  typeMime: string;
  donneesBase64: string;
  nomFichierOriginal: string;
  nomFichierNormalise: string;
}

export interface LigneDepense {
  categorie: string;
  montant: number;
}

export const TYPES_ENVOI = ["note-de-frais", "depense-groupe"] as const;
export type TypeEnvoi = (typeof TYPES_ENVOI)[number];

export const LIBELLES_TYPES_ENVOI: Record<TypeEnvoi, string> = {
  "note-de-frais": "Note de frais",
  "depense-groupe": "Dépense avec moyen de paiement du groupe",
};

// Une dépense avec moyen de paiement du groupe = un seul justificatif.
export const nombreMaxJustificatifs = (typeEnvoi: TypeEnvoi) =>
  typeEnvoi === "depense-groupe" ? 1 : MAX_ATTACHMENT_COUNT;

// Dépenses d'un justificatif : date, lignes (catégorie comptable + montant),
// description ; note de frais : activité liée ; dépense du groupe : moyen de
// paiement du groupe (vide pour une note de frais).
export interface DetailDepense {
  date: string;
  modePaiement: string;
  activite: string;
  description: string;
  lignes: LigneDepense[];
}
