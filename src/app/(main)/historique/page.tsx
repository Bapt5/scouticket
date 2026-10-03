"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DialogHistorique } from "@/components/DialogHistorique";
import { FiltreMultiple } from "@/components/FiltreMultiple";
import { clientAuth } from "@/lib/auth-client";
import type { UniteGroupe } from "@/lib/group";
import {
  LIBELLES_TYPES_HISTORIQUE,
  TYPES_HISTORIQUE,
  estRecetteHistorique,
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
  parametres?: { historiqueActif: boolean; moyensPaiement: string[] };
};

type Reponse = {
  lignes: LigneHistoriqueApi[];
  total: number;
  totaux: { depenses: number; recettes: number; solde: number };
  responsable: boolean;
  plageDates: { min: string | null; max: string | null };
};

interface Filtres {
  page: number;
  tri: ColonneTriHistorique;
  sens: "asc" | "desc";
  /** `null` = tous ; liste vide = aucun. */
  type: TypeHistorique[] | null;
  unite: string[] | null;
  du: string;
  au: string;
  anneeComptable: string;
  q: string;
}

const TAILLE_PAGE = 25;
const FILTRES_INITIAUX: Filtres = {
  page: 1,
  tri: "date",
  sens: "desc",
  type: null,
  unite: null,
  du: "",
  au: "",
  anneeComptable: "",
  q: "",
};

const COLONNES: { cle: ColonneTriHistorique; libelle: string }[] = [
  { cle: "date", libelle: "Date" },
  { cle: "reference", libelle: "Référence" },
  { cle: "type", libelle: "Type" },
  { cle: "unite", libelle: "Unité" },
  { cle: "montant", libelle: "Montant" },
];

const classeChamp =
  "rounded-lg border border-zinc-300 bg-white p-2 text-sm text-zinc-900 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400";

/** Clé locale de la dernière année comptable consultée, par groupe. */
const cleAnneeMemorisee = (identifiantOrganisation: string) =>
  `scouticket:historique:anneeComptable:${identifiantOrganisation}`;

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

/** Paramètres d'URL des filtres (sans pagination pour l'export). */
function versParametres(filtres: Filtres, avecPagination: boolean) {
  const parametres = new URLSearchParams();
  if (avecPagination) {
    parametres.set("page", String(filtres.page));
    parametres.set("taille", String(TAILLE_PAGE));
  }
  parametres.set("tri", filtres.tri);
  parametres.set("sens", filtres.sens);
  // Un paramètre vide signifie « aucune valeur retenue » (aucun résultat).
  if (filtres.type) parametres.set("type", filtres.type.join(","));
  if (filtres.unite) parametres.set("unite", filtres.unite.join(","));
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
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [selection, setSelection] = useState<LigneHistoriqueApi | null>(null);
  const [rechargement, setRechargement] = useState(0);
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
    setFiltres((actuels) => ({ ...actuels, anneeComptable: annee, page: 1 }));
    setAnneeRestauree(true);
  }, [identifiantOrganisation]);

  const actif = config?.parametres?.historiqueActif ?? false;

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
          actuels.q === recherche
            ? actuels
            : { ...actuels, q: recherche, page: 1 },
        ),
      300,
    );
    return () => clearTimeout(minuteur);
  }, [recherche]);

  useEffect(() => {
    if (!actif || !anneeRestauree) return;
    const annulation = new AbortController();
    setChargement(true);
    setErreur("");
    fetch(`/api/historique?${versParametres(filtres, true)}`, {
      signal: annulation.signal,
    })
      .then(async (retour) => {
        if (!retour.ok) throw new Error("HISTORIQUE_INDISPONIBLE");
        setReponse((await retour.json()) as Reponse);
      })
      .catch((erreurChargement: unknown) => {
        if ((erreurChargement as Error).name === "AbortError") return;
        setErreur("Impossible de charger l’historique.");
      })
      .finally(() => {
        if (!annulation.signal.aborted) setChargement(false);
      });
    return () => annulation.abort();
  }, [actif, anneeRestauree, filtres, rechargement]);

  const modifierFiltre = useCallback(
    (modification: Partial<Filtres>) =>
      setFiltres((actuels) => ({ ...actuels, ...modification, page: 1 })),
    [],
  );

  const definirAnnee = useCallback(
    (annee: string) => {
      setFiltres((actuels) => ({
        ...actuels,
        anneeComptable: annee,
        page: 1,
      }));
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
      page: 1,
    }));

  if (!organisation) return <main className="p-6">Aucun groupe actif.</main>;

  const nombrePages = reponse
    ? Math.max(1, Math.ceil(reponse.total / TAILLE_PAGE))
    : 1;

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
                href={`/api/historique/export?${versParametres(filtres, false)}`}
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

            <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200">
              <table className="w-full text-left text-sm text-zinc-900">
                <thead className="bg-zinc-50 text-zinc-700">
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
                        className={`px-3 py-2 font-semibold text-zinc-700 ${colonne.cle === "montant" ? "text-right" : ""}`}
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
                  {reponse?.lignes.map((ligne) => (
                    <tr
                      key={ligne.id}
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
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: ligne.uniteCouleur }}
                          />
                          {ligne.uniteLabel}
                        </span>
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2 text-right font-medium ${estRecetteHistorique(ligne.type) ? "text-emerald-700" : "text-zinc-900"}`}
                      >
                        {estRecetteHistorique(ligne.type) ? "+" : "-"}{" "}
                        {formaterMontantHistorique(ligne.montantTotal)}
                      </td>
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
                  ))}
                  {reponse && reponse.lignes.length === 0 && (
                    <tr>
                      <td
                        colSpan={COLONNES.length + 1}
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
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm">
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={filtres.page <= 1}
                    onClick={() =>
                      setFiltres((actuels) => ({
                        ...actuels,
                        page: actuels.page - 1,
                      }))
                    }
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                  >
                    Précédent
                  </button>
                  <span className="text-zinc-600">
                    Page {filtres.page} / {nombrePages}
                  </span>
                  <button
                    type="button"
                    disabled={filtres.page >= nombrePages}
                    onClick={() =>
                      setFiltres((actuels) => ({
                        ...actuels,
                        page: actuels.page + 1,
                      }))
                    }
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                  >
                    Suivant
                  </button>
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
          moyensPaiement={config?.parametres?.moyensPaiement ?? []}
          onFermer={() => setSelection(null)}
          onChange={() => {
            setSelection(null);
            setRechargement((valeur) => valeur + 1);
          }}
        />
      )}
    </main>
  );
}
