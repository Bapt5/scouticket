import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import {
  estResponsable,
  recupererGroupeActif,
  recupererRoleMembre,
} from "@/lib/groupServer";
import { schemaMiseAJourParametresGroupe } from "@/lib/parametresGroupe";
import { initialiserPostesParDefaut } from "@/lib/budgetServer";
import { recupererContexteGroupe } from "@/lib/sessionServeur";
import { pool } from "@/lib/baseDeDonnees";
import { verifierOrigineRequete } from "@/lib/api/securiteRequetes";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { journal } from "@/lib/logger";

/** Paramètres du groupe actif, lisibles par tous les membres. */
export async function GET(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const { identifiantOrganisation, identifiantUtilisateur } =
      await recupererContexteGroupe();
    if (!identifiantOrganisation || !identifiantUtilisateur)
      return NextResponse.json(
        { error: "Sélectionnez un groupe" },
        { status: 401 },
      );
    const groupe = await recupererGroupeActif(identifiantOrganisation);
    return NextResponse.json({ parametres: groupe.parametres });
  });
}

/** Met à jour (partiellement) les paramètres du groupe : responsables uniquement. */
export async function PATCH(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const { identifiantOrganisation, identifiantUtilisateur } =
      await recupererContexteGroupe();
    const role =
      identifiantOrganisation && identifiantUtilisateur
        ? await recupererRoleMembre(
            identifiantUtilisateur,
            identifiantOrganisation,
          )
        : null;
    if (!identifiantOrganisation || !estResponsable(role))
      return NextResponse.json(
        { error: "Accès réservé aux responsables du groupe" },
        { status: 403 },
      );

    const erreurOrigine = verifierOrigineRequete(requete);
    if (erreurOrigine) return erreurOrigine;

    const corps = schemaMiseAJourParametresGroupe.safeParse(
      await requete.json().catch(() => null),
    );
    if (!corps.success)
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });

    const actuels = (await recupererGroupeActif(identifiantOrganisation))
      .parametres;
    const {
      confirmationSuppressionHistorique,
      confirmationSuppressionBudget,
      ...modifications
    } = corps.data;
    const parametres = { ...actuels, ...modifications };
    // Désactiver l'historique supprime toutes ses entrées : confirmation explicite exigée.
    const desactivationHistorique =
      actuels.historiqueActif && modifications.historiqueActif === false;
    if (desactivationHistorique && confirmationSuppressionHistorique !== true)
      return NextResponse.json(
        { error: "Confirmez la suppression de l'historique" },
        { status: 400 },
      );
    // Le suivi budgétaire s'appuie sur l'historique : l'un ne va pas sans l'autre.
    if (modifications.budgetActif === true && !parametres.historiqueActif)
      return NextResponse.json(
        { error: "Activez d'abord l'historique" },
        { status: 400 },
      );
    if (
      desactivationHistorique &&
      actuels.budgetActif &&
      parametres.budgetActif
    )
      return NextResponse.json(
        { error: "Désactivez d'abord le suivi budgétaire" },
        { status: 400 },
      );
    // Désactiver le suivi supprime postes, budgets et affectations : confirmation exigée.
    const desactivationBudget =
      actuels.budgetActif && modifications.budgetActif === false;
    if (desactivationBudget && confirmationSuppressionBudget !== true)
      return NextResponse.json(
        { error: "Confirmez la suppression du suivi budgétaire" },
        { status: 400 },
      );
    const activationBudget =
      !actuels.budgetActif && modifications.budgetActif === true;
    if (corps.data.kmActif && !parametres.ndfSigneeActif)
      return NextResponse.json(
        { error: "Activez d'abord les notes de frais signées" },
        { status: 400 },
      );
    if (!parametres.ndfSigneeActif) parametres.kmActif = false;
    if (corps.data.kmTaux !== undefined && corps.data.kmTaux !== actuels.kmTaux)
      parametres.kmTauxMajLe = new Date().toISOString().slice(0, 10);

    // La ligne du groupe peut ne pas exister encore : upsert.
    const enregistrer = (executeur: Pick<PoolClient, "query">) =>
      executeur.query(
        `INSERT INTO scouticket_group_data
         (organization_id, scan_justificatifs_actif, convertir_justificatifs_pdf, moyens_paiement, ndf_signee_actif,
          ndf_km_actif, ndf_km_taux, ndf_km_taux_maj, historique_actif, budget_actif,
          annee_comptable_debut_mois, annee_comptable_debut_jour)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (organization_id) DO UPDATE
         SET scan_justificatifs_actif = EXCLUDED.scan_justificatifs_actif,
             convertir_justificatifs_pdf = EXCLUDED.convertir_justificatifs_pdf,
             moyens_paiement = EXCLUDED.moyens_paiement,
             ndf_signee_actif = EXCLUDED.ndf_signee_actif,
             ndf_km_actif = EXCLUDED.ndf_km_actif,
             ndf_km_taux = EXCLUDED.ndf_km_taux,
             ndf_km_taux_maj = EXCLUDED.ndf_km_taux_maj,
             historique_actif = EXCLUDED.historique_actif,
             budget_actif = EXCLUDED.budget_actif,
             annee_comptable_debut_mois = EXCLUDED.annee_comptable_debut_mois,
             annee_comptable_debut_jour = EXCLUDED.annee_comptable_debut_jour`,
        [
          identifiantOrganisation,
          parametres.scanJustificatifsActif,
          parametres.convertirJustificatifsEnPdf,
          JSON.stringify(parametres.moyensPaiement),
          parametres.ndfSigneeActif,
          parametres.kmActif,
          parametres.kmTaux,
          parametres.kmTauxMajLe,
          parametres.historiqueActif,
          parametres.budgetActif,
          parametres.anneeComptableDebut.mois,
          parametres.anneeComptableDebut.jour,
        ],
      );

    if (desactivationHistorique || desactivationBudget || activationBudget) {
      // Paramètre et création/suppression des données associées sont indissociables.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await enregistrer(client);
        if (desactivationHistorique) {
          const suppression = await client.query(
            "DELETE FROM scouticket_historique WHERE organization_id = $1",
            [identifiantOrganisation],
          );
          journal.info("historique.desactive", {
            categorie: "historique",
            details: {
              identifiantOrganisation,
              identifiantUtilisateur,
              entreesSupprimees: suppression.rowCount ?? 0,
            },
          });
        }
        if (desactivationBudget) {
          await client.query(
            `UPDATE scouticket_historique
                SET poste_id = NULL, poste_label = NULL
              WHERE organization_id = $1`,
            [identifiantOrganisation],
          );
          // Les budgets partent en cascade avec les postes.
          const suppression = await client.query(
            "DELETE FROM scouticket_postes_budgetaires WHERE organization_id = $1",
            [identifiantOrganisation],
          );
          journal.info("budget.desactive", {
            categorie: "budget",
            details: {
              identifiantOrganisation,
              identifiantUtilisateur,
              postesSupprimes: suppression.rowCount ?? 0,
            },
          });
        }
        if (activationBudget) {
          await initialiserPostesParDefaut(client, identifiantOrganisation);
          journal.info("budget.active", {
            categorie: "budget",
            details: { identifiantOrganisation, identifiantUtilisateur },
          });
        }
        await client.query("COMMIT");
      } catch (erreur) {
        await client.query("ROLLBACK");
        throw erreur;
      } finally {
        client.release();
      }
    } else {
      await enregistrer(pool);
    }

    return NextResponse.json({ success: true, parametres });
  });
}
