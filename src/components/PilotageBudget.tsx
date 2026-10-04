"use client";

import { useMemo, useState } from "react";
import {
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { GraphiqueComparaison } from "@/components/GraphiquesPilotage";
import {
  DOMAINES_BUDGET,
  LIBELLES_DOMAINES_BUDGET,
  type DomaineBudget,
  type LigneSuiviBudget,
} from "@/lib/budget";
import {
  avancementAnnee,
  comparerAvecPrecedente,
  postesASurveiller,
  synthese,
  type SelectionPoste,
  type TotauxPilotage,
} from "@/lib/budgetPilotage";
import { formaterMontantHistorique } from "@/lib/historique";

const formaterEcart = (ecart: number) =>
  `${ecart > 0 ? "+" : ""}${formaterMontantHistorique(ecart)}`;
const formaterTaux = (taux: number) => `${String(taux).replace(".", ",")} %`;

interface PilotageBudgetProps {
  readonly depense: readonly LigneSuiviBudget[];
  readonly recette: readonly LigneSuiviBudget[];
  /** Bornes de l'année comptable affichée (AAAA-MM-JJ). */
  readonly du: string;
  readonly au: string;
  /** Date du jour (AAAA-MM-JJ), pour l'avancement de l'année. */
  readonly aujourdhui: string;
  readonly libelleAnnee: string;
  readonly libelleAnneePrecedente: string;
  /** Année précédente : `null` tant qu'elle charge ou si elle est indisponible. */
  readonly precedente: {
    depense: readonly LigneSuiviBudget[];
    recette: readonly LigneSuiviBudget[];
  } | null;
  readonly erreurPrecedente: boolean;
  readonly onOuvrirPoste: (poste: SelectionPoste) => void;
}

function CarteSynthese({
  titre,
  totaux,
  avecBudgets,
  favorableSiPositif = true,
}: {
  readonly titre: string;
  readonly totaux: TotauxPilotage;
  readonly avecBudgets: boolean;
  readonly favorableSiPositif?: boolean;
}) {
  const favorable = totaux.ecart >= 0 === favorableSiPositif;
  const Icone = totaux.ecart >= 0 ? ArrowTrendingUpIcon : ArrowTrendingDownIcon;
  return (
    <section
      aria-label={titre}
      className="rounded-xl border border-zinc-200 bg-white p-4"
    >
      <h3 className="text-sm font-semibold text-zinc-700">{titre}</h3>
      <dl className="mt-2 space-y-1 text-sm text-zinc-700">
        <div className="flex justify-between gap-2">
          <dt>Prévu</dt>
          <dd className="font-medium text-zinc-900">
            {avecBudgets ? formaterMontantHistorique(totaux.prevu) : "-"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Réalisé</dt>
          <dd className="text-lg font-semibold text-zinc-900">
            {formaterMontantHistorique(totaux.realise)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Écart</dt>
          <dd
            className={`inline-flex items-center gap-1 font-medium ${favorable ? "text-emerald-800" : "text-rose-700"}`}
          >
            {avecBudgets ? (
              <>
                <Icone className="h-4 w-4" aria-hidden="true" />
                {formaterEcart(totaux.ecart)}
                <span className="font-normal">
                  ({favorable ? "favorable" : "défavorable"})
                </span>
              </>
            ) : (
              "-"
            )}
          </dd>
        </div>
        {totaux.taux !== null && (
          <div className="flex justify-between gap-2">
            <dt>Réalisé / prévu</dt>
            <dd className="text-zinc-900">{formaterTaux(totaux.taux)}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function Jauge({
  id,
  libelle,
  valeur,
  pourcentage,
  avancement,
  alerte = false,
}: {
  readonly id: string;
  readonly libelle: string;
  /** Texte de la valeur (accessible, indépendant de la barre). */
  readonly valeur: string;
  readonly pourcentage: number | null;
  readonly avancement?: number | null;
  readonly alerte?: boolean;
}) {
  const largeur = Math.min(Math.max(pourcentage ?? 0, 0), 100);
  return (
    <div>
      <div className="flex justify-between gap-2 text-sm">
        <span id={id} className="font-medium text-zinc-800">
          {libelle}
        </span>
        <span className="text-zinc-700">{valeur}</span>
      </div>
      <div className="relative mt-1">
        <div
          role="progressbar"
          aria-labelledby={id}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(largeur)}
          aria-valuetext={valeur}
          className="h-3 overflow-hidden rounded-full bg-zinc-200"
        >
          <div
            className={`h-full ${alerte ? "bg-rose-600" : "bg-[#1E3A8A]"}`}
            style={{ width: `${largeur}%` }}
          />
        </div>
        {avancement !== null && avancement !== undefined && (
          <div
            aria-hidden="true"
            title={`Avancement de l'année : ${formaterTaux(avancement)}`}
            className="absolute -top-1 h-5 w-0.5 bg-zinc-900"
            style={{ left: `${Math.min(Math.max(avancement, 0), 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}

const suffixeDomaine = (domaine: DomaineBudget) =>
  domaine === "depense" ? "dépense" : "recette";

/** Vue de pilotage : résultat prévu et réalisé, avancement, postes à surveiller, comparaison N-1. */
export function PilotageBudget({
  depense,
  recette,
  du,
  au,
  aujourdhui,
  libelleAnnee,
  libelleAnneePrecedente,
  precedente,
  erreurPrecedente,
  onOuvrirPoste,
}: PilotageBudgetProps) {
  const [domaineComparaison, setDomaineComparaison] =
    useState<DomaineBudget>("depense");
  const bilan = useMemo(() => synthese(depense, recette), [depense, recette]);
  const avancement = avancementAnnee(du, au, aujourdhui);
  const aSurveiller = useMemo(
    () => postesASurveiller(depense, recette, avancement),
    [depense, recette, avancement],
  );
  const comparaison = useMemo(
    () =>
      comparerAvecPrecedente(
        domaineComparaison === "depense" ? depense : recette,
        precedente
          ? domaineComparaison === "depense"
            ? precedente.depense
            : precedente.recette
          : null,
      ),
    [domaineComparaison, depense, recette, precedente],
  );

  return (
    <div className="mt-6 space-y-6">
      {!bilan.aDesBudgets && (
        <p
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Aucun budget n’est saisi pour cette année comptable : saisissez-les
          dans l’onglet Tableau pour comparer le prévu au réalisé.
        </p>
      )}
      {bilan.aDesBudgets && bilan.postesSansBudget > 0 && (
        <p className="text-sm text-zinc-600">
          {bilan.postesSansBudget} poste
          {bilan.postesSansBudget > 1 ? "s" : ""} sans budget saisi (prévu
          compté pour 0 dans le résultat prévu).
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <CarteSynthese
          titre="Recettes"
          totaux={bilan.recettes}
          avecBudgets={bilan.aDesBudgets}
        />
        <CarteSynthese
          titre="Dépenses"
          totaux={bilan.depenses}
          avecBudgets={bilan.aDesBudgets}
        />
        <section
          aria-label="Résultat"
          className="rounded-xl border-2 border-[#1E3A8A] bg-white p-4"
        >
          <h3 className="text-sm font-semibold text-zinc-700">
            Résultat (recettes moins dépenses)
          </h3>
          <dl className="mt-2 space-y-1 text-sm text-zinc-700">
            <div className="flex justify-between gap-2">
              <dt>Prévu</dt>
              <dd className="font-medium text-zinc-900">
                {bilan.aDesBudgets
                  ? formaterMontantHistorique(bilan.resultat.prevu)
                  : "-"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Réalisé</dt>
              <dd
                className={`inline-flex items-center gap-1 text-lg font-semibold ${bilan.resultat.realise < 0 ? "text-rose-700" : "text-zinc-900"}`}
              >
                {bilan.resultat.realise < 0 && (
                  <ExclamationTriangleIcon
                    className="h-5 w-5"
                    aria-hidden="true"
                  />
                )}
                {formaterMontantHistorique(bilan.resultat.realise)}
                {bilan.resultat.realise < 0 && (
                  <span className="text-sm font-medium">(déficit)</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Écart</dt>
              <dd
                className={`font-medium ${bilan.resultat.ecart >= 0 ? "text-emerald-800" : "text-rose-700"}`}
              >
                {bilan.aDesBudgets
                  ? `${formaterEcart(bilan.resultat.ecart)} (${bilan.resultat.ecart >= 0 ? "favorable" : "défavorable"})`
                  : "-"}
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <p className="text-xs text-zinc-500">
        Un écart est favorable quand il améliore le résultat : plus de recettes
        ou moins de dépenses que prévu.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="titre-avancement"
          className="rounded-xl border border-zinc-200 bg-white p-4"
        >
          <h3
            id="titre-avancement"
            className="text-base font-semibold text-zinc-900"
          >
            Avancement
          </h3>
          <div className="mt-3 space-y-4">
            <Jauge
              id="jauge-annee"
              libelle="Année comptable écoulée"
              valeur={avancement === null ? "-" : formaterTaux(avancement)}
              pourcentage={avancement}
            />
            <Jauge
              id="jauge-depenses"
              libelle="Budget de dépenses consommé"
              valeur={
                bilan.depenses.taux === null
                  ? "Aucun budget de dépenses saisi"
                  : `${formaterTaux(bilan.depenses.taux)} (${formaterMontantHistorique(bilan.depenses.realise)} sur ${formaterMontantHistorique(bilan.depenses.prevu)})`
              }
              pourcentage={bilan.depenses.taux}
              avancement={avancement}
              alerte={(bilan.depenses.taux ?? 0) > 100}
            />
            <Jauge
              id="jauge-recettes"
              libelle="Objectif de recettes atteint"
              valeur={
                bilan.recettes.taux === null
                  ? "Aucun objectif de recettes saisi"
                  : `${formaterTaux(bilan.recettes.taux)} (${formaterMontantHistorique(bilan.recettes.realise)} sur ${formaterMontantHistorique(bilan.recettes.prevu)})`
              }
              pourcentage={bilan.recettes.taux}
              avancement={avancement}
            />
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Le trait noir marque l’avancement de l’année comptable.
          </p>
        </section>

        <section
          aria-labelledby="titre-surveiller"
          className="rounded-xl border border-zinc-200 bg-white p-4"
        >
          <h3
            id="titre-surveiller"
            className="text-base font-semibold text-zinc-900"
          >
            Postes à surveiller
          </h3>
          {aSurveiller.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">Rien à signaler.</p>
          ) : (
            <ul className="mt-3 divide-y divide-zinc-100">
              {aSurveiller.map((poste) => (
                <li key={`${poste.domaine}-${poste.id}`}>
                  <button
                    type="button"
                    onClick={() =>
                      onOuvrirPoste({
                        id: poste.id,
                        label: poste.label,
                        domaine: poste.domaine,
                      })
                    }
                    className="flex w-full items-start justify-between gap-3 py-2 text-left text-sm hover:bg-zinc-50"
                  >
                    <span>
                      <span className="block font-medium text-zinc-900">
                        {poste.label}{" "}
                        <span className="font-normal text-zinc-600">
                          ({suffixeDomaine(poste.domaine)})
                        </span>
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 ${poste.statut === "a-surveiller" ? "text-amber-800" : "text-rose-700"}`}
                      >
                        <ExclamationTriangleIcon
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
                        {poste.libelleStatut}
                      </span>
                    </span>
                    <span className="text-right text-zinc-700">
                      {formaterMontantHistorique(poste.realise)} sur{" "}
                      {formaterMontantHistorique(poste.budget)}
                      {poste.taux !== null && (
                        <span className="block">
                          {formaterTaux(poste.taux)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-zinc-500">
            Dépenses : budget dépassé, ou consommé à 80 % et plus. Recettes :
            plus de 20 points de retard sur l’avancement de l’année.
          </p>
        </section>
      </div>

      <section
        aria-labelledby="titre-comparaison"
        className="rounded-xl border border-zinc-200 bg-white p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3
            id="titre-comparaison"
            className="text-base font-semibold text-zinc-900"
          >
            Comparaison avec {libelleAnneePrecedente}
          </h3>
          <div
            role="tablist"
            aria-label="Type de poste comparé"
            className="flex gap-2"
          >
            {DOMAINES_BUDGET.map((domaine) => (
              <button
                key={domaine}
                type="button"
                role="tab"
                aria-selected={domaineComparaison === domaine}
                onClick={() => setDomaineComparaison(domaine)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  domaineComparaison === domaine
                    ? "bg-[#1E3A8A] text-white"
                    : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                {LIBELLES_DOMAINES_BUDGET[domaine]}
              </button>
            ))}
          </div>
        </div>
        {erreurPrecedente ? (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            Comparaison indisponible : l’année {libelleAnneePrecedente} n’a pas
            pu être chargée.
          </p>
        ) : !precedente ? (
          <p className="mt-3 text-sm text-zinc-600">Chargement…</p>
        ) : comparaison.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">Aucun poste.</p>
        ) : (
          <div className="mt-3 grid gap-6 lg:grid-cols-2">
            <GraphiqueComparaison
              lignes={comparaison}
              libelleAnnee={libelleAnnee}
              libelleAnneePrecedente={libelleAnneePrecedente}
            />
            <table className="h-fit w-full text-left text-sm text-zinc-900">
              <caption className="sr-only">
                Réalisé de {libelleAnnee} comparé à {libelleAnneePrecedente}
              </caption>
              <thead className="bg-zinc-50 text-zinc-700">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Poste
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-right font-semibold"
                  >
                    {libelleAnnee}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-right font-semibold"
                  >
                    {libelleAnneePrecedente}
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-right font-semibold"
                  >
                    Évolution
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {comparaison.map((ligne) => (
                  <tr key={ligne.id ?? "non-affecte"}>
                    <th
                      scope="row"
                      className="px-3 py-2 text-left font-medium text-zinc-900"
                    >
                      {ligne.label}
                    </th>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {formaterMontantHistorique(ligne.realise)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {ligne.realisePrecedent === null
                        ? "-"
                        : formaterMontantHistorique(ligne.realisePrecedent)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-zinc-700">
                      {ligne.evolution === null
                        ? "-"
                        : `${formaterEcart(ligne.evolution)}${
                            ligne.evolutionPourcentage === null
                              ? ""
                              : ` (${ligne.evolutionPourcentage > 0 ? "+" : ""}${formaterTaux(ligne.evolutionPourcentage)})`
                          }`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
