"use client";

import { useEffect, useMemo, useState } from "react";
import type { CornerPoints } from "scanic";
import { EditeurCoins } from "@/components/EditeurCoins";
import {
  coinsParDefaut,
  estErreurAnnulation,
  extraireJustificatif,
} from "@/lib/scanJustificatif";

export type DecisionScan =
  | { readonly type: "fichier"; readonly fichier: File }
  | { readonly type: "original" }
  | { readonly type: "annule" };

interface ApercuScanProps {
  readonly fichierOriginal: File;
  readonly image: HTMLImageElement;
  /** Coins détectés automatiquement ; `null` si la détection a échoué. */
  readonly coinsDetectes: CornerPoints | null;
  readonly onDecision: (decision: DecisionScan) => void;
}

/** Aperçu du recadrage automatique, avec ajustement manuel des coins. */
export function ApercuScan({
  fichierOriginal,
  image,
  coinsDetectes,
  onDecision,
}: Readonly<ApercuScanProps>) {
  const [coins, setCoins] = useState<CornerPoints | null>(coinsDetectes);
  const [edition, setEdition] = useState(coinsDetectes === null);
  const [recadre, setRecadre] = useState<File | null>(null);
  const [chargement, setChargement] = useState(coinsDetectes !== null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [urlOriginal, setUrlOriginal] = useState<string | null>(null);
  const [urlRecadre, setUrlRecadre] = useState<string | null>(null);

  // Stable entre les rendus : l'éditeur de coins ne doit pas être recréé.
  const coinsEdition = useMemo(
    () => coins ?? coinsParDefaut(image),
    [coins, image],
  );

  useEffect(() => {
    const url = URL.createObjectURL(fichierOriginal);
    setUrlOriginal(url);
    return () => URL.revokeObjectURL(url);
  }, [fichierOriginal]);

  useEffect(() => {
    if (!recadre) {
      setUrlRecadre(null);
      return;
    }
    const url = URL.createObjectURL(recadre);
    setUrlRecadre(url);
    return () => URL.revokeObjectURL(url);
  }, [recadre]);

  useEffect(() => {
    if (!coins) return;
    const controleur = new AbortController();
    setChargement(true);
    setErreur(null);
    extraireJustificatif(image, coins, fichierOriginal.name, {
      signal: controleur.signal,
    })
      .then(setRecadre)
      .catch((e) => {
        if (estErreurAnnulation(e)) return;
        console.error("Erreur recadrage justificatif:", e);
        setRecadre(null);
        setErreur(
          "Le recadrage a échoué, ajustez les coins ou gardez l'original.",
        );
      })
      .finally(() => {
        if (!controleur.signal.aborted) setChargement(false);
      });
    return () => controleur.abort();
  }, [coins, image, fichierOriginal.name]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recadrage du justificatif"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
        <h3 className="mb-3 text-base font-semibold text-zinc-900">
          Recadrage du justificatif
        </h3>

        {!coins && (
          <p
            role="status"
            className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800"
          >
            Le justificatif n&apos;a pas pu être détecté automatiquement.
            Ajustez les coins pour le recadrer, ou gardez l&apos;image
            d&apos;origine.
          </p>
        )}

        {edition ? (
          <EditeurCoins
            image={image}
            coinsInitiaux={coinsEdition}
            onConfirm={(nouveauxCoins) => {
              setCoins(nouveauxCoins);
              setEdition(false);
            }}
            // Sans recadrage disponible, il reste l'original ou l'annulation.
            onCancel={() => setEdition(false)}
          />
        ) : (
          <>
            {erreur && (
              <p className="mb-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">
                {erreur}
              </p>
            )}
            <div className="flex min-h-40 items-center justify-center rounded-lg bg-zinc-100 p-2">
              {chargement ? (
                <p role="status" className="text-sm text-zinc-600">
                  Recadrage en cours…
                </p>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urlRecadre ?? urlOriginal ?? undefined}
                  alt={
                    urlRecadre
                      ? "Justificatif recadré"
                      : "Justificatif d'origine"
                  }
                  className="max-h-[50vh] w-auto max-w-full object-contain"
                />
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  recadre && onDecision({ type: "fichier", fichier: recadre })
                }
                disabled={!recadre || chargement}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                Utiliser le recadrage
              </button>
              <button
                type="button"
                onClick={() => setEdition(true)}
                disabled={chargement}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100 disabled:opacity-60"
              >
                Ajuster les coins
              </button>
              <button
                type="button"
                onClick={() => onDecision({ type: "original" })}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
              >
                Garder l&apos;original
              </button>
              <button
                type="button"
                onClick={() => onDecision({ type: "annule" })}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
              >
                Annuler
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
