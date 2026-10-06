import { z } from "zod";
import { pool } from "@/lib/baseDeDonnees";
import { VALEUR_NON_AFFECTE } from "@/lib/budget";
import {
  COLONNES_TRI_HISTORIQUE,
  TYPES_HISTORIQUE,
  intervalleAnneeComptable,
  type LigneHistoriqueApi,
} from "@/lib/historique";

export const TAILLE_PAGE_MAX = 100;
/** Garde-fou de l'export CSV. */
export const LIGNES_MAX_EXPORT = 20000;

const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Liste séparée par des virgules ; une valeur vide donne une liste vide (aucun résultat). */
const listeCsv = <T extends z.ZodTypeAny>(element: T) =>
  z.preprocess(
    (valeur) =>
      typeof valeur === "string" ? valeur.split(",").filter(Boolean) : valeur,
    z.array(element).max(100),
  );

export const schemaFiltresHistorique = z.object({
  page: z.coerce.number().int().min(1).default(1),
  taille: z.coerce.number().int().min(1).max(TAILLE_PAGE_MAX).default(25),
  tri: z.enum(COLONNES_TRI_HISTORIQUE).default("date"),
  sens: z.enum(["asc", "desc"]).default("desc"),
  type: listeCsv(z.enum(TYPES_HISTORIQUE)).optional(),
  unite: listeCsv(z.string().min(1).max(100)).optional(),
  /** Ids de postes budgétaires ; `non-affecte` retient les lignes sans poste. */
  poste: listeCsv(z.string().min(1).max(100)).optional(),
  du: dateIso.optional(),
  au: dateIso.optional(),
  anneeComptable: z.coerce.number().int().min(1900).max(3000).optional(),
  q: z.string().trim().max(100).optional(),
});
export type FiltresHistorique = z.infer<typeof schemaFiltresHistorique>;

/**
 * Lit les filtres de l'URL. Les paramètres vides sont ignorés, sauf `type`,
 * `unite` et `poste` : vides, ils signifient « aucune valeur retenue » (aucun résultat).
 */
export function analyserFiltresHistorique(parametres: URLSearchParams) {
  const brut: Record<string, string> = {};
  for (const [cle, valeur] of parametres)
    if (valeur !== "" || cle === "type" || cle === "unite" || cle === "poste")
      brut[cle] = valeur;
  return schemaFiltresHistorique.safeParse(brut);
}

const COLONNE_TRI: Record<(typeof COLONNES_TRI_HISTORIQUE)[number], string> = {
  date: "h.date",
  reference: "h.reference",
  type: "h.type",
  unite: "h.unite_label",
  montant: "h.montant_total",
};

const echapperLike = (valeur: string) => valeur.replace(/[\\%_]/g, "\\$&");

/**
 * Clause WHERE des filtres. `unitesAutorisees` (membre simple) restreint aux
 * unités accessibles : `null` = aucune restriction (responsable).
 */
export function construireWhere(
  identifiantOrganisation: string,
  filtres: FiltresHistorique,
  unitesAutorisees: ReadonlySet<string> | null,
  anneeComptableDebut: { mois: number; jour: number },
) {
  const parametres: unknown[] = [identifiantOrganisation];
  const conditions = ["h.organization_id = $1"];
  const ajouter = (condition: (indice: number) => string, valeur: unknown) => {
    parametres.push(valeur);
    conditions.push(condition(parametres.length));
  };

  if (unitesAutorisees)
    ajouter((i) => `h.unite_id = ANY($${i}::text[])`, [...unitesAutorisees]);
  // Liste absente = pas de filtre ; liste vide = rien de sélectionné.
  if (filtres.type) ajouter((i) => `h.type = ANY($${i}::text[])`, filtres.type);
  if (filtres.unite)
    ajouter((i) => `h.unite_id = ANY($${i}::text[])`, filtres.unite);

  if (filtres.poste) {
    const ids = filtres.poste.filter((poste) => poste !== VALEUR_NON_AFFECTE);
    const nonAffecte = filtres.poste.includes(VALEUR_NON_AFFECTE);
    ajouter(
      (i) =>
        `(h.poste_id = ANY($${i}::text[])${nonAffecte ? " OR h.poste_id IS NULL" : ""})`,
      ids,
    );
  }

  let du = filtres.du;
  let au = filtres.au;
  if (filtres.anneeComptable !== undefined) {
    const annee = intervalleAnneeComptable(
      filtres.anneeComptable,
      anneeComptableDebut,
    );
    // L'année comptable se combine avec le filtre par date (intersection).
    du = du && du > annee.du ? du : annee.du;
    au = au && au < annee.au ? au : annee.au;
  }
  if (du) ajouter((i) => `h.date >= $${i}`, du);
  if (au) ajouter((i) => `h.date <= $${i}`, au);
  if (filtres.q) {
    ajouter(
      (i) =>
        `(h.description ILIKE $${i} OR h.reference ILIKE $${i}
          OR h.unite_label ILIKE $${i} OR h.activite ILIKE $${i}
          OR h.mode_paiement ILIKE $${i} OR h.lignes::text ILIKE $${i})`,
      `%${echapperLike(filtres.q)}%`,
    );
  }
  return { clause: conditions.join(" AND "), parametres };
}

interface LigneSql {
  id: string;
  envoi_id: string;
  type: LigneHistoriqueApi["type"];
  date: string;
  unite_id: string | null;
  unite_label: string;
  unite_couleur: string;
  poste_id: string | null;
  poste_label: string | null;
  reference: string | null;
  mode_paiement: string;
  activite: string;
  description: string;
  montant_total: number;
  lignes: LigneHistoriqueApi["lignes"];
  auteur_nom: string | null;
  cree_le: Date;
  modifie_le: Date | null;
  modifie_par_nom: string | null;
}

export const SELECT_HISTORIQUE = `
  SELECT h.id, h.envoi_id, h.type, TO_CHAR(h.date, 'YYYY-MM-DD') AS date,
         h.unite_id, h.unite_label, h.unite_couleur, h.poste_id, h.poste_label,
         h.reference,
         h.mode_paiement, h.activite, h.description,
         h.montant_total::float8 AS montant_total, h.lignes,
         auteur.name AS auteur_nom, h.cree_le, h.modifie_le,
         modificateur.name AS modifie_par_nom
    FROM scouticket_historique h
    LEFT JOIN "user" auteur ON auteur.id = h.auteur_user_id
    LEFT JOIN "user" modificateur ON modificateur.id = h.modifie_par_user_id`;

export type { LigneSql as LigneHistoriqueSql };

export const versLigneApi = (ligne: LigneSql): LigneHistoriqueApi => ({
  id: ligne.id,
  envoiId: ligne.envoi_id,
  type: ligne.type,
  date: ligne.date,
  uniteId: ligne.unite_id,
  uniteLabel: ligne.unite_label,
  uniteCouleur: ligne.unite_couleur,
  posteId: ligne.poste_id,
  posteLabel: ligne.poste_label,
  reference: ligne.reference,
  modePaiement: ligne.mode_paiement,
  activite: ligne.activite,
  description: ligne.description,
  montantTotal: ligne.montant_total,
  lignes: ligne.lignes,
  auteurNom: ligne.auteur_nom,
  creeLe: ligne.cree_le.toISOString(),
  modifieLe: ligne.modifie_le?.toISOString() ?? null,
  modifieParNom: ligne.modifie_par_nom,
});

export async function rechercherHistorique(
  where: { clause: string; parametres: unknown[] },
  filtres: Pick<FiltresHistorique, "tri" | "sens">,
  pagination: { limite: number; decalage: number },
) {
  const ordre = `${COLONNE_TRI[filtres.tri]} ${filtres.sens === "asc" ? "ASC" : "DESC"} NULLS LAST, h.cree_le DESC, h.id`;
  const limite = where.parametres.length + 1;
  const [lignes, totaux] = await Promise.all([
    pool.query<LigneSql>(
      `${SELECT_HISTORIQUE}
        WHERE ${where.clause}
        ORDER BY ${ordre}
        LIMIT $${limite} OFFSET $${limite + 1}`,
      [...where.parametres, pagination.limite, pagination.decalage],
    ),
    pool.query<{ total: string; depenses: number; recettes: number }>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(h.montant_total) FILTER (WHERE h.type <> 'recette'), 0)::float8 AS depenses,
              COALESCE(SUM(h.montant_total) FILTER (WHERE h.type = 'recette'), 0)::float8 AS recettes
         FROM scouticket_historique h
        WHERE ${where.clause}`,
      where.parametres,
    ),
  ]);
  const ligneTotaux = totaux.rows[0];
  const depenses = Math.round(ligneTotaux.depenses * 100) / 100;
  const recettes = Math.round(ligneTotaux.recettes * 100) / 100;
  return {
    lignes: lignes.rows.map(versLigneApi),
    total: Number(ligneTotaux.total),
    totaux: {
      depenses,
      recettes,
      solde: Math.round((recettes - depenses) * 100) / 100,
    },
  };
}
