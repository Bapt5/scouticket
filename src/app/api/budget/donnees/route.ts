import { NextResponse } from "next/server";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { recupererAccesBudget } from "@/lib/budgetAcces";
import { compterDonneesBudget } from "@/lib/budgetServer";

/** Nombre de postes et d'écritures affectées (message avant désactivation du suivi). */
export async function GET(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const acces = await recupererAccesBudget();
    if (acces.erreur) return acces.erreur;
    return NextResponse.json(
      await compterDonneesBudget(acces.identifiantOrganisation),
    );
  });
}
