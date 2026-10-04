import { NextResponse } from "next/server";
import { z } from "zod";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { verifierOrigineRequete } from "@/lib/api/securiteRequetes";
import { jsonError } from "@/lib/api/utils";
import { pool } from "@/lib/baseDeDonnees";
import { validerPostes } from "@/lib/budget";
import { recupererAccesBudget } from "@/lib/budgetAcces";
import { appliquerPostes } from "@/lib/budgetServer";

const schemaCorps = z.object({ postes: z.unknown() });

/** Remplace la liste des postes du groupe (responsables, suivi activé). */
export async function PUT(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const acces = await recupererAccesBudget();
    if (acces.erreur) return acces.erreur;

    const erreurOrigine = verifierOrigineRequete(requete);
    if (erreurOrigine) return erreurOrigine;

    const corps = schemaCorps.safeParse(await requete.json().catch(() => null));
    const postes = corps.success ? validerPostes(corps.data.postes) : null;
    if (!postes) return jsonError("Postes invalides", 400);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const enregistres = await appliquerPostes(
        client,
        acces.identifiantOrganisation,
        postes,
      );
      await client.query("COMMIT");
      // Les ids des nouveaux postes sont renvoyés pour poursuivre l'édition.
      return NextResponse.json({ success: true, postes: enregistres });
    } catch (erreur) {
      await client.query("ROLLBACK");
      throw erreur;
    } finally {
      client.release();
    }
  });
}
