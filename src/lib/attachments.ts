import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MIME_EXTENSION_MAP,
} from "@/constants/piecesJointes";

export function estTypeMimePieceJointeAutorise(typeMime: string): boolean {
  return ALLOWED_ATTACHMENT_MIME_TYPES.includes(
    typeMime as (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number],
  );
}

export function assainirSegmentNomFichier(valeur: string): string {
  return valeur
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function devinerExtension(
  typeMime: string,
  nomFichier?: string,
): string {
  if (MIME_EXTENSION_MAP[typeMime]) {
    return MIME_EXTENSION_MAP[typeMime];
  }
  if (nomFichier && nomFichier.includes(".")) {
    const extensionDuNom = nomFichier.split(".").pop()?.toLowerCase();
    if (extensionDuNom && /^[a-z0-9]+$/.test(extensionDuNom)) {
      return extensionDuNom;
    }
  }
  return "bin";
}
