import { jsonError } from "@/lib/api/utils";
import {
  estResponsable,
  recupererGroupeActif,
  recupererRoleMembre,
} from "@/lib/groupServer";
import { recupererContexteGroupe } from "@/lib/sessionServeur";

/**
 * Contexte d'accès au suivi budgétaire du groupe actif : réservé aux
 * responsables (owner/admin), option activée (404 sinon).
 */
export async function recupererAccesBudget() {
  const { identifiantUtilisateur, identifiantOrganisation } =
    await recupererContexteGroupe();
  if (!identifiantUtilisateur || !identifiantOrganisation)
    return { erreur: jsonError("Sélectionnez un groupe", 401) };
  const role = await recupererRoleMembre(
    identifiantUtilisateur,
    identifiantOrganisation,
  );
  if (!estResponsable(role))
    return {
      erreur: jsonError("Accès réservé aux responsables du groupe", 403),
    };
  const groupe = await recupererGroupeActif(identifiantOrganisation);
  if (!groupe.parametres.budgetActif)
    return { erreur: jsonError("Le suivi budgétaire n'est pas activé", 404) };
  return { identifiantUtilisateur, identifiantOrganisation, groupe };
}

export type AccesBudget = Extract<
  Awaited<ReturnType<typeof recupererAccesBudget>>,
  { identifiantUtilisateur: string }
>;
