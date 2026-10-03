import { NextRequest, NextResponse } from "next/server";
import { envoyerEmailDepense } from "@/lib/email";
import { assainirSegmentNomFichier, devinerExtension } from "@/lib/attachments";
import { analyserDateIso, dedoublonnerNomsFichiers } from "@/lib/nomenclature";
import { envoyerAvecNomenclature } from "@/lib/envoiNomenclature";
import { convertirPiecesJointesEnPdf } from "@/lib/conversionJustificatifs";
import { deposerNoteDeFraisSignee } from "@/lib/ndfSignature/depot";
import { typeHistoriqueDepense, versEntreesDepense } from "@/lib/historique";
import { envoyerAvecHistorique } from "@/lib/historiqueServer";
import { jsonError, verifierErreurSmtp } from "@/lib/api/utils";
import { validerCorpsRequete } from "@/lib/api/validateBody";
import {
  estResponsable,
  recupererGroupeActif,
  recupererRoleMembre,
  recupererUnitesAutoriseesMembre,
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

      const group = await recupererGroupeActif(identifiantOrganisation);
      const { donneesEmail, error } = validerCorpsRequete(
        body,
        group.parametres.moyensPaiement,
        group.parametres.kmActif
          ? {
              taux: group.parametres.kmTaux,
              tauxMajLe: group.parametres.kmTauxMajLe,
            }
          : undefined,
      );
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
      // Envoyer une dépense sans justificatif est réservé aux responsables :
      // ce n'est pas un simple confort, l'attestation qui l'accompagne
      // n'a de sens que pour eux (ex. virement interne à l'association).
      if (
        donneesEmail.sansJustificatifAttesteParResponsable &&
        !estResponsable(role)
      )
        return jsonError(
          "Seuls les responsables du groupe peuvent envoyer une dépense sans justificatif",
          403,
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

      // Note de frais signée : au lieu d'un envoi immédiat, on dépose le
      // document dans le circuit de signature à 3 niveaux (bénéficiaire ->
      // responsable -> trésorier). L'envoi réel au(x) trésorier(s) n'a lieu
      // qu'après la 3e signature (voir src/lib/ndfSignature/signer.ts).
      if (
        group.parametres.ndfSigneeActif &&
        donneesEmail.typeEnvoi === "note-de-frais"
      ) {
        const depot = await deposerNoteDeFraisSignee({
          identifiantOrganisation,
          beneficiaireUserId: identifiantUtilisateur,
          beneficiaireNom: session.user.name?.trim() || userEmail.split("@")[0],
          donneesEmail,
        });
        if (depot.statut === "aucun_signataire_disponible")
          return jsonError(
            "Aucun signataire disponible pour valider cette note de frais (conflit d'intérêt). Contactez un trésorier ou un responsable de groupe.",
            409,
          );
        return NextResponse.json({
          success: true,
          statut: "en_attente_signature",
          noteDeFraisId: depot.id,
          message:
            "Votre note de frais a été déposée et attend maintenant votre signature électronique.",
        });
      }

      const contexteHistorique = {
        auteurUserId: identifiantUtilisateur,
        uniteId: unit.id,
        uniteLabel: unit.label,
        uniteCouleur: unit.color,
      };
      const { anneeComptable, depense } = group.nomenclature;
      const { format } = depense;
      let resultat;
      if (format) {
        if (!analyserDateIso(donneesEmail.date))
          return jsonError("Date invalide", 400);
        resultat = await envoyerAvecNomenclature(
          donneesEmail,
          identifiantOrganisation,
          format,
          anneeComptable,
          { contexte: contexteHistorique },
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
        resultat = await envoyerAvecHistorique(
          identifiantOrganisation,
          {
            contexte: contexteHistorique,
            entrees: versEntreesDepense(
              donneesEmail.detailsDepenses,
              typeHistoriqueDepense(donneesEmail.typeEnvoi),
            ),
          },
          (lienDansEmail) =>
            envoyerEmailDepense({
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
