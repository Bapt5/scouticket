import { NextResponse } from "next/server";
import { z } from "zod";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { jsonError } from "@/lib/api/utils";
import { calculerSuiviBudgetaire, recupererPostes } from "@/lib/budgetServer";
import { recupererAccesBudget } from "@/lib/budgetAcces";
import { anneeComptableDebut } from "@/lib/nomenclature";

const schemaRequete = z.object({
  anneeComptable: z.coerce.number().int().min(2000).max(2200).optional(),
});

/** Postes, budgets et réalisé de l'année comptable demandée (courante par défaut). */
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
    const [suivi, postes] = await Promise.all([
      calculerSuiviBudgetaire(acces.identifiantOrganisation, anneeDebut, debut),
      recupererPostes(acces.identifiantOrganisation),
    ]);
    return NextResponse.json({ ...suivi, postes, debut });
  });
}
