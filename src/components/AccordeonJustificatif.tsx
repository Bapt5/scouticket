"use client";

import type { ReactNode } from "react";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ExclamationCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

interface AccordeonJustificatifProps {
  readonly id: string;
  readonly titre: string;
  readonly sousTitre: string;
  readonly vignette: ReactNode;
  readonly total: number;
  readonly complet: boolean;
  readonly ouvert: boolean;
  readonly onBasculer: () => void;
  readonly onSupprimer?: () => void;
  readonly children: ReactNode;
}

// Un justificatif = une section repliable : on ne saisit qu'un justificatif
// à la fois, l'état (complet / à compléter) reste visible dans l'en-tête.
export function AccordeonJustificatif({
  id,
  titre,
  sousTitre,
  vignette,
  total,
  complet,
  ouvert,
  onBasculer,
  onSupprimer,
  children,
}: AccordeonJustificatifProps) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50">
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={onBasculer}
          aria-expanded={ouvert}
          aria-controls={`${id}-contenu`}
          className="flex flex-1 min-w-0 items-center gap-3 text-left"
        >
          {vignette}
          <span className="flex-1 min-w-0">
            <span className="block truncate text-sm font-medium text-zinc-900">
              {titre}
            </span>
            <span className="block text-xs text-zinc-500">{sousTitre}</span>
          </span>
          <span className="flex flex-col items-end gap-0.5 text-xs">
            <span className="text-sm font-semibold text-zinc-900">
              {total.toFixed(2)} €
            </span>
            {complet ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircleIcon className="w-4 h-4" aria-hidden="true" />
                Complet
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <ExclamationCircleIcon className="w-4 h-4" aria-hidden="true" />
                À compléter
              </span>
            )}
          </span>
          <ChevronDownIcon
            className={`w-5 h-5 text-zinc-500 transition-transform ${ouvert ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
        {onSupprimer && (
          <button
            type="button"
            onClick={onSupprimer}
            className="p-2 rounded-md text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition-colors"
            aria-label={`Supprimer ${titre}`}
          >
            <TrashIcon className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
      </div>
      <div
        id={`${id}-contenu`}
        role="region"
        aria-label={titre}
        hidden={!ouvert}
        className="space-y-4 border-t border-zinc-200 p-3"
      >
        {children}
      </div>
    </div>
  );
}
