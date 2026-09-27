import { z } from "zod";
import { MOYENS_PAIEMENT_PAR_DEFAUT } from "@/constants/configDepenses";

/** Paramètres activables du groupe, modifiables par les responsables. */
export interface ParametresGroupe {
  scanJustificatifsActif: boolean;
  convertirJustificatifsEnPdf: boolean;
  moyensPaiement: string[];
}

export const PARAMETRES_GROUPE_PAR_DEFAUT: ParametresGroupe = {
  scanJustificatifsActif: false,
  convertirJustificatifsEnPdf: false,
  moyensPaiement: [...MOYENS_PAIEMENT_PAR_DEFAUT],
};

const NOMBRE_MAX_MOYENS_PAIEMENT = 20;

function normaliserMoyenPaiement(moyen: string): string {
  return moyen.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Tableau de moyens de paiement du groupe : non vides, sans doublon (accents/casse ignorés). */
const schemaMoyensPaiement = z
  .array(z.string().trim().min(1).max(50))
  .min(1)
  .max(NOMBRE_MAX_MOYENS_PAIEMENT)
  .refine((moyens) => {
    const normalises = moyens.map(normaliserMoyenPaiement);
    return new Set(normalises).size === normalises.length;
  }, "Moyens de paiement en doublon");

/** Corps partiel d'une mise à jour : seuls les champs fournis sont modifiés. */
export const schemaMiseAJourParametresGroupe = z
  .object({
    scanJustificatifsActif: z.boolean().optional(),
    convertirJustificatifsEnPdf: z.boolean().optional(),
    moyensPaiement: schemaMoyensPaiement.optional(),
  })
  .strict()
  .refine((corps) => Object.keys(corps).length > 0);
