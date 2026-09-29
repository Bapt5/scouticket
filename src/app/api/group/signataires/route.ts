import { NextResponse } from "next/server";
import { z } from "zod";
import {
  estResponsable,
  recupererRoleMembre,
  recupererSignataires,
} from "@/lib/groupServer";
import { recupererContexteGroupe } from "@/lib/sessionServeur";
import { pool } from "@/lib/baseDeDonnees";
import { verifierOrigineRequete } from "@/lib/api/securiteRequetes";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";

const schemaCorps = z
  .object({
    responsables: z.array(z.string().min(1)),
    tresoriers: z.array(z.string().min(1)),
  })
  .strict();

function aDesDoublons(ids: string[]) {
  return new Set(ids).size !== ids.length;
}

/**
 * Signataires du groupe actif (Responsables, Trésoriers) : réservé aux
 * responsables, comme la liste des membres (noms/e-mails), dont ces données
 * sont issues.
 */
export async function GET(requete: Request) {
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
    const signataires = await recupererSignataires(identifiantOrganisation);
    return NextResponse.json(signataires);
  });
}

/** Remplace la liste de priorité des signataires : responsables du groupe uniquement. */
export async function PATCH(requete: Request) {
  return executerRouteAvecLogs(requete, async () => {
    const { identifiantOrganisation, identifiantUtilisateur } =
      await recupererContexteGroupe();
    const roleAppelant =
      identifiantOrganisation && identifiantUtilisateur
        ? await recupererRoleMembre(
            identifiantUtilisateur,
            identifiantOrganisation,
          )
        : null;
    if (!identifiantOrganisation || !estResponsable(roleAppelant))
      return NextResponse.json(
        { error: "Accès réservé aux responsables du groupe" },
        { status: 403 },
      );

    const erreurOrigine = verifierOrigineRequete(requete);
    if (erreurOrigine) return erreurOrigine;

    const corps = schemaCorps.safeParse(
      await requete.json().catch(() => null),
    );
    if (!corps.success)
      return NextResponse.json(
        { error: "Données invalides" },
        { status: 400 },
      );
    if (
      aDesDoublons(corps.data.responsables) ||
      aDesDoublons(corps.data.tresoriers)
    )
      return NextResponse.json(
        { error: "Un signataire ne peut apparaître qu'une seule fois" },
        { status: 400 },
      );

    const idsUniques = [
      ...new Set([...corps.data.responsables, ...corps.data.tresoriers]),
    ];
    const membres = idsUniques.length
      ? await pool.query<{ id: string; userId: string; role: string }>(
          `SELECT id, "userId", role FROM member
            WHERE "organizationId" = $1 AND id = ANY($2::text[])`,
          [identifiantOrganisation, idsUniques],
        )
      : { rows: [] };
    const parId = new Map(membres.rows.map((membre) => [membre.id, membre]));

    // Résout chaque id de membre en id utilisateur, en vérifiant qu'il
    // appartient bien au groupe et porte le rôle attendu pour sa catégorie.
    function resoudre(ids: string[], roleAttendu: "admin" | "owner") {
      const userIds: string[] = [];
      for (const id of ids) {
        const membre = parId.get(id);
        if (!membre || membre.role !== roleAttendu) return null;
        userIds.push(membre.userId);
      }
      return userIds;
    }
    const responsables = resoudre(corps.data.responsables, "admin");
    const tresoriers = resoudre(corps.data.tresoriers, "owner");
    if (!responsables || !tresoriers)
      return NextResponse.json(
        { error: "Données invalides" },
        { status: 400 },
      );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [role, userIds] of [
        ["admin", responsables],
        ["owner", tresoriers],
      ] as const) {
        // Remplace intégralement la liste de priorité de cette catégorie.
        await client.query(
          `DELETE FROM scouticket_signataires
            WHERE organization_id = $1
              AND user_id IN (
                SELECT "userId" FROM member
                 WHERE "organizationId" = $1 AND role = $2
              )`,
          [identifiantOrganisation, role],
        );
        for (const [index, userId] of userIds.entries())
          await client.query(
            `INSERT INTO scouticket_signataires (organization_id, user_id, ordre)
             VALUES ($1, $2, $3)`,
            [identifiantOrganisation, userId, index + 1],
          );
      }
      await client.query("COMMIT");
    } catch (erreur) {
      await client.query("ROLLBACK");
      throw erreur;
    } finally {
      client.release();
    }

    const signataires = await recupererSignataires(identifiantOrganisation);
    return NextResponse.json({ success: true, ...signataires });
  });
}
