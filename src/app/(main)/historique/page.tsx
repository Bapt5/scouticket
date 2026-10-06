"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DialogHistorique } from "@/components/DialogHistorique";
import { FiltreMultiple } from "@/components/FiltreMultiple";
import { clientAuth } from "@/lib/auth-client";
import {
  LIBELLE_NON_AFFECTE,
  VALEUR_NON_AFFECTE,
  type PosteBudgetaire,
} from "@/lib/budget";
import type { UniteGroupe } from "@/lib/group";
import {
  LIBELLES_TYPES_HISTORIQUE,
  TYPES_HISTORIQUE,
  effetTresorerieHistorique,
  formaterEffetTresorerieHistorique,
  formaterDateHistorique,
  formaterMontantHistorique,
  type ColonneTriHistorique,
  type LigneHistoriqueApi,
  type TypeHistorique,
} from "@/lib/historique";
import {
  anneeComptableDebut,
  libelleAnneeComptable,
  type ParametresAnneeComptable,
} from "@/lib/nomenclature";

type Config = {
  units: UniteGroupe[];
  nomenclature?: { anneeComptable: ParametresAnneeComptable };
  parametres?: {
    historiqueActif: boolean;
    budgetActif?: boolean;
    moyensPaiement: string[];
  };
  postesBudgetaires?: {
    depense: PosteBudgetaire[];
    recette: PosteBudgetaire[];
  };
};

type Reponse = {
  lignes: LigneHistoriqueApi[];
  total: number;
  totaux: { depenses: number; recettes: number; solde: number };
  responsable: boolean;
  plageDates: { min: string | null; max: string | null };
};

interface Filtres {
  tri: ColonneTriHistorique;
  sens: "asc" | "desc";
  /** `null` = tous ; liste vide = aucun. */
  type: TypeHistorique[] | null;
  unite: string[] | null;
  poste: string[] | null;
  du: string;
  au: string;
  anneeComptable: string;
  q: string;
}

/** Entrées chargées à chaque lot du défilement infini (maximum accepté par l'API). */
const TAILLE_LOT = 100;
const HAUTEUR_LIGNE = 41;
const FILTRES_INITIAUX: Filtres = {
  tri: "date",
  sens: "desc",
  type: null,
  unite: null,
  poste: null,
  du: "",
  au: "",
  anneeComptable: "",
  q: "",
};

// Largeurs fixes : avec les lignes virtualisées, une disposition automatique redimensionnerait les colonnes au défilement.
const COLONNES: {
  cle: ColonneTriHistorique;
  libelle: string;
  largeur: string;
}[] = [
  { cle: "date", libelle: "Date", largeur: "w-28" },
  { cle: "reference", libelle: "Référence", largeur: "w-36" },
  { cle: "type", libelle: "Type", largeur: "w-32" },
  { cle: "unite", libelle: "Unité", largeur: "w-36" },
  { cle: "montant", libelle: "Montant", largeur: "w-32" },
];

const classeChamp =
  "rounded-lg border border-zinc-300 bg-white p-2 text-sm text-zinc-900 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400";

/** Clé locale de la dernière année comptable consultée, par groupe. */
const cleAnneeMemorisee = (identifiantOrganisation: string) =>
  `scoutreso:historique:anneeComptable:${identifiantOrganisation}`;

/** Lecture/écriture tolérantes : le stockage peut être indisponible ou bloqué. */
function lireAnneeMemorisee(identifiantOrganisation: string): string {
  try {
    const valeur = localStorage.getItem(
      cleAnneeMemorisee(identifiantOrganisation),
    );
    return valeur !== null && /^\d{4}$/.test(valeur) ? valeur : "";
  } catch {
    return "";
  }
}
function memoriserAnnee(identifiantOrganisation: string, annee: string) {
  try {
    localStorage.setItem(cleAnneeMemorisee(identifiantOrganisation), annee);
  } catch {
    // Pas de mémorisation : l'année reste simplement à resélectionner.
  }
}

/** Paramètres d'URL des filtres (`page` nulle pour l'export, qui n'est pas paginé). */
function versParametres(filtres: Filtres, page: number | null) {
  const parametres = new URLSearchParams();
  if (page !== null) {
    parametres.set("page", String(page));
    parametres.set("taille", String(TAILLE_LOT));
  }
  parametres.set("tri", filtres.tri);
  parametres.set("sens", filtres.sens);
  // Un paramètre vide signifie « aucune valeur retenue » (aucun résultat).
  if (filtres.type) parametres.set("type", filtres.type.join(","));
  if (filtres.unite) parametres.set("unite", filtres.unite.join(","));
  if (filtres.poste) parametres.set("poste", filtres.poste.join(","));
  for (const cle of ["du", "au", "anneeComptable", "q"] as const)
    if (filtres[cle]) parametres.set(cle, filtres[cle]);
  return parametres;
}

export default function PageHistorique() {
  const { data: organisation } = clientAuth.useActiveOrganization();
  const [config, setConfig] = useState<Config | null>(null);
  const [configChargee, setConfigChargee] = useState(false);
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_INITIAUX);
  const [recherche, setRecherche] = useState("");
  const [reponse, setReponse] = useState<Reponse | null>(null);
  // Lignes déjà chargées (lots successifs) ; `reponse` porte total et totaux de toute la sélection.
  const [entrees, setEntrees] = useState<LigneHistoriqueApi[]>([]);
  const [lotsCharges, setLotsCharges] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [chargementSuite, setChargementSuite] = useState(false);
  // Identifie la sélection courante : la réponse d'une sélection périmée est ignorée.
  const generation = useRef(0);
  const conteneur = useRef<HTMLDivElement>(null);
  const [erreur, setErreur] = useState("");
  const [selection, setSelection] = useState<LigneHistoriqueApi | null>(null);
  // La première requête attend la lecture de l'année mémorisée (évite une requête « Toutes » inutile).
  const [anneeRestauree, setAnneeRestauree] = useState(false);
  const identifiantOrganisation = organisation?.id;
  // Entrée ouverte depuis un lien d'e-mail (`?entree=`) : droits connus avant la liste.
  const [responsableLien, setResponsableLien] = useState<boolean | null>(null);
  const [avisLien, setAvisLien] = useState("");

  useEffect(() => {
    fetch("/api/group/config")
      .then((retour) => (retour.ok ? retour.json() : null))
      .then((corps: Config | null) => setConfig(corps))
      .catch(() => setConfig(null))
      .finally(() => setConfigChargee(true));
  }, []);

  // Restaure la dernière année comptable consultée dans ce groupe.
  useEffect(() => {
    if (!identifiantOrganisation) return;
    const annee = lireAnneeMemorisee(identifiantOrganisation);
    setFiltres((actuels) => ({ ...actuels, anneeComptable: annee }));
    setAnneeRestauree(true);
  }, [identifiantOrganisation]);

  const actif = config?.parametres?.historiqueActif ?? false;
  const budgetActif = config?.parametres?.budgetActif ?? false;
  const optionsPostes = useMemo(
    () => [
      ...(config?.postesBudgetaires?.depense ?? []).map((poste) => ({
        id: poste.id,
        libelle: `${poste.label} (dépense)`,
      })),
      ...(config?.postesBudgetaires?.recette ?? []).map((poste) => ({
        id: poste.id,
        libelle: `${poste.label} (recette)`,
      })),
      { id: VALEUR_NON_AFFECTE, libelle: LIBELLE_NON_AFFECTE },
    ],
    [config?.postesBudgetaires],
  );

  // Lien d'un e-mail : ouvre directement le détail de l'entrée, une seule fois.
  useEffect(() => {
    if (!actif) return;
    const identifiant = new URLSearchParams(window.location.search).get(
      "entree",
    );
    if (!identifiant) return;
    window.history.replaceState(null, "", window.location.pathname);
    fetch(`/api/historique/${encodeURIComponent(identifiant)}`)
      .then(async (retour) => {
        if (!retour.ok) throw new Error("ENTREE_INTROUVABLE");
        const corps = (await retour.json()) as {
          entree: LigneHistoriqueApi;
          responsable: boolean;
        };
        setResponsableLien(corps.responsable);
        setSelection(corps.entree);
      })
      .catch(() =>
        setAvisLien(
          "Cette entrée n’existe plus ou n’est pas accessible avec vos droits.",
        ),
      );
  }, [actif]);

  // La recherche texte est appliquée après une courte pause de saisie.
  useEffect(() => {
    const minuteur = setTimeout(
      () =>
        setFiltres((actuels) =>
          actuels.q === recherche ? actuels : { ...actuels, q: recherche },
        ),
      300,
    );
    return () => clearTimeout(minuteur);
  }, [recherche]);

  useEffect(() => {
    if (!actif || !anneeRestauree) return;
    const annulation = new AbortController();
    generation.current += 1;
    setChargement(true);
    setChargementSuite(false);
    setErreur("");
    fetch(`/api/historique?${versParametres(filtres, 1)}`, {
      signal: annulation.signal,
    })
      .then(async (retour) => {
        if (!retour.ok) throw new Error("HISTORIQUE_INDISPONIBLE");
        const corps = (await retour.json()) as Reponse;
        setReponse(corps);
        setEntrees(corps.lignes);
        setLotsCharges(1);
        // Nouvelle sélection : retour en haut de la liste.
        conteneur.current?.scrollTo?.({ top: 0 });
      })
      .catch((erreurChargement: unknown) => {
        if ((erreurChargement as Error).name === "AbortError") return;
        setErreur("Impossible de charger l’historique.");
      })
      .finally(() => {
        if (!annulation.signal.aborted) setChargement(false);
      });
    return () => annulation.abort();
  }, [actif, anneeRestauree, filtres]);

  const total = reponse?.total ?? 0;

  /** Charge le lot suivant (défilement vers le bas). */
  const chargerSuite = useCallback(async () => {
    if (chargement || chargementSuite || entrees.length >= total) return;
    const courante = generation.current;
    setChargementSuite(true);
    try {
      const retour = await fetch(
        `/api/historique?${versParametres(filtres, lotsCharges + 1)}`,
      );
      if (!retour.ok) throw new Error("HISTORIQUE_INDISPONIBLE");
      const corps = (await retour.json()) as Reponse;
      if (courante !== generation.current) return;
      setEntrees((actuelles) => {
        // Un OFFSET peut répéter une entrée si la liste a changé entre deux lots.
        const connues = new Set(actuelles.map((ligne) => ligne.id));
        return [
          ...actuelles,
          ...corps.lignes.filter((ligne) => !connues.has(ligne.id)),
        ];
      });
      setLotsCharges((lots) => lots + 1);
    } catch {
      if (courante === generation.current)
        setErreur("Impossible de charger la suite de l’historique.");
    } finally {
      if (courante === generation.current) setChargementSuite(false);
    }
  }, [
    chargement,
    chargementSuite,
    entrees.length,
    total,
    filtres,
    lotsCharges,
  ]);

  /** Recharge les lots déjà affichés (après édition ou suppression), sans perdre la position. */
  const rafraichir = useCallback(async () => {
    const courante = generation.current;
    try {
      const lots = await Promise.all(
        Array.from({ length: Math.max(1, lotsCharges) }, async (_, indice) => {
          const retour = await fetch(
            `/api/historique?${versParametres(filtres, indice + 1)}`,
          );
          if (!retour.ok) throw new Error("HISTORIQUE_INDISPONIBLE");
          return (await retour.json()) as Reponse;
        }),
      );
      if (courante !== generation.current) return;
      setReponse(lots[0]);
      setEntrees(lots.flatMap((lot) => lot.lignes));
    } catch {
      setErreur("Impossible de charger l’historique.");
    }
  }, [filtres, lotsCharges]);

  const modifierFiltre = useCallback(
    (modification: Partial<Filtres>) =>
      setFiltres((actuels) => ({ ...actuels, ...modification })),
    [],
  );

  const definirAnnee = useCallback(
    (annee: string) => {
      setFiltres((actuels) => ({ ...actuels, anneeComptable: annee }));
      if (identifiantOrganisation)
        memoriserAnnee(identifiantOrganisation, annee);
    },
    [identifiantOrganisation],
  );

  const anneeComptable = config?.nomenclature?.anneeComptable;
  const anneesProposees = useMemo(() => {
    const { min, max } = reponse?.plageDates ?? {};
    if (!anneeComptable || !min || !max) return [];
    const debut = anneeComptableDebut(min, anneeComptable);
    const fin = anneeComptableDebut(max, anneeComptable);
    const annees: number[] = [];
    for (let annee = fin; annee >= debut; annee--) annees.push(annee);
    // L'année mémorisée reste proposée même si aucune entrée ne l'utilise.
    const choisie = Number(filtres.anneeComptable);
    if (choisie && !annees.includes(choisie)) annees.push(choisie);
    return annees.sort((a, b) => b - a);
  }, [anneeComptable, reponse?.plageDates, filtres.anneeComptable]);

  const trier = (colonne: ColonneTriHistorique) =>
    setFiltres((actuels) => ({
      ...actuels,
      tri: colonne,
      sens: actuels.tri === colonne && actuels.sens === "desc" ? "asc" : "desc",
    }));

  // TanStack Virtual n'est pas mémoïsable par React Compiler : le composant est simplement ignoré.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualiseur = useVirtualizer({
    count: entrees.length,
    getScrollElement: () => conteneur.current,
    estimateSize: () => HAUTEUR_LIGNE,
    overscan: 10,
  });
  const lignesVirtuelles = virtualiseur.getVirtualItems();
  const derniereVisible =
    lignesVirtuelles[lignesVirtuelles.length - 1]?.index ?? -1;

  // Approche de la fin des lignes chargées : demande le lot suivant.
  useEffect(() => {
    if (derniereVisible >= entrees.length - 20) void chargerSuite();
  }, [derniereVisible, entrees.length, chargerSuite]);

  if (!organisation) return <main className="p-6">Aucun groupe actif.</main>;

  const espaceHaut = lignesVirtuelles[0]?.start ?? 0;
  const espaceBas = lignesVirtuelles.length
    ? virtualiseur.getTotalSize() -
      (lignesVirtuelles[lignesVirtuelles.length - 1]?.end ?? 0)
    : 0;
  const nombreColonnes = COLONNES.length + (budgetActif ? 2 : 1);

  return (
    <main className="min-h-screen bg-zinc-50 p-4">
      {/* Mobile : le tableau n'est pas adapté aux petits écrans. */}
      <section className="mx-auto max-w-lg rounded-xl border border-zinc-200 bg-white p-6 lg:hidden">
        <Link href="/" className="text-sm text-[#1E3A8A]">
          ← Retour
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-900">
          Historique
        </h1>
        <p className="mt-3 text-zinc-600">
          L’historique n’est pas disponible sur mobile. Ouvrez cette page depuis
          un ordinateur pour le consulter.
        </p>
      </section>

      <section className="mx-auto hidden max-w-7xl rounded-xl border border-zinc-200 bg-white p-6 lg:block">
        <Link href="/" className="text-sm text-[#1E3A8A]">
          ← Retour
        </Link>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Historique</h1>
            <p className="mt-1 text-zinc-600">{organisation.name}</p>
          </div>
          {anneeComptable && actif && (
            <label className="text-sm font-medium text-zinc-700">
              Année comptable{" "}
              <select
                value={filtres.anneeComptable}
                onChange={(e) => definirAnnee(e.target.value)}
                className={`ml-2 ${classeChamp}`}
              >
                <option value="">Toutes</option>
                {anneesProposees.map((annee) => (
                  <option key={annee} value={annee}>
                    {libelleAnneeComptable(annee, anneeComptable)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {!configChargee ? (
          <p className="mt-5 text-sm text-zinc-600">Chargement…</p>
        ) : !actif ? (
          <p className="mt-5 text-sm text-zinc-600">
            L’historique n’est pas activé pour ce groupe. Un responsable peut
            l’activer dans les paramètres du groupe.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-zinc-500">
              Les justificatifs ne sont pas conservés : ils ont été envoyés par
              e-mail au trésorier.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher…"
                aria-label="Rechercher dans l’historique"
                className={`w-56 ${classeChamp}`}
              />
              <FiltreMultiple
                libelle="Filtrer par type"
                options={TYPES_HISTORIQUE.map((type) => ({
                  id: type,
                  libelle: LIBELLES_TYPES_HISTORIQUE[type],
                }))}
                valeur={filtres.type}
                onChange={(type) =>
                  modifierFiltre({ type: type as TypeHistorique[] | null })
                }
                libelleTous="Tous les types"
                libelleAucun="Aucun type"
                libelleNombre={(nombre) => `${nombre} types`}
              />
              <FiltreMultiple
                libelle="Filtrer par unité"
                options={(config?.units ?? []).map((unite) => ({
                  id: unite.id,
                  libelle: unite.label,
                  couleur: unite.color,
                }))}
                valeur={filtres.unite}
                onChange={(unite) => modifierFiltre({ unite })}
                libelleTous="Toutes les unités"
                libelleAucun="Aucune unité"
                libelleNombre={(nombre) => `${nombre} unités`}
              />
              {budgetActif && (
                <FiltreMultiple
                  libelle="Filtrer par poste budgétaire"
                  options={optionsPostes}
                  valeur={filtres.poste}
                  onChange={(poste) => modifierFiltre({ poste })}
                  libelleTous="Tous les postes"
                  libelleAucun="Aucun poste"
                  libelleNombre={(nombre) => `${nombre} postes`}
                />
              )}
              <label className="text-sm text-zinc-700">
                Du{" "}
                <input
                  type="date"
                  value={filtres.du}
                  onChange={(e) => modifierFiltre({ du: e.target.value })}
                  className={classeChamp}
                />
              </label>
              <label className="text-sm text-zinc-700">
                Au{" "}
                <input
                  type="date"
                  value={filtres.au}
                  onChange={(e) => modifierFiltre({ au: e.target.value })}
                  className={classeChamp}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setRecherche("");
                  // L'année comptable est conservée : elle a son propre sélecteur.
                  setFiltres((actuels) => ({
                    ...FILTRES_INITIAUX,
                    anneeComptable: actuels.anneeComptable,
                  }));
                }}
                className="text-sm text-zinc-600 underline"
              >
                Réinitialiser
              </button>
              <a
                href={`/api/historique/export?${versParametres(filtres, null)}`}
                className="ml-auto rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
              >
                Exporter en CSV
              </a>
            </div>

            {avisLien && (
              <p role="status" className="mt-4 text-sm text-zinc-700">
                {avisLien}
              </p>
            )}
            {erreur && (
              <p role="alert" className="mt-4 text-sm text-red-700">
                {erreur}
              </p>
            )}

            <div
              ref={conteneur}
              className="mt-4 max-h-[65vh] overflow-auto rounded-lg border border-zinc-200"
            >
              <table className="w-full table-fixed text-left text-sm text-zinc-900">
                <thead className="sticky top-0 z-10 bg-zinc-50 text-zinc-700">
                  <tr>
                    {COLONNES.map((colonne) => (
                      <th
                        key={colonne.cle}
                        scope="col"
                        aria-sort={
                          filtres.tri === colonne.cle
                            ? filtres.sens === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                        className={`px-3 py-2 font-semibold text-zinc-700 ${colonne.largeur} ${colonne.cle === "montant" ? "text-right" : ""}`}
                      >
                        <button
                          type="button"
                          onClick={() => trier(colonne.cle)}
                          className="inline-flex items-center gap-1 hover:text-zinc-900"
                        >
                          {colonne.libelle}
                          <span aria-hidden="true">
                            {filtres.tri === colonne.cle
                              ? filtres.sens === "asc"
                                ? "▲"
                                : "▼"
                              : ""}
                          </span>
                        </button>
                      </th>
                    ))}
                    {budgetActif && (
                      <th
                        scope="col"
                        className="w-48 px-3 py-2 font-semibold text-zinc-700"
                      >
                        Poste
                      </th>
                    )}
                    <th
                      scope="col"
                      className="px-3 py-2 font-semibold text-zinc-700"
                    >
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody
                  className={`divide-y divide-zinc-100 ${chargement ? "opacity-60" : ""}`}
                >
                  {espaceHaut > 0 && (
                    <tr aria-hidden="true" style={{ height: espaceHaut }}>
                      <td colSpan={nombreColonnes} className="p-0" />
                    </tr>
                  )}
                  {lignesVirtuelles.map((virtuelle) => {
                    const ligne = entrees[virtuelle.index];
                    return (
                      <tr
                        key={ligne.id}
                        ref={virtualiseur.measureElement}
                        data-index={virtuelle.index}
                        tabIndex={0}
                        onClick={() => setSelection(ligne)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelection(ligne);
                          }
                        }}
                        className="cursor-pointer hover:bg-zinc-50 focus:bg-zinc-50"
                      >
                        <td className="whitespace-nowrap px-3 py-2">
                          {formaterDateHistorique(ligne.date)}
                        </td>
                        <td className="px-3 py-2 text-zinc-700">
                          {ligne.reference ?? "-"}
                        </td>
                        <td className="px-3 py-2">
                          {LIBELLES_TYPES_HISTORIQUE[ligne.type]}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="h-3 w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: ligne.uniteCouleur }}
                            />
                            {ligne.uniteLabel}
                          </span>
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-2 text-right font-medium ${effetTresorerieHistorique(ligne.type, ligne.montantTotal) > 0 ? "text-emerald-700" : "text-zinc-900"}`}
                        >
                          {formaterEffetTresorerieHistorique(
                            ligne.type,
                            ligne.montantTotal,
                          )}
                        </td>
                        {budgetActif && (
                          <td className="px-3 py-2 text-zinc-700">
                            {ligne.posteId
                              ? ligne.posteLabel
                              : LIBELLE_NON_AFFECTE}
                          </td>
                        )}
                        <td className="max-w-sm px-3 py-2 text-zinc-600">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate">
                              {ligne.description}
                            </span>
                            {ligne.modifieLe && (
                              <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
                                modifié
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {espaceBas > 0 && (
                    <tr aria-hidden="true" style={{ height: espaceBas }}>
                      <td colSpan={nombreColonnes} className="p-0" />
                    </tr>
                  )}
                  {reponse && entrees.length === 0 && (
                    <tr>
                      <td
                        colSpan={nombreColonnes}
                        className="px-3 py-6 text-center text-zinc-500"
                      >
                        Aucune entrée.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {reponse && (
              <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-zinc-700">
                  <span>
                    {reponse.total} entrée{reponse.total > 1 ? "s" : ""}
                  </span>
                  <span>
                    Dépenses :{" "}
                    <strong>
                      {formaterMontantHistorique(reponse.totaux.depenses)}
                    </strong>
                  </span>
                  <span>
                    Recettes :{" "}
                    <strong>
                      {formaterMontantHistorique(reponse.totaux.recettes)}
                    </strong>
                  </span>
                  <span>
                    Solde :{" "}
                    <strong>
                      {formaterMontantHistorique(reponse.totaux.solde)}
                    </strong>
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {selection && (
        <DialogHistorique
          key={selection.id}
          entree={selection}
          responsable={reponse?.responsable ?? responsableLien ?? false}
          unites={config?.units ?? []}
          postes={budgetActif ? config?.postesBudgetaires : undefined}
          moyensPaiement={config?.parametres?.moyensPaiement ?? []}
          onFermer={() => setSelection(null)}
          onChange={() => {
            setSelection(null);
            void rafraichir();
          }}
        />
      )}
    </main>
  );
}
