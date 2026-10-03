import { NextResponse } from "next/server";
import { pool } from "@/lib/baseDeDonnees";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { jsonError } from "@/lib/api/utils";
import { recupererAccesHistorique } from "@/lib/historiqueAcces";
import {
  analyserFiltresHistorique,
  construireWhere,
  rechercherHistorique,
} from "@/lib/historiqueRequetes";

/**
 * Historique du groupe actif, paginé côté serveur. Les membres simples ne
 * voient que les unités auxquelles ils ont accès.
 */
export async function GET(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const acces = await recupererAccesHistorique();
    if (acces.erreur) return acces.erreur;

    const filtres = analyserFiltresHistorique(
      new URL(requete.url).searchParams,
    );
    if (!filtres.success) return jsonError("Filtres invalides", 400);

    const where = construireWhere(
      acces.identifiantOrganisation,
      filtres.data,
      acces.unitesAutorisees,
      acces.groupe.nomenclature.anneeComptable,
    );
    const resultat = await rechercherHistorique(where, filtres.data, {
      limite: filtres.data.taille,
      decalage: (filtres.data.page - 1) * filtres.data.taille,
    });

    // Bornes (hors filtres) pour proposer les années comptables présentes.
    const bornes = construireWhere(
      acces.identifiantOrganisation,
      {
        ...filtres.data,
        type: undefined,
        unite: undefined,
        du: undefined,
        au: undefined,
        anneeComptable: undefined,
        q: undefined,
      },
      acces.unitesAutorisees,
      acces.groupe.nomenclature.anneeComptable,
    );
    const plage = await pool.query<{ min: string | null; max: string | null }>(
      `SELECT TO_CHAR(MIN(h.date), 'YYYY-MM-DD') AS min,
              TO_CHAR(MAX(h.date), 'YYYY-MM-DD') AS max
         FROM scouticket_historique h
        WHERE ${bornes.clause}`,
      bornes.parametres,
    );

    return NextResponse.json({
      ...resultat,
      page: filtres.data.page,
      taille: filtres.data.taille,
      responsable: acces.responsable,
      plageDates: plage.rows[0],
    });
  });
}
