import { jsonError } from "@/lib/api/utils";
import {
  estResponsable,
  recupererGroupeActif,
  recupererRoleMembre,
  recupererUnitesAutoriseesMembre,
} from "@/lib/groupServer";
import { recupererContexteGroupe } from "@/lib/sessionServeur";

/**
 * Contexte d'accès à l'historique du groupe actif : exige un membre
 * connecté et l'option activée. `unitesAutorisees` vaut `null` pour un
 * responsable (aucune restriction).
 */
export async function recupererAccesHistorique() {
  const { identifiantUtilisateur, identifiantOrganisation } =
    await recupererContexteGroupe();
  if (!identifiantUtilisateur || !identifiantOrganisation)
    return { erreur: jsonError("Sélectionnez un groupe", 401) };
  const role = await recupererRoleMembre(
    identifiantUtilisateur,
    identifiantOrganisation,
  );
  if (!role) return { erreur: jsonError("Accès refusé", 403) };
  const groupe = await recupererGroupeActif(identifiantOrganisation);
  if (!groupe.parametres.historiqueActif)
    return { erreur: jsonError("L'historique n'est pas activé", 404) };
  const responsable = estResponsable(role);
  return {
    identifiantUtilisateur,
    identifiantOrganisation,
    groupe,
    responsable,
    unitesAutorisees: responsable
      ? null
      : await recupererUnitesAutoriseesMembre(
          identifiantUtilisateur,
          identifiantOrganisation,
        ),
  };
}

export type AccesHistorique = Extract<
  Awaited<ReturnType<typeof recupererAccesHistorique>>,
  { identifiantUtilisateur: string }
>;
