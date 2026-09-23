import { NextResponse } from "next/server";
import { z } from "zod";
import {
  estResponsable,
  recupererGroupeActif,
  recupererRoleMembre,
} from "@/lib/groupServer";
import {
  anneeComptableDebut,
  normaliserFormatNomenclature,
  validerFormatNomenclature,
  validerParametresAnneeComptable,
} from "@/lib/nomenclature";
import { recupererContexteGroupe } from "@/lib/sessionServeur";
import { pool } from "@/lib/baseDeDonnees";
import { verifierOrigineRequete } from "@/lib/api/securiteRequetes";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";

const schemaCorps = z.object({
  format: z.string().nullable(),
  anneeComptable: z.unknown(),
  prochainNumeroGlobal: z.number().int().min(1).max(999999).optional(),
  prochainNumeroComptable: z
    .object({
      annee: z.number().int().min(2000).max(2200),
      numero: z.number().int().min(1).max(999999),
    })
    .optional(),
});

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
    const role = await recupererRoleMembre(
      identifiantUtilisateur,
      identifiantOrganisation,
    );
    const reponse: Record<string, unknown> = {
      format: groupe.nomenclature.format,
      anneeComptable: groupe.nomenclature.anneeComptable,
    };

    if (estResponsable(role)) {
      const compteurs = await pool.query<{
        compteur_global: number;
        compteurs_comptables: Record<string, number>;
      }>(
        `SELECT compteur_global, compteurs_comptables
           FROM scouticket_group_data WHERE organization_id = $1`,
        [identifiantOrganisation],
      );
      const ligne = compteurs.rows[0];
      const aujourdhui = new Date().toISOString().slice(0, 10);
      const annee = anneeComptableDebut(
        aujourdhui,
        groupe.nomenclature.anneeComptable,
      );
      reponse.compteurs = {
        prochainNumeroGlobal: (ligne?.compteur_global ?? 0) + 1,
        anneeComptableCourante: annee,
        prochainNumeroComptable: (ligne?.compteurs_comptables[annee] ?? 0) + 1,
      };
    }
    return NextResponse.json(reponse);
  });
}

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

    const corps = schemaCorps.safeParse(await requete.json().catch(() => null));
    if (!corps.success)
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    const { format, anneeComptable } = corps.data;
    if (!validerParametresAnneeComptable(anneeComptable))
      return NextResponse.json(
        { error: "Année comptable invalide" },
        { status: 400 },
      );
    const erreurFormat =
      format === null ? null : validerFormatNomenclature(format);
    if (erreurFormat)
      return NextResponse.json({ error: erreurFormat }, { status: 400 });

    const formatEnregistre =
      format === null ? null : normaliserFormatNomenclature(format);
    const { prochainNumeroGlobal, prochainNumeroComptable } = corps.data;
    const resultat = await pool.query(
      `UPDATE scouticket_group_data
          SET nomenclature_format = $2,
              annee_comptable_debut_mois = $3,
              annee_comptable_debut_jour = $4,
              annee_comptable_format = $5,
              compteur_global = COALESCE($6::int, compteur_global),
              compteurs_comptables = CASE
                WHEN $7::text IS NULL THEN compteurs_comptables
                ELSE compteurs_comptables || jsonb_build_object($7::text, $8::int)
              END
        WHERE organization_id = $1`,
      [
        identifiantOrganisation,
        formatEnregistre,
        anneeComptable.mois,
        anneeComptable.jour,
        anneeComptable.format,
        prochainNumeroGlobal === undefined ? null : prochainNumeroGlobal - 1,
        prochainNumeroComptable ? String(prochainNumeroComptable.annee) : null,
        prochainNumeroComptable ? prochainNumeroComptable.numero - 1 : null,
      ],
    );
    if (resultat.rowCount === 0)
      return NextResponse.json(
        { error: "Configurez d'abord le groupe" },
        { status: 409 },
      );

    return NextResponse.json({
      success: true,
      format: formatEnregistre,
      anneeComptable,
    });
  });
}
