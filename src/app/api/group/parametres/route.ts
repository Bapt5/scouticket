import { NextResponse } from "next/server";
import {
  estResponsable,
  recupererGroupeActif,
  recupererRoleMembre,
} from "@/lib/groupServer";
import { schemaMiseAJourParametresGroupe } from "@/lib/parametresGroupe";
import { recupererContexteGroupe } from "@/lib/sessionServeur";
import { pool } from "@/lib/baseDeDonnees";
import { verifierOrigineRequete } from "@/lib/api/securiteRequetes";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";

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
    const parametres = { ...actuels, ...corps.data };
    if (corps.data.kmActif && !parametres.ndfSigneeActif)
      return NextResponse.json(
        { error: "Activez d'abord les notes de frais signées" },
        { status: 400 },
      );
    if (!parametres.ndfSigneeActif) parametres.kmActif = false;
    if (corps.data.kmTaux !== undefined && corps.data.kmTaux !== actuels.kmTaux)
      parametres.kmTauxMajLe = new Date().toISOString().slice(0, 10);

    // La ligne du groupe peut ne pas exister encore : upsert.
    await pool.query(
      `INSERT INTO scouticket_group_data
         (organization_id, scan_justificatifs_actif, convertir_justificatifs_pdf, moyens_paiement, ndf_signee_actif,
          ndf_km_actif, ndf_km_taux, ndf_km_taux_maj)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (organization_id) DO UPDATE
         SET scan_justificatifs_actif = EXCLUDED.scan_justificatifs_actif,
             convertir_justificatifs_pdf = EXCLUDED.convertir_justificatifs_pdf,
             moyens_paiement = EXCLUDED.moyens_paiement,
             ndf_signee_actif = EXCLUDED.ndf_signee_actif,
             ndf_km_actif = EXCLUDED.ndf_km_actif,
             ndf_km_taux = EXCLUDED.ndf_km_taux,
             ndf_km_taux_maj = EXCLUDED.ndf_km_taux_maj`,
      [
        identifiantOrganisation,
        parametres.scanJustificatifsActif,
        parametres.convertirJustificatifsEnPdf,
        JSON.stringify(parametres.moyensPaiement),
        parametres.ndfSigneeActif,
        parametres.kmActif,
        parametres.kmTaux,
        parametres.kmTauxMajLe,
      ],
    );

    return NextResponse.json({ success: true, parametres });
  });
}
