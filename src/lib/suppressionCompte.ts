import { APIError } from "better-auth/api";
import { pool } from "@/lib/baseDeDonnees";

/** Refuse la suppression tant que l’utilisateur appartient encore à un groupe. */
export async function verifierSuppressionCompte(
  identifiantUtilisateur: string,
) {
  const appartenances = await pool.query(
    `SELECT 1 FROM member WHERE "userId" = $1 LIMIT 1`,
    [identifiantUtilisateur],
  );
  if (appartenances.rows.length > 0)
    throw new APIError("CONFLICT", {
      message:
        "Quittez d’abord tous vos groupes avant de supprimer votre compte.",
    });
}
