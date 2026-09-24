import { z } from "zod";

/** Paramètres activables du groupe, modifiables par les responsables. */
export interface ParametresGroupe {
  scanJustificatifsActif: boolean;
}

export const PARAMETRES_GROUPE_PAR_DEFAUT: ParametresGroupe = {
  scanJustificatifsActif: false,
};

/** Corps partiel d'une mise à jour : seuls les champs fournis sont modifiés. */
export const schemaMiseAJourParametresGroupe = z
  .object({
    scanJustificatifsActif: z.boolean().optional(),
  })
  .strict()
  .refine((corps) => Object.keys(corps).length > 0);
