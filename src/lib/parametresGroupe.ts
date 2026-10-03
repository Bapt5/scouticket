import { z } from "zod";
import { MOYENS_PAIEMENT_PAR_DEFAUT } from "@/constants/configDepenses";

/** Paramètres activables du groupe, modifiables par les responsables. */
export interface ParametresGroupe {
  scanJustificatifsActif: boolean;
  convertirJustificatifsEnPdf: boolean;
  moyensPaiement: string[];
  ndfSigneeActif: boolean;
  /** Saisie de kilomètres dans les notes de frais (nécessite `ndfSigneeActif`). */
  kmActif: boolean;
  /** Taux du kilomètre en euros. */
  kmTaux: number;
  /** Date (AAAA-MM-JJ) de dernière mise à jour du taux, fixée par le serveur. */
  kmTauxMajLe: string;
  /** Lecture seule : un logo personnalisé est enregistré (géré par /api/group/parametres/logo). */
  logoPersonnalise: boolean;
  /** Historique des dépenses, recettes et notes de frais conservé en base (sans justificatifs). */
  historiqueActif: boolean;
}

export const PARAMETRES_GROUPE_PAR_DEFAUT: ParametresGroupe = {
  scanJustificatifsActif: false,
  convertirJustificatifsEnPdf: false,
  moyensPaiement: [...MOYENS_PAIEMENT_PAR_DEFAUT],
  ndfSigneeActif: false,
  kmActif: false,
  kmTaux: 0.354,
  kmTauxMajLe: "2025-11-05",
  logoPersonnalise: false,
  historiqueActif: false,
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
    ndfSigneeActif: z.boolean().optional(),
    historiqueActif: z.boolean().optional(),
    /** Exigé pour désactiver l'historique : toutes ses entrées sont alors supprimées. */
    confirmationSuppressionHistorique: z.boolean().optional(),
    kmActif: z.boolean().optional(),
    kmTaux: z
      .number()
      .gt(0)
      .max(5)
      .refine((taux) => Math.round(taux * 10000) / 10000 === taux, {
        message: "4 décimales maximum",
      })
      .optional(),
  })
  .strict()
  .refine((corps) => Object.keys(corps).length > 0);
