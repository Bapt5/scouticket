"use client";

import { useEffect, useState } from "react";
import { DialogHistorique } from "@/components/DialogHistorique";
import {
  LIBELLES_DOMAINES_BUDGET,
  VALEUR_NON_AFFECTE,
  type PosteBudgetaire,
} from "@/lib/budget";
import type { SelectionPoste } from "@/lib/budgetPilotage";
import type { UniteGroupe } from "@/lib/group";
import {
  LIBELLES_TYPES_HISTORIQUE,
  estRecetteHistorique,
  formaterDateHistorique,
  formaterMontantHistorique,
  type LigneHistoriqueApi,
} from "@/lib/historique";

/** Nombre d'écritures affichées (les plus importantes d'abord). */
export const ECRITURES_AFFICHEES = 100;

interface DetailPosteBudgetProps {
  readonly poste: SelectionPoste;
  readonly annee: number;
  readonly libelleAnnee: string;
  readonly unites: readonly UniteGroupe[];
  readonly postes: {
    depense: readonly PosteBudgetaire[];
    recette: readonly PosteBudgetaire[];
  };
  readonly moyensPaiement: readonly string[];
  readonly onFermer: () => void;
  /** Appelé après une modification ou une suppression d'écriture (le suivi doit être rechargé). */
  readonly onChange: () => void;
}

type Resultat = { lignes: LigneHistoriqueApi[]; total: number };

/**
 * Écritures d'un poste pour l'année comptable, les plus importantes
 * d'abord. Un clic ouvre l'écriture pour la consulter, la corriger ou la
 * reclasser dans un autre poste (mêmes droits que l'historique).
 */
export function DetailPosteBudget({
  poste,
  annee,
  libelleAnnee,
  unites,
  postes,
  moyensPaiement,
  onFermer,
  onChange,
}: DetailPosteBudgetProps) {
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [erreur, setErreur] = useState(false);
  const [selection, setSelection] = useState<LigneHistoriqueApi | null>(null);
  const [rechargement, setRechargement] = useState(0);

  useEffect(() => {
    const annulation = new AbortController();
    const parametres = new URLSearchParams({
      poste: poste.id ?? VALEUR_NON_AFFECTE,
      anneeComptable: String(annee),
      // « Non affecté » existe dans les deux domaines : le type les départage.
      type: poste.domaine === "recette" ? "recette" : "depense,note-de-frais",
      tri: "montant",
      sens: "desc",
      page: "1",
      taille: String(ECRITURES_AFFICHEES),
    });
    setErreur(false);
    fetch(`/api/historique?${parametres}`, { signal: annulation.signal })
      .then(async (reponse) => {
        if (!reponse.ok) throw new Error("DETAIL_INDISPONIBLE");
        setResultat((await reponse.json()) as Resultat);
      })
      .catch((erreurChargement: unknown) => {
        if ((erreurChargement as Error).name === "AbortError") return;
        setErreur(true);
      });
    return () => annulation.abort();
  }, [poste.id, poste.domaine, annee, rechargement]);

  const total = resultat?.lignes.reduce(
    (somme, ligne) => somme + ligne.montantTotal,
    0,
  );

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titre-detail-poste"
        className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-900/40 p-4"
        onClick={onFermer}
      >
        <div
          onClick={(evenement) => evenement.stopPropagation()}
          className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="titre-detail-poste"
                className="text-lg font-semibold text-zinc-900"
              >
                {poste.label}
              </h2>
              <p className="text-sm text-zinc-600">
                {LIBELLES_DOMAINES_BUDGET[poste.domaine]}, année comptable{" "}
                {libelleAnnee}
              </p>
            </div>
            <button
              type="button"
              onClick={onFermer}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Fermer
            </button>
          </div>

          {erreur ? (
            <p role="alert" className="mt-4 text-sm text-rose-700">
              Impossible de charger les écritures de ce poste.
            </p>
          ) : !resultat ? (
            <p className="mt-4 text-sm text-zinc-600">Chargement…</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-zinc-600">
                {resultat.total === 0
                  ? "Aucune écriture pour ce poste sur cette année comptable."
                  : resultat.total > ECRITURES_AFFICHEES
                    ? `${resultat.total} écritures : les ${ECRITURES_AFFICHEES} plus importantes sont affichées.`
                    : `${resultat.total} écriture${resultat.total > 1 ? "s" : ""}, total ${formaterMontantHistorique(total ?? 0)}.`}
              </p>
              {resultat.lignes.length > 0 && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-200">
                  <table className="w-full text-left text-sm text-zinc-900">
                    <thead className="bg-zinc-50 text-zinc-700">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-semibold">
                          Date
                        </th>
                        <th scope="col" className="px-3 py-2 font-semibold">
                          Type
                        </th>
                        <th scope="col" className="px-3 py-2 font-semibold">
                          Unité
                        </th>
                        <th scope="col" className="px-3 py-2 font-semibold">
                          Description
                        </th>
                        <th
                          scope="col"
                          className="px-3 py-2 text-right font-semibold"
                        >
                          Montant
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {resultat.lignes.map((ligne) => (
                        <tr
                          key={ligne.id}
                          tabIndex={0}
                          title="Ouvrir cette écriture"
                          onClick={() => setSelection(ligne)}
                          onKeyDown={(evenement) => {
                            if (
                              evenement.key === "Enter" ||
                              evenement.key === " "
                            ) {
                              evenement.preventDefault();
                              setSelection(ligne);
                            }
                          }}
                          className="cursor-pointer hover:bg-zinc-50 focus:bg-zinc-50"
                        >
                          <td className="whitespace-nowrap px-3 py-2">
                            {formaterDateHistorique(ligne.date)}
                          </td>
                          <td className="px-3 py-2">
                            {LIBELLES_TYPES_HISTORIQUE[ligne.type]}
                          </td>
                          <td className="px-3 py-2">{ligne.uniteLabel}</td>
                          <td className="max-w-xs truncate px-3 py-2 text-zinc-600">
                            {ligne.description}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            {estRecetteHistorique(ligne.type) ? "+" : "-"}{" "}
                            {formaterMontantHistorique(ligne.montantTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {selection && (
        <DialogHistorique
          key={selection.id}
          entree={selection}
          responsable
          unites={unites}
          postes={postes}
          moyensPaiement={moyensPaiement}
          onFermer={() => setSelection(null)}
          onChange={() => {
            setSelection(null);
            setRechargement((valeur) => valeur + 1);
            onChange();
          }}
        />
      )}
    </>
  );
}
