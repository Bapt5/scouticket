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

    // La ligne du groupe peut ne pas exister encore : upsert.
    await pool.query(
      `INSERT INTO scouticket_group_data
         (organization_id, scan_justificatifs_actif)
       VALUES ($1, $2)
       ON CONFLICT (organization_id) DO UPDATE
         SET scan_justificatifs_actif = EXCLUDED.scan_justificatifs_actif`,
      [identifiantOrganisation, parametres.scanJustificatifsActif],
    );

    return NextResponse.json({ success: true, parametres });
  });
}
