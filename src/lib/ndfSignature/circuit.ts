import {
  recupererOrdreSignatairesUserId,
  type SignatairePriorite,
} from "@/lib/groupServer";

/** Les 3 étapes du circuit de signature, dans l'ordre. */
export type EtapeSignature = "beneficiaire" | "responsable" | "tresorier";

export interface SignatairesResolus {
  responsable: SignatairePriorite;
  tresorier: SignatairePriorite;
}

/**
 * Résout, une fois pour toutes au dépôt d'une note de frais, qui signe à
 * l'étape "responsable" (visa) et à l'étape "trésorier" (traitement), en
 * appliquant la règle de remplacement en cas de conflit d'intérêt (le
 * bénéficiaire ne peut jamais signer sa propre note de frais) documentée
 * dans docs/technical/scan-justificatifs.md :
 *
 * - à défaut du 1er Responsable non bénéficiaire, le 2e Trésorier non
 *   bénéficiaire approuve (le 1er Trésorier disponible traite toujours le
 *   virement) ;
 * - à défaut de Trésorier non bénéficiaire, le 1er Responsable non
 *   bénéficiaire traite le virement ;
 * - si aucune solution n'existe, retourne `null` : l'appelant doit refuser
 *   le dépôt avec un message invitant à contacter un Trésorier ou un
 *   Responsable de groupe.
 */
export async function resoudreSignataires(
  identifiantOrganisation: string,
  beneficiaireUserId: string,
): Promise<SignatairesResolus | null> {
  const [responsables, tresoriers] = await Promise.all([
    recupererOrdreSignatairesUserId(identifiantOrganisation, "admin"),
    recupererOrdreSignatairesUserId(identifiantOrganisation, "owner"),
  ]);

  const responsablesDisponibles = responsables.filter(
    (membre) => membre.userId !== beneficiaireUserId,
  );
  const tresoriersDisponibles = tresoriers.filter(
    (membre) => membre.userId !== beneficiaireUserId,
  );

  // Traitement/virement : 1er Trésorier non bénéficiaire ; à défaut, le 1er
  // Responsable non bénéficiaire.
  const tresorierNormal = tresoriersDisponibles[0] ?? null;
  const tresorierSignataire = tresorierNormal ?? responsablesDisponibles[0];

  // Visa : 1er Responsable non bénéficiaire ; à défaut, le 2e Trésorier non
  // bénéficiaire (le 1er restant réservé au traitement du virement). Quand un
  // Responsable a dû prendre le traitement faute de Trésorier, le suivant de
  // la liste des Responsables approuve.
  const responsableSignataire = tresorierNormal
    ? (responsablesDisponibles[0] ?? tresoriersDisponibles[1])
    : responsablesDisponibles[1];

  if (!responsableSignataire || !tresorierSignataire) return null;

  // Le même utilisateur ne peut pas cumuler les deux étapes : cas limite où
  // un seul non-bénéficiaire existe au total dans les deux listes.
  if (responsableSignataire.userId === tresorierSignataire.userId) return null;

  return { responsable: responsableSignataire, tresorier: tresorierSignataire };
}
