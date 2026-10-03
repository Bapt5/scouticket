import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "@/lib/baseDeDonnees";
import { lienHistorique } from "@/lib/historiqueLien";
import {
  montantTotalEntree,
  type ContexteHistorique,
  type EntreeHistorique,
} from "@/lib/historique";

/**
 * Enregistre les entrées d'un envoi dans l'historique, dans la transaction du
 * client : si l'insertion échoue, l'appelant annule tout (ROLLBACK), donc
 * aucun numéro de nomenclature n'est consommé et aucun e-mail n'est envoyé.
 * Sans effet quand l'historique est désactivé pour le groupe.
 * Renvoie les identifiants des entrées créées (vide si rien n'a été écrit).
 */
export async function enregistrerHistorique(
  client: PoolClient,
  identifiantOrganisation: string,
  contexte: ContexteHistorique,
  entrees: readonly EntreeHistorique[],
): Promise<string[]> {
  if (entrees.length === 0) return [];
  const parametre = await client.query<{ historique_actif: boolean }>(
    `SELECT historique_actif FROM scouticket_group_data
      WHERE organization_id = $1`,
    [identifiantOrganisation],
  );
  if (!parametre.rows[0]?.historique_actif) return [];

  const identifiantEnvoi = randomUUID();
  const identifiants: string[] = [];
  for (const entree of entrees) {
    const identifiant = randomUUID();
    identifiants.push(identifiant);
    await client.query(
      `INSERT INTO scouticket_historique
         (id, organization_id, envoi_id, type, date, unite_id, unite_label,
          unite_couleur, reference, mode_paiement, activite, description,
          montant_total, lignes, auteur_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
               $14::jsonb, $15)`,
      [
        identifiant,
        identifiantOrganisation,
        identifiantEnvoi,
        entree.type,
        entree.date,
        contexte.uniteId,
        contexte.uniteLabel,
        contexte.uniteCouleur,
        entree.reference,
        entree.modePaiement,
        entree.activite,
        entree.description,
        montantTotalEntree(entree),
        JSON.stringify(entree.lignes),
        contexte.auteurUserId,
      ],
    );
  }
  return identifiants;
}

/** Entrées d'historique d'un envoi, avec son contexte (unité, auteur). */
export interface HistoriqueEnvoi {
  contexte: ContexteHistorique;
  entrees: EntreeHistorique[];
}

/**
 * Envoi sans nomenclature (donc sans numéro à réserver) : l'historique est
 * tout de même écrit avant l'envoi dans une transaction, validée seulement
 * si l'e-mail est parti. Même garantie que `envoyerAvecNomenclature`.
 * `envoyer` reçoit le lien vers l'historique à mettre dans l'e-mail (absent si
 * l'historique est désactivé).
 */
export async function envoyerAvecHistorique<R>(
  identifiantOrganisation: string,
  historique: HistoriqueEnvoi,
  envoyer: (lienDansEmail?: string) => Promise<R>,
): Promise<R> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const identifiants = await enregistrerHistorique(
      client,
      identifiantOrganisation,
      historique.contexte,
      historique.entrees,
    );
    const resultat = await envoyer(lienHistorique(identifiants));
    await client.query("COMMIT");
    return resultat;
  } catch (erreur) {
    await client.query("ROLLBACK");
    throw erreur;
  } finally {
    client.release();
  }
}
