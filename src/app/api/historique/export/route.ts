import { NextResponse } from "next/server";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { jsonError } from "@/lib/api/utils";
import { genererCsvHistorique } from "@/lib/historique";
import { recupererAccesHistorique } from "@/lib/historiqueAcces";
import {
  LIGNES_MAX_EXPORT,
  analyserFiltresHistorique,
  construireWhere,
  rechercherHistorique,
} from "@/lib/historiqueRequetes";

/** Export CSV des lignes correspondant aux filtres (sans pagination). */
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
      limite: LIGNES_MAX_EXPORT,
      decalage: 0,
    });
    if (resultat.total > LIGNES_MAX_EXPORT)
      return jsonError(
        "Trop de lignes à exporter : affinez les filtres (période, unité…)",
        413,
      );

    return new NextResponse(genererCsvHistorique(resultat.lignes), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="historique.csv"',
        "Cache-Control": "no-store",
      },
    });
  });
}
