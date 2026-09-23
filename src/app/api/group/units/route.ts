import { NextResponse } from "next/server";
import { z } from "zod";
import { validerUnites } from "@/lib/group";
import {
  appliquerUnites,
  estResponsable,
  recupererRoleMembre,
} from "@/lib/groupServer";
import { recupererContexteGroupe } from "@/lib/sessionServeur";
import { pool } from "@/lib/baseDeDonnees";
import { verifierOrigineRequete } from "@/lib/api/securiteRequetes";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";

const schemaCorps = z.object({ units: z.unknown() });

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
    const unites = corps.success ? validerUnites(corps.data.units) : null;
    if (!unites)
      return NextResponse.json({ error: "Unités invalides" }, { status: 400 });

    const client = await pool.connect();
    let unitesEnregistrees;
    try {
      await client.query("BEGIN");
      unitesEnregistrees = await appliquerUnites(
        client,
        identifiantOrganisation,
        unites,
      );
      await client.query("COMMIT");
    } catch (erreur) {
      await client.query("ROLLBACK");
      throw erreur;
    } finally {
      client.release();
    }
    // Les unités nouvellement créées reçoivent un id côté base : on le renvoie
    // pour que l'éditeur puisse continuer à les modifier sans les dupliquer.
    return NextResponse.json({ success: true, units: unitesEnregistrees });
  });
}
