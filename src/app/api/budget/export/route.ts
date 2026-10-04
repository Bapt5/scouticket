import { NextResponse } from "next/server";
import { z } from "zod";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { jsonError } from "@/lib/api/utils";
import { genererCsvSuivi } from "@/lib/budget";
import { recupererAccesBudget } from "@/lib/budgetAcces";
import { calculerSuiviBudgetaire } from "@/lib/budgetServer";
import { cellulesCsv, montantCsv } from "@/lib/historique";
import { anneeComptableDebut } from "@/lib/nomenclature";

const schemaRequete = z.object({
  anneeComptable: z.coerce.number().int().min(2000).max(2200).optional(),
});

/** Export CSV du suivi (budget, réalisé, solde, taux) d'une année comptable. */
export async function GET(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const acces = await recupererAccesBudget();
    if (acces.erreur) return acces.erreur;

    const filtres = schemaRequete.safeParse(
      Object.fromEntries(new URL(requete.url).searchParams),
    );
    if (!filtres.success) return jsonError("Filtres invalides", 400);

    const debut = acces.groupe.parametres.anneeComptableDebut;
    const anneeDebut =
      filtres.data.anneeComptable ??
      anneeComptableDebut(new Date().toISOString().slice(0, 10), debut);
    const suivi = await calculerSuiviBudgetaire(
      acces.identifiantOrganisation,
      anneeDebut,
      debut,
    );

    return new NextResponse(genererCsvSuivi(suivi, cellulesCsv, montantCsv), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="suivi-budgetaire-${anneeDebut}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
