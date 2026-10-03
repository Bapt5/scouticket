import { NextRequest, NextResponse } from "next/server";
import { envoyerEmailRecette, type DonneesEmailRecette } from "@/lib/email";
import { assainirSegmentNomFichier, devinerExtension } from "@/lib/attachments";
import {
  analyserDateIso,
  calculerReservation,
  genererNomsNomenclature,
  type ParametresAnneeComptable,
} from "@/lib/nomenclature";
import { versRecetteNomenclature } from "@/lib/recettes";
import { versEntreeRecette, type ContexteHistorique } from "@/lib/historique";
import { lienHistorique } from "@/lib/historiqueLien";
import {
  enregistrerHistorique,
  envoyerAvecHistorique,
} from "@/lib/historiqueServer";
import { convertirPiecesJointesEnPdf } from "@/lib/conversionJustificatifs";
import { pool } from "@/lib/baseDeDonnees";
import { jsonError, verifierErreurSmtp } from "@/lib/api/utils";
import { validerCorpsRequeteRecette } from "@/lib/api/validateBodyRecette";
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
 * Un numéro est réservé dès qu'un format est configuré, même sans pièce
 * jointe : la référence doit apparaître dans le corps de l'e-mail dans tous
 * les cas. Comme pour les dépenses, la réservation n'est validée qu'après
 * l'envoi réussi de l'e-mail. L'historique est écrit dans la même transaction,
 * avant l'envoi : un échec d'insertion annule la réservation et l'envoi.
 */
async function envoyerAvecNomenclature(
  donneesEmail: DonneesEmailRecette,
  identifiantOrganisation: string,
  format: string,
  anneeComptable: ParametresAnneeComptable,
  contexteHistorique: ContexteHistorique,
) {
  const recette = versRecetteNomenclature(donneesEmail.detailRecette);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reservation = calculerReservation(
      format,
      donneesEmail.date,
      1,
      anneeComptable,
    );
    const numeros =
      reservation.global > 0 || reservation.comptable
        ? await reserverNumeros(
            client,
            identifiantOrganisation,
            reservation,
            "recette",
          )
        : {};
    // Référence textuelle (sans extension), toujours affichée dans le corps
    // de l'e-mail.
    const [reference] = genererNomsNomenclature({
      format,
      parametresAnnee: anneeComptable,
      date: donneesEmail.date,
      branche: donneesEmail.branche,
      depenses: [recette],
      extensions: [null],
      ...numeros,
    });
    donneesEmail.detailRecette = { ...donneesEmail.detailRecette, reference };
    // Même référence, avec extension cette fois, utilisée comme nom de la
    // pièce jointe quand il y en a une.
    if (donneesEmail.piecesJointes.length > 0) {
      const [nomFichier] = genererNomsNomenclature({
        format,
        parametresAnnee: anneeComptable,
        date: donneesEmail.date,
        branche: donneesEmail.branche,
        depenses: [recette],
        extensions: [
          devinerExtension(
            donneesEmail.piecesJointes[0].typeMime,
            donneesEmail.piecesJointes[0].nomFichierOriginal,
          ),
        ],
        ...numeros,
      });
      donneesEmail.piecesJointes = [
        { ...donneesEmail.piecesJointes[0], nomFichierNormalise: nomFichier },
      ];
    }
    const identifiants = await enregistrerHistorique(
      client,
      identifiantOrganisation,
      contexteHistorique,
      [versEntreeRecette(donneesEmail.detailRecette)],
    );
    donneesEmail.lienHistorique = lienHistorique(identifiants);
    const resultat = await envoyerEmailRecette(donneesEmail);
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
      const { session, identifiantUtilisateur, identifiantOrganisation } =
        await recupererContexteGroupe();
      if (!session || !identifiantUtilisateur || !identifiantOrganisation)
        return jsonError("Sélectionnez un groupe", 401);

      const erreurOrigine = verifierOrigineRequete(req);
      if (erreurOrigine) return erreurOrigine;

      // Max 2 envois par 30 secondes
      const limiteCourte = verifierRateLimit(
        `envoi-email-recette:court:${identifiantUtilisateur}`,
        2,
        30 * 1000,
      );
      if (!limiteCourte.autorise) {
        return reponseRateLimit(limiteCourte.attenteSecondes);
      }

      // Max 5 envois par 10 minutes
      const limiteLongue = verifierRateLimit(
        `envoi-email-recette:long:${identifiantUtilisateur}`,
        5,
        10 * 60 * 1000,
      );
      if (!limiteLongue.autorise) {
        return reponseRateLimit(limiteLongue.attenteSecondes);
      }

      const userEmail = session.user.email;
      const envError = validateEnv();
      if (envError) return envError;

      const body = await req.json().catch(() => null);
      if (!body) return jsonError("Corps de requête invalide", 400);
      if (body.userEmail !== userEmail) return jsonError("Email invalide", 403);

      const group = await recupererGroupeActif(identifiantOrganisation);
      const { donneesEmail, error } = validerCorpsRequeteRecette(body);
      if (error || !donneesEmail) return error as NextResponse;
      if (group.emailsTresoriers.length === 0)
        return jsonError("Aucun trésorier n'est configuré pour ce groupe", 403);
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
      donneesEmail.emailsTresoriers = group.emailsTresoriers;

      if (group.parametres.convertirJustificatifsEnPdf)
        donneesEmail.piecesJointes = await convertirPiecesJointesEnPdf(
          donneesEmail.piecesJointes,
        );

      const contexteHistorique: ContexteHistorique = {
        auteurUserId: identifiantUtilisateur,
        uniteId: unit.id,
        uniteLabel: unit.label,
        uniteCouleur: unit.color,
      };
      const { format } = group.nomenclature.recette;
      let resultat;
      if (format) {
        if (!analyserDateIso(donneesEmail.date))
          return jsonError("Date invalide", 400);
        resultat = await envoyerAvecNomenclature(
          donneesEmail,
          identifiantOrganisation,
          format,
          group.nomenclature.anneeComptable,
          contexteHistorique,
        );
      } else {
        if (donneesEmail.piecesJointes.length > 0) {
          donneesEmail.piecesJointes = [
            {
              ...donneesEmail.piecesJointes[0],
              nomFichierNormalise: assainirSegmentNomFichier(
                donneesEmail.piecesJointes[0].nomFichierOriginal,
              ),
            },
          ];
        }
        resultat = await envoyerAvecHistorique(
          identifiantOrganisation,
          {
            contexte: contexteHistorique,
            entrees: [versEntreeRecette(donneesEmail.detailRecette)],
          },
          (lienDansEmail) =>
            envoyerEmailRecette({
              ...donneesEmail,
              lienHistorique: lienDansEmail,
            }),
        );
      }
      return NextResponse.json({
        success: true,
        message: "Email envoyé avec succès",
        messageId: resultat.messageId,
      });
    } catch (error) {
      journal.erreur("recette.envoi_echoue", {
        categorie: "recette",
        erreur: error,
      });
      if (error instanceof Error) {
        return verifierErreurSmtp(error);
      }
      return jsonError("Erreur interne du serveur", 500);
    }
  });
}
