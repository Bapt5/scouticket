import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/baseDeDonnees";
import { executerRouteAvecLogs } from "@/lib/api/routeAvecLogs";
import { verifierOrigineRequete } from "@/lib/api/securiteRequetes";
import { jsonError } from "@/lib/api/utils";
import { categoriesPourTypeEnvoi } from "@/constants/configDepenses";
import { LIBELLES_CATEGORIES_COMPTABLES_RECETTES } from "@/constants/configRecettes";
import {
  MAX_LIGNES_NOTE_DE_FRAIS,
  MAX_LIGNES_PAR_JUSTIFICATIF,
} from "@/constants/piecesJointes";
import { recupererPostes } from "@/lib/budgetServer";
import { totalLignes } from "@/lib/depenses";
import {
  recupererAccesHistorique,
  type AccesHistorique,
} from "@/lib/historiqueAcces";
import {
  SELECT_HISTORIQUE,
  construireWhere,
  schemaFiltresHistorique,
  versLigneApi,
  type LigneHistoriqueSql,
} from "@/lib/historiqueRequetes";
import type { TypeHistorique } from "@/lib/historique";
import { journal } from "@/lib/logger";
import { analyserDateIso } from "@/lib/nomenclature";

type Contexte = { params: Promise<{ id: string }> };

const schemaLigne = z.object({
  categorie: z.string().trim().min(1).max(200),
  montant: z
    .number()
    .gt(0)
    .max(10_000_000)
    .refine((montant) => Math.round(montant * 100) / 100 === montant, {
      message: "2 décimales maximum",
    }),
});

/** Modification partielle : la référence de nomenclature et le total ne sont jamais acceptés. */
const schemaModification = z
  .object({
    date: z.string().refine((date) => analyserDateIso(date) !== null),
    uniteId: z.string().min(1).max(100),
    posteBudgetaireId: z.string().min(1).max(100),
    modePaiement: z.string().trim().max(50),
    activite: z.string().trim().max(200),
    description: z.string().trim().max(1000),
    lignes: z
      .array(schemaLigne)
      .min(1)
      .max(MAX_LIGNES_NOTE_DE_FRAIS * 20),
  })
  .partial()
  .strict()
  .refine((corps) => Object.keys(corps).length > 0);

/** Catégories acceptées pour une entrée, selon son type. */
function categoriesAcceptees(type: TypeHistorique): Set<string> {
  if (type === "recette")
    return new Set(LIBELLES_CATEGORIES_COMPTABLES_RECETTES);
  return new Set(
    categoriesPourTypeEnvoi(
      type === "note-de-frais" ? "note-de-frais" : "depense-groupe",
    ).map((categorie) => categorie.libelle),
  );
}

async function chargerEntree(acces: AccesHistorique, id: string) {
  // Même périmètre que la liste : un membre ne lit que ses unités.
  const where = construireWhere(
    acces.identifiantOrganisation,
    schemaFiltresHistorique.parse({}),
    acces.unitesAutorisees,
    acces.groupe.nomenclature.anneeComptable,
  );
  const resultat = await pool.query<LigneHistoriqueSql>(
    `${SELECT_HISTORIQUE} WHERE ${where.clause} AND h.id = $${where.parametres.length + 1}`,
    [...where.parametres, id],
  );
  return resultat.rows[0] ? versLigneApi(resultat.rows[0]) : null;
}

export async function GET(requete: Request, { params }: Contexte) {
  return executerRouteAvecLogs(requete, async () => {
    const acces = await recupererAccesHistorique();
    if (acces.erreur) return acces.erreur;
    const { id } = await params;
    const entree = await chargerEntree(acces, id);
    if (!entree) return jsonError("Entrée introuvable", 404);
    return NextResponse.json({ entree, responsable: acces.responsable });
  });
}

/** Modifie une entrée (responsables). Aucun e-mail n'est renvoyé. */
export async function PATCH(requete: Request, { params }: Contexte) {
  return executerRouteAvecLogs(requete, async () => {
    const acces = await recupererAccesHistorique();
    if (acces.erreur) return acces.erreur;
    if (!acces.responsable)
      return jsonError("Accès réservé aux responsables du groupe", 403);
    const erreurOrigine = verifierOrigineRequete(requete);
    if (erreurOrigine) return erreurOrigine;

    const corps = schemaModification.safeParse(
      await requete.json().catch(() => null),
    );
    if (!corps.success) return jsonError("Données invalides", 400);

    const { id } = await params;
    const existante = await chargerEntree(acces, id);
    if (!existante) return jsonError("Entrée introuvable", 404);

    const modification = corps.data;
    const sets: string[] = [];
    const valeurs: unknown[] = [];
    const definir = (colonne: string, valeur: unknown) => {
      valeurs.push(valeur);
      sets.push(`${colonne} = $${valeurs.length}`);
    };

    if (modification.date !== undefined) definir("date", modification.date);
    if (modification.uniteId !== undefined) {
      const unite = acces.groupe.unites.find(
        (item) => item.id === modification.uniteId,
      );
      if (!unite) return jsonError("Unité invalide pour ce groupe", 400);
      definir("unite_id", unite.id);
      definir("unite_label", unite.label);
      definir("unite_couleur", unite.color);
    }
    if (modification.posteBudgetaireId !== undefined) {
      if (!acces.groupe.parametres.budgetActif)
        return jsonError("Le suivi budgétaire n'est pas activé", 400);
      const domaine = existante.type === "recette" ? "recette" : "depense";
      const poste = (await recupererPostes(acces.identifiantOrganisation)).find(
        (item) =>
          item.id === modification.posteBudgetaireId &&
          item.domaine === domaine,
      );
      if (!poste) return jsonError("Poste budgétaire invalide", 400);
      definir("poste_id", poste.id);
      definir("poste_label", poste.label);
    }
    if (
      modification.modePaiement !== undefined &&
      modification.modePaiement !== existante.modePaiement
    ) {
      // Un moyen de paiement de dépense doit appartenir à la liste du groupe.
      if (
        existante.type === "depense" &&
        !acces.groupe.parametres.moyensPaiement.includes(
          modification.modePaiement,
        )
      )
        return jsonError("Moyen de paiement invalide pour ce groupe", 400);
      definir("mode_paiement", modification.modePaiement);
    }
    if (modification.activite !== undefined)
      definir("activite", modification.activite);
    if (modification.description !== undefined)
      definir("description", modification.description);
    if (modification.lignes) {
      const autorisees = categoriesAcceptees(existante.type);
      const dejaPresentes = new Set(
        existante.lignes.map((ligne) => ligne.categorie),
      );
      if (
        modification.lignes.some(
          (ligne) =>
            !autorisees.has(ligne.categorie) &&
            !dejaPresentes.has(ligne.categorie),
        )
      )
        return jsonError("Catégorie comptable invalide", 400);
      if (
        existante.type !== "note-de-frais" &&
        modification.lignes.length > MAX_LIGNES_PAR_JUSTIFICATIF
      )
        return jsonError("Trop de lignes comptables", 400);
      definir("lignes", JSON.stringify(modification.lignes));
      // Le total n'est jamais fourni par le client : toujours recalculé.
      definir("montant_total", totalLignes(modification.lignes));
    }
    definir("modifie_le", new Date());
    definir("modifie_par_user_id", acces.identifiantUtilisateur);

    valeurs.push(acces.identifiantOrganisation, id);
    await pool.query(
      `UPDATE scouticket_historique
          SET ${sets.join(", ")}
        WHERE organization_id = $${valeurs.length - 1} AND id = $${valeurs.length}`,
      valeurs,
    );
    journal.info("historique.entree_modifiee", {
      categorie: "historique",
      details: { identifiantEntree: id },
    });

    const entree = await chargerEntree(acces, id);
    return NextResponse.json({ entree });
  });
}

/** Supprime définitivement une entrée (responsables). */
export async function DELETE(requete: Request, { params }: Contexte) {
  return executerRouteAvecLogs(requete, async () => {
    const acces = await recupererAccesHistorique();
    if (acces.erreur) return acces.erreur;
    if (!acces.responsable)
      return jsonError("Accès réservé aux responsables du groupe", 403);
    const erreurOrigine = verifierOrigineRequete(requete);
    if (erreurOrigine) return erreurOrigine;

    const { id } = await params;
    const suppression = await pool.query(
      "DELETE FROM scouticket_historique WHERE organization_id = $1 AND id = $2",
      [acces.identifiantOrganisation, id],
    );
    if (!suppression.rowCount) return jsonError("Entrée introuvable", 404);
    journal.info("historique.entree_supprimee", {
      categorie: "historique",
      details: { identifiantEntree: id },
    });
    return NextResponse.json({ success: true });
  });
}
