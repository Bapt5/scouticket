import { NextResponse } from "next/server";
import { z } from "zod";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { verifierOrigineRequete } from "@/lib/api/securiteRequetes";
import { jsonError } from "@/lib/api/utils";
import { pool } from "@/lib/baseDeDonnees";
import { recupererAccesBudget } from "@/lib/budgetAcces";
import { enregistrerBudgets } from "@/lib/budgetServer";

const schemaCorps = z.object({
  anneeComptable: z.number().int().min(2000).max(2200),
  budgets: z
    .array(
      z.object({
        posteId: z.string().min(1),
        // `null` supprime le budget du poste pour cette année.
        montant: z.number().min(0).max(1_000_000_000).nullable(),
      }),
    )
    .max(100),
});

const arrondirAuCentime = (montant: number) => Math.round(montant * 100) / 100;

/** Enregistre les budgets prévisionnels d'une année comptable. */
export async function PUT(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const acces = await recupererAccesBudget();
    if (acces.erreur) return acces.erreur;

    const erreurOrigine = verifierOrigineRequete(requete);
    if (erreurOrigine) return erreurOrigine;

    const corps = schemaCorps.safeParse(await requete.json().catch(() => null));
    if (!corps.success) return jsonError("Budgets invalides", 400);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await enregistrerBudgets(
        client,
        acces.identifiantOrganisation,
        corps.data.anneeComptable,
        corps.data.budgets.map(({ posteId, montant }) => ({
          posteId,
          montant: montant === null ? null : arrondirAuCentime(montant),
        })),
      );
      await client.query("COMMIT");
    } catch (erreur) {
      await client.query("ROLLBACK");
      throw erreur;
    } finally {
      client.release();
    }
    return NextResponse.json({ success: true });
  });
}
