"use client";

import { useState, type ReactNode } from "react";

interface DialogConfirmationSaisieProps {
  readonly id: string;
  readonly titre: string;
  /** Explication des conséquences, affichée sous le titre. */
  readonly children: ReactNode;
  /** Mot à saisir à l'identique pour activer le bouton de confirmation. */
  readonly motConfirmation: string;
  readonly libelleConfirmation: string;
  readonly libelleEnCours: string;
  readonly enCours: boolean;
  readonly erreur?: string;
  /** Contenu supplémentaire sous l'erreur (ex. bouton « Se reconnecter »). */
  readonly pied?: ReactNode;
  readonly onConfirmer: () => void;
  readonly onFermer: () => void;
}

/**
 * Dialog de confirmation d'une action destructrice : il faut saisir un mot
 * pour la confirmer, et il ne peut pas être fermé pendant l'exécution.
 */
export function DialogConfirmationSaisie({
  id,
  titre,
  children,
  motConfirmation,
  libelleConfirmation,
  libelleEnCours,
  enCours,
  erreur,
  pied,
  onConfirmer,
  onFermer,
}: DialogConfirmationSaisieProps) {
  const [saisie, setSaisie] = useState("");
  const fermer = () => {
    if (!enCours) onFermer();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={fermer}
    >
      <div
        onClick={(evenement) => evenement.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl"
      >
        <h2 id={id} className="text-lg font-semibold text-zinc-900">
          {titre}
        </h2>
        <div className="mt-2 space-y-2 text-sm text-zinc-600">{children}</div>
        <p className="mt-2 text-sm text-zinc-600">
          Pour confirmer, saisissez <strong>{motConfirmation}</strong>{" "}
          ci-dessous.
        </p>
        <input
          value={saisie}
          onChange={(evenement) => setSaisie(evenement.target.value)}
          aria-label={`Saisissez ${motConfirmation} pour confirmer`}
          autoComplete="off"
          className="mt-4 w-full rounded-lg border border-zinc-300 bg-white p-3 text-zinc-900 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/20"
        />
        {erreur && <p className="mt-2 text-sm text-red-700">{erreur}</p>}
        {pied}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={saisie !== motConfirmation || enCours}
            onClick={onConfirmer}
            className="flex-1 rounded-lg bg-red-700 p-2 text-sm font-semibold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enCours ? libelleEnCours : libelleConfirmation}
          </button>
          <button
            type="button"
            disabled={enCours}
            onClick={fermer}
            className="flex-1 rounded-lg border border-zinc-300 p-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
