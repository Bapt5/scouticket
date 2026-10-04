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
  domaine: z.enum(["depense", "recette"]).default("depense"),
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

/** Nom des colonnes de nomenclature/compteurs, selon le domaine. */
function colonnesDomaine(domaine: "depense" | "recette") {
  return domaine === "recette"
    ? {
        format: "nomenclature_format_recette",
        compteurGlobal: "compteur_global_recette",
        compteursComptables: "compteurs_comptables_recette",
      }
    : {
        format: "nomenclature_format",
        compteurGlobal: "compteur_global",
        compteursComptables: "compteurs_comptables",
      };
}

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
      anneeComptable: groupe.nomenclature.anneeComptable,
      depense: { format: groupe.nomenclature.depense.format },
      recette: { format: groupe.nomenclature.recette.format },
    };

    if (estResponsable(role)) {
      const compteurs = await pool.query<{
        compteur_global: number;
        compteurs_comptables: Record<string, number>;
        compteur_global_recette: number;
        compteurs_comptables_recette: Record<string, number>;
      }>(
        `SELECT compteur_global, compteurs_comptables,
                compteur_global_recette, compteurs_comptables_recette
           FROM scouticket_group_data WHERE organization_id = $1`,
        [identifiantOrganisation],
      );
      const ligne = compteurs.rows[0];
      const aujourdhui = new Date().toISOString().slice(0, 10);
      const annee = anneeComptableDebut(
        aujourdhui,
        groupe.nomenclature.anneeComptable,
      );
      reponse.anneeComptableCourante = annee;
      (reponse.depense as Record<string, unknown>).compteurs = {
        prochainNumeroGlobal: (ligne?.compteur_global ?? 0) + 1,
        prochainNumeroComptable: (ligne?.compteurs_comptables[annee] ?? 0) + 1,
      };
      (reponse.recette as Record<string, unknown>).compteurs = {
        prochainNumeroGlobal: (ligne?.compteur_global_recette ?? 0) + 1,
        prochainNumeroComptable:
          (ligne?.compteurs_comptables_recette[annee] ?? 0) + 1,
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
    const { domaine, format, anneeComptable } = corps.data;
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
    const colonnes = colonnesDomaine(domaine);
    // Le format d'affichage de l'année comptable est partagé : il est toujours
    // mis à jour, quel que soit le domaine édité (le début de l'année se règle
    // dans les paramètres du groupe). Le format de nom et les compteurs ne
    // touchent que les colonnes du domaine ciblé.
    const resultat = await pool.query(
      `UPDATE scouticket_group_data
          SET ${colonnes.format} = $2,
              annee_comptable_format = $3,
              ${colonnes.compteurGlobal} = COALESCE($4::int, ${colonnes.compteurGlobal}),
              ${colonnes.compteursComptables} = CASE
                WHEN $5::text IS NULL THEN ${colonnes.compteursComptables}
                ELSE ${colonnes.compteursComptables} || jsonb_build_object($5::text, $6::int)
              END
        WHERE organization_id = $1`,
      [
        identifiantOrganisation,
        formatEnregistre,
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
      domaine,
      format: formatEnregistre,
      anneeComptable,
    });
  });
}
