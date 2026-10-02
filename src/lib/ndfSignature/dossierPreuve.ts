import type { EtapeSignature } from "@/lib/ndfSignature/circuit";

export const LIBELLES_ETAPE: Record<EtapeSignature, string> = {
  beneficiaire: "Bénéficiaire",
  responsable: "Approbateur",
  tresorier: "Trésorier",
};

export interface DonneesDossierPreuve {
  noteDeFraisId: string;
  etape: EtapeSignature;
  userId: string;
  nom: string;
  email: string;
  adresseIp: string | null;
  userAgent: string | null;
  codeEnvoyeLe: Date;
  codeVerifieLe: Date;
  /** Nombre de saisies du code, la saisie réussie comprise. */
  nombreSaisiesCode: number;
  /** SHA-256 du document déposé (note de frais, justificatifs, pages de signature vides). */
  documentHash: string;
  dateVirement?: string | null;
}

/**
 * Lignes du dossier de preuve d'un signataire, écrites dans l'apparence de
 * son champ de signature : elles sont donc couvertes par sa signature
 * électronique et par celles qui suivent. Le code de vérification lui-même
 * n'y figure jamais.
 */
export function construireDossierPreuve(d: DonneesDossierPreuve): string[] {
  return [
    `Note de frais : ${d.noteDeFraisId}`,
    `Étape : ${LIBELLES_ETAPE[d.etape]}`,
    `Signataire : ${d.nom} <${d.email}>`,
    `Identifiant utilisateur : ${d.userId}`,
    `Adresse IP : ${d.adresseIp ?? "non disponible"}`,
    `User-Agent : ${d.userAgent ?? "non disponible"}`,
    `Code à usage unique envoyé par e-mail à ${d.email} le ${d.codeEnvoyeLe.toISOString()}`,
    `Code saisi et vérifié le ${d.codeVerifieLe.toISOString()} (saisie n° ${d.nombreSaisiesCode})`,
    ...(d.dateVirement ? [`Date du virement : ${d.dateVirement}`] : []),
    `Empreinte SHA-256 du document déposé : ${d.documentHash}`,
    "Cette signature atteste l'accès du signataire à sa messagerie électronique.",
  ];
}
