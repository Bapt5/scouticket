"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DetailPosteBudget } from "@/components/DetailPosteBudget";
import { EditeurPostesBudgetaires } from "@/components/EditeurPostesBudgetaires";
import { GraphiquesBudget } from "@/components/GraphiquesBudget";
import { PilotageBudget } from "@/components/PilotageBudget";
import { clientAuth } from "@/lib/auth-client";
import {
  DOMAINES_BUDGET,
  LIBELLES_DOMAINES_BUDGET,
  depasseBudget,
  soldeLigne,
  tauxRealisation,
  validerPostes,
  type DomaineBudget,
  type LigneSuiviBudget,
  type PosteBrouillon,
  type PosteBudgetaire,
} from "@/lib/budget";
import type { SelectionPoste } from "@/lib/budgetPilotage";
import type { UniteGroupe } from "@/lib/group";
import { analyserMontantSaisi } from "@/lib/depenses";
import { formaterMontantHistorique } from "@/lib/historique";
import {
  anneeComptableDebut,
  libelleAnneeComptable,
  type ParametresAnneeComptable,
} from "@/lib/nomenclature";
import type { ParametresGroupe } from "@/lib/parametresGroupe";

type Config = {
  isAdmin: boolean;
  units?: UniteGroupe[];
  postesBudgetaires?: {
    depense: PosteBudgetaire[];
    recette: PosteBudgetaire[];
  };
  parametres?: ParametresGroupe;
  nomenclature?: { anneeComptable: ParametresAnneeComptable };
};

type ReponseBudget = {
  anneeDebut: number;
  du: string;
  au: string;
  depense: LigneSuiviBudget[];
  recette: LigneSuiviBudget[];
  postes: PosteBrouillon[];
};

type OngletPrincipal = "tableau" | "pilotage";

const dateDuJourIso = () => {
  const maintenant = new Date();
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${maintenant.getFullYear()}-${deux(maintenant.getMonth() + 1)}-${deux(maintenant.getDate())}`;
};

const classeChamp =
  "rounded-lg border border-zinc-300 bg-white p-2 text-sm text-zinc-900 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400";

export default function PageSuiviBudgetaire() {
  const { data: organisation, isPending: organisationEnChargement } =
    clientAuth.useActiveOrganization();
  const [config, setConfig] = useState<Config | null>(null);
  const [configChargee, setConfigChargee] = useState(false);
  const [annee, setAnnee] = useState<number | null>(null);
  const [donnees, setDonnees] = useState<ReponseBudget | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");
  const [onglet, setOnglet] = useState<DomaineBudget>("depense");
  // Budgets saisis (texte), par id de poste.
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [enregistrementBudgets, setEnregistrementBudgets] = useState(false);
  const [gestionOuverte, setGestionOuverte] = useState(false);
  const [postesBrouillon, setPostesBrouillon] = useState<PosteBrouillon[]>([]);
  const [enregistrementPostes, setEnregistrementPostes] = useState(false);
  const [rechargement, setRechargement] = useState(0);
  const [ongletPrincipal, setOngletPrincipal] =
    useState<OngletPrincipal>("tableau");
  // Année précédente, chargée seulement pour la comparaison du pilotage.
  const [precedent, setPrecedent] = useState<ReponseBudget | null>(null);
  const [erreurPrecedent, setErreurPrecedent] = useState(false);
  const [posteOuvert, setPosteOuvert] = useState<SelectionPoste | null>(null);

  const actif = Boolean(config?.isAdmin && config.parametres?.budgetActif);
  const debutAnnee = config?.parametres?.anneeComptableDebut;
  const formatAnnee = config?.nomenclature?.anneeComptable.format;

  useEffect(() => {
    fetch("/api/group/config")
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((groupe: Config | null) => {
        setConfig(groupe);
        if (groupe?.parametres?.anneeComptableDebut)
          setAnnee(
            anneeComptableDebut(
              dateDuJourIso(),
              groupe.parametres.anneeComptableDebut,
            ),
          );
      })
      .catch(() => setErreur("Impossible de charger la configuration."))
      .finally(() => setConfigChargee(true));
  }, []);

  useEffect(() => {
    if (!actif || annee === null) return;
    const annulation = new AbortController();
    setChargement(true);
    setErreur("");
    fetch(`/api/budget?anneeComptable=${annee}`, { signal: annulation.signal })
      .then(async (retour) => {
        if (!retour.ok) throw new Error("BUDGET_INDISPONIBLE");
        const corps = (await retour.json()) as ReponseBudget;
        setDonnees(corps);
        setPostesBrouillon(corps.postes);
        setSaisies(
          Object.fromEntries(
            [...corps.depense, ...corps.recette]
              .filter((ligne) => ligne.id !== null)
              .map((ligne) => [
                ligne.id as string,
                ligne.budget === null ? "" : String(ligne.budget),
              ]),
          ),
        );
      })
      .catch((erreurChargement: unknown) => {
        if ((erreurChargement as Error).name === "AbortError") return;
        setErreur("Impossible de charger le suivi budgétaire.");
      })
      .finally(() => {
        if (!annulation.signal.aborted) setChargement(false);
      });
    return () => annulation.abort();
  }, [actif, annee, rechargement]);

  useEffect(() => {
    if (!actif || annee === null || ongletPrincipal !== "pilotage") return;
    const annulation = new AbortController();
    setPrecedent(null);
    setErreurPrecedent(false);
    fetch(`/api/budget?anneeComptable=${annee - 1}`, {
      signal: annulation.signal,
    })
      .then(async (retour) => {
        if (!retour.ok) throw new Error("PRECEDENT_INDISPONIBLE");
        setPrecedent((await retour.json()) as ReponseBudget);
      })
      .catch((erreurChargement: unknown) => {
        if ((erreurChargement as Error).name === "AbortError") return;
        setErreurPrecedent(true);
      });
    return () => annulation.abort();
  }, [actif, annee, ongletPrincipal]);

  const anneesProposees = useMemo(() => {
    if (annee === null || !debutAnnee) return [];
    const courante = anneeComptableDebut(dateDuJourIso(), debutAnnee);
    const debut = Math.min(annee, courante - 4);
    const fin = Math.max(annee, courante + 1);
    return Array.from({ length: fin - debut + 1 }, (_, i) => fin - i);
  }, [annee, debutAnnee]);

  const libelleAnnee = useCallback(
    (valeur: number) =>
      debutAnnee
        ? libelleAnneeComptable(valeur, {
            ...debutAnnee,
            format: formatAnnee ?? "debut-fin",
          })
        : String(valeur),
    [debutAnnee, formatAnnee],
  );

  const lignes = donnees?.[onglet] ?? [];
  // Budget en cours de saisie (reflété dans les totaux et les graphiques).
  const lignesAvecSaisie: LigneSuiviBudget[] = lignes.map((ligne) => {
    if (ligne.id === null) return ligne;
    const saisie = saisies[ligne.id];
    if (saisie === undefined || saisie.trim() === "")
      return { ...ligne, budget: null };
    const montant = analyserMontantSaisi(saisie);
    return Number.isFinite(montant) && montant >= 0
      ? { ...ligne, budget: montant }
      : ligne;
  });
  const saisieInvalide = Object.values(saisies).some((saisie) => {
    if (saisie.trim() === "") return false;
    const montant = analyserMontantSaisi(saisie);
    return !Number.isFinite(montant) || montant < 0;
  });
  const budgetsModifies = lignes.some(
    (ligne) =>
      ligne.id !== null &&
      (saisies[ligne.id] ?? "") !==
        (ligne.budget === null ? "" : String(ligne.budget)),
  );
  const totalBudget = lignesAvecSaisie.reduce(
    (somme, ligne) => somme + (ligne.budget ?? 0),
    0,
  );
  const totalRealise = lignesAvecSaisie.reduce(
    (somme, ligne) => somme + ligne.realise,
    0,
  );

  const ouvrirPoste = (ligne: LigneSuiviBudget) =>
    setPosteOuvert({ id: ligne.id, label: ligne.label, domaine: onglet });

  const enregistrerBudgets = async () => {
    if (annee === null || saisieInvalide) return;
    setEnregistrementBudgets(true);
    setMessage("");
    try {
      const reponse = await fetch("/api/budget/montants", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anneeComptable: annee,
          budgets: Object.entries(saisies).map(([posteId, saisie]) => ({
            posteId,
            montant: saisie.trim() === "" ? null : analyserMontantSaisi(saisie),
          })),
        }),
      });
      if (!reponse.ok) throw new Error("BUDGETS_NON_ENREGISTRES");
      setMessage("Budgets enregistrés.");
      setRechargement((valeur) => valeur + 1);
    } catch {
      setMessage("Impossible d’enregistrer les budgets. Réessayez.");
    } finally {
      setEnregistrementBudgets(false);
    }
  };

  const postesValides = validerPostes(postesBrouillon);
  const enregistrerPostes = async () => {
    if (!postesValides) return;
    setEnregistrementPostes(true);
    setMessage("");
    try {
      const reponse = await fetch("/api/budget/postes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postes: postesValides }),
      });
      if (!reponse.ok) throw new Error("POSTES_NON_ENREGISTRES");
      setMessage("Postes enregistrés.");
      setRechargement((valeur) => valeur + 1);
    } catch {
      setMessage("Impossible d’enregistrer les postes. Réessayez.");
    } finally {
      setEnregistrementPostes(false);
    }
  };

  if (organisationEnChargement)
    return (
      <main className="min-h-screen bg-zinc-50 p-6 text-center text-zinc-600">
        Chargement…
      </main>
    );
  if (!organisation)
    return (
      <main className="min-h-screen bg-zinc-50 p-6 text-center text-zinc-600">
        Aucun groupe actif.
      </main>
    );
  return (
    <main className="min-h-screen bg-zinc-50 p-4">
      {/* Mobile : les tableaux et graphiques ne sont pas adaptés aux petits écrans. */}
      <section className="mx-auto max-w-lg rounded-xl border border-zinc-200 bg-white p-6 lg:hidden">
        <Link href="/" className="text-sm text-[#1E3A8A]">
          ← Retour
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-900">
          Suivi budgétaire
        </h1>
        <p className="mt-3 text-zinc-600">
          Le suivi budgétaire n’est pas disponible sur mobile. Ouvrez cette page
          depuis un ordinateur pour le consulter.
        </p>
      </section>

      <section className="mx-auto hidden max-w-7xl rounded-xl border border-zinc-200 bg-white p-6 lg:block">
        <Link href="/" className="text-sm text-[#1E3A8A]">
          ← Retour
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-900">
          Suivi budgétaire
        </h1>
        <p className="mt-2 text-zinc-600">{organisation.name}</p>

        {!configChargee ? (
          <p className="mt-5 text-sm text-zinc-600">Chargement…</p>
        ) : !config?.isAdmin ? (
          <p className="mt-5 text-sm text-rose-600">
            Accès réservé aux responsables du groupe.
          </p>
        ) : !actif ? (
          <p className="mt-5 text-sm text-zinc-600">
            Le suivi budgétaire n’est pas activé pour ce groupe. Vous pouvez
            l’activer dans les{" "}
            <Link
              href="/parametres-groupe"
              className="underline text-[#1E3A8A]"
            >
              paramètres du groupe
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <label className="text-sm text-zinc-700">
                Année comptable{" "}
                <select
                  value={annee ?? ""}
                  onChange={(e) => setAnnee(Number(e.target.value))}
                  className={classeChamp}
                >
                  {anneesProposees.map((valeur) => (
                    <option key={valeur} value={valeur}>
                      {libelleAnnee(valeur)}
                    </option>
                  ))}
                </select>
              </label>
              <a
                href={`/api/budget/export?anneeComptable=${annee ?? ""}`}
                download
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
              >
                Exporter en CSV
              </a>
              {ongletPrincipal === "tableau" && (
                <button
                  type="button"
                  onClick={() => setGestionOuverte((ouvert) => !ouvert)}
                  aria-expanded={gestionOuverte}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
                >
                  Gérer les postes
                </button>
              )}
            </div>
            {donnees && (
              <p className="mt-2 text-xs text-zinc-500">
                Du {donnees.du.split("-").reverse().join("/")} au{" "}
                {donnees.au.split("-").reverse().join("/")}. Le réalisé est
                calculé à partir de l’historique.
              </p>
            )}

            <div
              role="tablist"
              aria-label="Vue du suivi budgétaire"
              className="mt-6 flex gap-2 border-b border-zinc-200"
            >
              {(
                [
                  ["tableau", "Tableau"],
                  ["pilotage", "Pilotage"],
                ] as const
              ).map(([valeur, libelle]) => (
                <button
                  key={valeur}
                  type="button"
                  role="tab"
                  aria-selected={ongletPrincipal === valeur}
                  onClick={() => setOngletPrincipal(valeur)}
                  className={`-mb-px rounded-t-lg border border-b-0 px-5 py-2 text-sm font-semibold ${
                    ongletPrincipal === valeur
                      ? "border-zinc-200 bg-white text-[#1E3A8A]"
                      : "border-transparent text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  {libelle}
                </button>
              ))}
            </div>

            {erreur && (
              <p role="alert" className="mt-4 text-sm text-rose-600">
                {erreur}
              </p>
            )}

            {ongletPrincipal === "pilotage" && donnees && annee !== null && (
              <PilotageBudget
                depense={donnees.depense}
                recette={donnees.recette}
                du={donnees.du}
                au={donnees.au}
                aujourdhui={dateDuJourIso()}
                libelleAnnee={libelleAnnee(annee)}
                libelleAnneePrecedente={libelleAnnee(annee - 1)}
                precedente={
                  precedent
                    ? { depense: precedent.depense, recette: precedent.recette }
                    : null
                }
                erreurPrecedente={erreurPrecedent}
                onOuvrirPoste={setPosteOuvert}
              />
            )}
            {ongletPrincipal === "pilotage" && !donnees && chargement && (
              <p className="mt-5 text-sm text-zinc-600">Chargement…</p>
            )}

            {ongletPrincipal === "tableau" && (
              <>
                {gestionOuverte && (
                  <div className="mt-4 space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                    <p className="text-sm text-zinc-600">
                      Supprimer un poste ne supprime pas ses écritures : elles
                      passent en « Non affecté » et peuvent être reclassées
                      depuis l’historique.
                    </p>
                    {DOMAINES_BUDGET.map((domaine) => (
                      <div key={domaine} className="space-y-2">
                        <h3 className="text-sm font-semibold text-zinc-900">
                          Postes de{" "}
                          {LIBELLES_DOMAINES_BUDGET[domaine].toLowerCase()}
                        </h3>
                        <EditeurPostesBudgetaires
                          domaine={domaine}
                          postes={postesBrouillon}
                          onChange={setPostesBrouillon}
                          desactive={enregistrementPostes}
                        />
                      </div>
                    ))}
                    {!postesValides && (
                      <p role="alert" className="text-sm text-rose-600">
                        Chaque poste doit avoir un nom unique (40 postes maximum
                        par type).
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={!postesValides || enregistrementPostes}
                      onClick={() => void enregistrerPostes()}
                      className="rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {enregistrementPostes
                        ? "Enregistrement…"
                        : "Enregistrer les postes"}
                    </button>
                  </div>
                )}

                <div
                  role="tablist"
                  aria-label="Type de poste"
                  className="mt-6 flex gap-2"
                >
                  {DOMAINES_BUDGET.map((domaine) => (
                    <button
                      key={domaine}
                      type="button"
                      role="tab"
                      aria-selected={onglet === domaine}
                      onClick={() => setOnglet(domaine)}
                      className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                        onglet === domaine
                          ? "bg-[#1E3A8A] text-white"
                          : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                      }`}
                    >
                      {LIBELLES_DOMAINES_BUDGET[domaine]}
                    </button>
                  ))}
                </div>

                <div
                  className={`mt-4 overflow-x-auto rounded-lg border border-zinc-200 ${chargement ? "opacity-60" : ""}`}
                >
                  <table className="w-full text-left text-sm text-zinc-900">
                    <thead className="bg-zinc-50 text-zinc-700">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-semibold">
                          Poste
                        </th>
                        <th scope="col" className="px-3 py-2 font-semibold">
                          Budget prévu (€)
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-right font-semibold"
                        >
                          Réalisé
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-right font-semibold"
                        >
                          {onglet === "depense" ? "Solde restant" : "Écart"}
                        </th>
                        <th scope="col" className="px-3 py-2 font-semibold">
                          Réalisation
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {lignesAvecSaisie.map((ligne) => {
                        const solde = soldeLigne(ligne, onglet);
                        const taux = tauxRealisation(ligne);
                        const depasse = depasseBudget(ligne);
                        return (
                          <tr
                            key={ligne.id ?? "non-affecte"}
                            tabIndex={0}
                            title="Voir les écritures de ce poste"
                            onClick={(evenement) => {
                              // Saisir un budget ne doit pas ouvrir le détail.
                              if (
                                (evenement.target as HTMLElement).closest(
                                  "input",
                                )
                              )
                                return;
                              ouvrirPoste(ligne);
                            }}
                            onKeyDown={(evenement) => {
                              if (evenement.target !== evenement.currentTarget)
                                return;
                              if (
                                evenement.key === "Enter" ||
                                evenement.key === " "
                              ) {
                                evenement.preventDefault();
                                ouvrirPoste(ligne);
                              }
                            }}
                            className="cursor-pointer hover:bg-zinc-50 focus:bg-zinc-50"
                          >
                            <th
                              scope="row"
                              className="px-3 py-2 text-left font-medium text-zinc-900"
                            >
                              {ligne.label}
                            </th>
                            <td className="px-3 py-2">
                              {ligne.id === null ? (
                                <span className="text-zinc-400">-</span>
                              ) : (
                                <input
                                  inputMode="decimal"
                                  value={saisies[ligne.id] ?? ""}
                                  aria-label={`Budget prévu pour ${ligne.label}`}
                                  onChange={(e) =>
                                    setSaisies((precedentes) => ({
                                      ...precedentes,
                                      [ligne.id as string]: e.target.value,
                                    }))
                                  }
                                  className={`w-28 ${classeChamp}`}
                                />
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right">
                              {formaterMontantHistorique(ligne.realise)}
                            </td>
                            <td
                              className={`whitespace-nowrap px-3 py-2 text-right font-medium ${
                                solde === null
                                  ? "text-zinc-400"
                                  : solde < 0 && onglet === "depense"
                                    ? "text-rose-700"
                                    : "text-zinc-900"
                              }`}
                            >
                              {solde === null
                                ? "-"
                                : formaterMontantHistorique(solde)}
                            </td>
                            <td className="min-w-40 px-3 py-2">
                              {taux === null ? (
                                <span className="text-zinc-400">-</span>
                              ) : (
                                <div className="space-y-1">
                                  <div
                                    role="progressbar"
                                    aria-label={`Réalisation de ${ligne.label}`}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={Math.max(
                                      0,
                                      Math.min(taux, 100),
                                    )}
                                    className="h-2 overflow-hidden rounded-full bg-zinc-200"
                                  >
                                    <div
                                      className={`h-full ${depasse && onglet === "depense" ? "bg-rose-600" : "bg-[#1E3A8A]"}`}
                                      style={{
                                        width: `${Math.max(0, Math.min(taux, 100))}%`,
                                      }}
                                    />
                                  </div>
                                  <p
                                    className={`text-xs ${depasse && onglet === "depense" ? "font-semibold text-rose-700" : "text-zinc-600"}`}
                                  >
                                    {String(taux).replace(".", ",")} %
                                    {depasse &&
                                      (onglet === "depense"
                                        ? " : budget dépassé"
                                        : " : objectif dépassé")}
                                  </p>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {lignesAvecSaisie.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-3 py-6 text-center text-zinc-500"
                          >
                            Aucun poste. Ajoutez-en avec « Gérer les postes ».
                          </td>
                        </tr>
                      )}
                    </tbody>
                    {lignesAvecSaisie.length > 0 && (
                      <tfoot className="bg-zinc-50 font-semibold text-zinc-900">
                        <tr>
                          <th scope="row" className="px-3 py-2 text-left">
                            Total
                          </th>
                          <td className="px-3 py-2">
                            {formaterMontantHistorique(totalBudget)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            {formaterMontantHistorique(totalRealise)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            {formaterMontantHistorique(
                              Math.round(
                                (onglet === "depense"
                                  ? totalBudget - totalRealise
                                  : totalRealise - totalBudget) * 100,
                              ) / 100,
                            )}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={
                      enregistrementBudgets ||
                      saisieInvalide ||
                      !budgetsModifies
                    }
                    onClick={() => void enregistrerBudgets()}
                    className="rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {enregistrementBudgets
                      ? "Enregistrement…"
                      : "Enregistrer les budgets"}
                  </button>
                  {saisieInvalide && (
                    <p role="alert" className="text-sm text-rose-600">
                      Saisissez des montants positifs.
                    </p>
                  )}
                  {message && (
                    <p role="status" className="text-sm text-zinc-600">
                      {message}
                    </p>
                  )}
                </div>

                {lignesAvecSaisie.length > 0 && (
                  <div className="mt-8">
                    <GraphiquesBudget lignes={lignesAvecSaisie} />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
      {posteOuvert && annee !== null && (
        <DetailPosteBudget
          poste={posteOuvert}
          annee={annee}
          libelleAnnee={libelleAnnee(annee)}
          unites={config?.units ?? []}
          postes={{
            depense: config?.postesBudgetaires?.depense ?? [],
            recette: config?.postesBudgetaires?.recette ?? [],
          }}
          moyensPaiement={config?.parametres?.moyensPaiement ?? []}
          onFermer={() => setPosteOuvert(null)}
          onChange={() => setRechargement((valeur) => valeur + 1)}
        />
      )}
    </main>
  );
}
