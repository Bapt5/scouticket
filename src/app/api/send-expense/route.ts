import { NextRequest, NextResponse } from "next/server";
import { envoyerEmailDepense, type DonneesEmailDepense } from "@/lib/email";
import { assainirSegmentNomFichier, devinerExtension } from "@/lib/attachments";
import {
  analyserDateIso,
  calculerReservation,
  dedoublonnerNomsFichiers,
  genererNomsNomenclature,
  type ParametresAnneeComptable,
} from "@/lib/nomenclature";
import { versDepenseNomenclature } from "@/lib/depenses";
import { convertirPiecesJointesEnPdf } from "@/lib/conversionJustificatifs";
import { pool } from "@/lib/baseDeDonnees";
import { jsonError, verifierErreurSmtp } from "@/lib/api/utils";
import { validerCorpsRequete } from "@/lib/api/validateBody";
import {
  estResponsable,
  recupererGroupeActif,
  recupererRoleMembre,
  recupererUnitesAutoriseesMembre,
  reserverNumeros,
} from "@/lib/groupServer";
import {
  reponseRateLimit,
  verifierOrigineRequete,
  verifierRateLimit,
} from "@/lib/api/securiteRequetes";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { journal } from "@/lib/logger";
import { recupererContexteGroupe } from "@/lib/sessionServeur";

function validateEnv() {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASSWORD
  ) {
    journal.erreur("smtp.variables_environnement_manquantes", {
      categorie: "email",
      codeErreur: "VARIABLES_ENVIRONNEMENT_MANQUANTES",
    });
    return jsonError("Configuration serveur manquante", 500);
  }
  return null;
}

/**
 * Les numéros globaux sont réservés dans une transaction validée seulement
 * après l'envoi : un échec SMTP n'en consomme aucun.
 */
async function envoyerAvecNomenclature(
  donneesEmail: DonneesEmailDepense,
  identifiantOrganisation: string,
  format: string,
  anneeComptable: ParametresAnneeComptable,
) {
  const depenses = donneesEmail.detailsDepenses.map(versDepenseNomenclature);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reservation = calculerReservation(
      format,
      donneesEmail.date,
      donneesEmail.piecesJointes.length,
      anneeComptable,
    );
    const numeros =
      reservation.global > 0 || reservation.comptable
        ? await reserverNumeros(client, identifiantOrganisation, reservation)
        : {};
    const noms = genererNomsNomenclature({
      format,
      parametresAnnee: anneeComptable,
      date: donneesEmail.date,
      branche: donneesEmail.branche,
      depenses,
      extensions: donneesEmail.piecesJointes.map((piece) =>
        devinerExtension(piece.typeMime, piece.nomFichierOriginal),
      ),
      ...numeros,
    });
    donneesEmail.piecesJointes = donneesEmail.piecesJointes.map(
      (piece, index) => ({ ...piece, nomFichierNormalise: noms[index] }),
    );
    const resultat = await envoyerEmailDepense(donneesEmail);
    await client.query("COMMIT");
    return resultat;
  } catch (erreur) {
    await client.query("ROLLBACK");
    throw erreur;
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  return executerRouteAvecLogs(req, async () => {
    try {
      // Auth
      const { session, identifiantUtilisateur, identifiantOrganisation } =
        await recupererContexteGroupe();
      if (!session || !identifiantUtilisateur || !identifiantOrganisation)
        return jsonError("Sélectionnez un groupe", 401);

      const erreurOrigine = verifierOrigineRequete(req);
      if (erreurOrigine) return erreurOrigine;

      // Max 2 envois par 30 secondes
      const limiteCourte = verifierRateLimit(
        `envoi-email:court:${identifiantUtilisateur}`,
        2,
        30 * 1000,
      );
      if (!limiteCourte.autorise) {
        return reponseRateLimit(limiteCourte.attenteSecondes);
      }

      // Max 5 envois par 10 minutes
      const limiteLongue = verifierRateLimit(
        `envoi-email:long:${identifiantUtilisateur}`,
        5,
        10 * 60 * 1000,
      );
      if (!limiteLongue.autorise) {
        return reponseRateLimit(limiteLongue.attenteSecondes);
      }

      const userEmail = session.user.email;
      // Env vars
      const envError = validateEnv();
      if (envError) return envError;

      // Body & validation
      const body = await req.json().catch(() => null);
      if (!body) return jsonError("Corps de requête invalide", 400);
      if (body.userEmail !== userEmail) return jsonError("Email invalide", 403);

      const { donneesEmail, error } = validerCorpsRequete(body);
      if (error || !donneesEmail) return error as NextResponse;
      const group = await recupererGroupeActif(identifiantOrganisation);
      if (group.validation.status !== "verified" || !group.emailTresorerie)
        return jsonError(
          "La trésorerie doit confirmer son adresse avant les envois",
          403,
        );
      const unit = group.unites.find(
        (item) => item.id === donneesEmail.branche,
      );
      if (!unit) return jsonError("Unité invalide pour ce groupe", 400);
      const role = await recupererRoleMembre(
        identifiantUtilisateur,
        identifiantOrganisation,
      );
      if (!estResponsable(role)) {
        const unitesAutorisees = await recupererUnitesAutoriseesMembre(
          identifiantUtilisateur,
          identifiantOrganisation,
        );
        if (!unitesAutorisees.has(unit.id))
          return jsonError("Vous n'avez pas accès à cette unité", 403);
      }
      donneesEmail.branche = unit.label;
      donneesEmail.groupe = group.organisation.name;
      donneesEmail.couleur = unit.color;
      donneesEmail.emailTresorerie = group.emailTresorerie;

      // Avant le nommage : les extensions doivent refléter le format converti.
      if (group.parametres.convertirJustificatifsEnPdf)
        donneesEmail.piecesJointes = await convertirPiecesJointesEnPdf(
          donneesEmail.piecesJointes,
        );

      // Le RIB n'est jamais converti ni renommé par la nomenclature :
      // « RIB - {nom du demandeur} ».
      if (donneesEmail.rib) {
        const nomDemandeur =
          session.user.name?.trim() || userEmail.split("@")[0];
        donneesEmail.rib = {
          ...donneesEmail.rib,
          nomFichierNormalise: `RIB - ${assainirSegmentNomFichier(nomDemandeur)}.${devinerExtension(donneesEmail.rib.typeMime, donneesEmail.rib.nomFichierOriginal)}`,
        };
      }

      const { format, anneeComptable } = group.nomenclature;
      let resultat;
      if (format) {
        if (!analyserDateIso(donneesEmail.date))
          return jsonError("Date invalide", 400);
        resultat = await envoyerAvecNomenclature(
          donneesEmail,
          identifiantOrganisation,
          format,
          anneeComptable,
        );
      } else {
        const noms = dedoublonnerNomsFichiers(
          donneesEmail.piecesJointes.map((piece) =>
            assainirSegmentNomFichier(piece.nomFichierOriginal),
          ),
        );
        donneesEmail.piecesJointes = donneesEmail.piecesJointes.map(
          (piece, index) => ({ ...piece, nomFichierNormalise: noms[index] }),
        );
        resultat = await envoyerEmailDepense(donneesEmail);
      }
      return NextResponse.json({
        success: true,
        message: "Email envoyé avec succès",
        messageId: resultat.messageId,
      });
    } catch (error) {
      journal.erreur("depense.envoi_echoue", {
        categorie: "depense",
        erreur: error,
      });
      if (error instanceof Error) {
        return verifierErreurSmtp(error);
      }
      return jsonError("Erreur interne du serveur", 500);
    }
  });
}
