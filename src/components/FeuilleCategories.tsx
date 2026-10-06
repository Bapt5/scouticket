"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { CategorieComptable } from "@/constants/configDepenses";

interface FeuilleCategoriesProps {
  readonly libelle: string;
  readonly valeur: string;
  readonly recherche: string;
  readonly onRecherche: (recherche: string) => void;
  /** Catégories déjà filtrées par la recherche. */
  readonly resultats: readonly CategorieComptable[];
  readonly onChoisir: (categorie: string) => void;
  readonly onFermer: () => void;
}

// Feuille plein écran (téléphone) : recherche + liste pleine largeur. La page
// ne défile plus derrière tant qu'elle est montée, Échap la ferme.
export function FeuilleCategories({
  libelle,
  valeur,
  recherche,
  onRecherche,
  resultats,
  onChoisir,
  onFermer,
}: FeuilleCategoriesProps) {
  useEffect(() => {
    const overflowInitial = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const surEchap = (evenement: KeyboardEvent) => {
      if (evenement.key === "Escape") onFermer();
    };
    document.addEventListener("keydown", surEchap);
    return () => {
      document.body.style.overflow = overflowInitial;
      document.removeEventListener("keydown", surEchap);
    };
  }, [onFermer]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={libelle}
      className="fixed inset-0 z-50 flex h-dvh flex-col bg-white"
    >
      <div className="flex items-center gap-2 border-b border-zinc-200 p-3">
        <input
          type="text"
          autoFocus
          autoComplete="off"
          aria-label="Rechercher une catégorie"
          placeholder="Rechercher une catégorie…"
          value={recherche}
          onChange={(evenement) => onRecherche(evenement.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white p-3 text-zinc-900 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400"
        />
        <button
          type="button"
          onClick={onFermer}
          aria-label="Fermer"
          className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100"
        >
          <XMarkIcon className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
      <ul
        role="listbox"
        aria-label={libelle}
        className="flex-1 overflow-y-auto overscroll-contain"
      >
        {resultats.length === 0 && (
          <li className="p-4 text-sm text-zinc-500">
            Aucune catégorie trouvée
          </li>
        )}
        {resultats.map((categorie) => {
          const choisie = categorie.libelle === valeur;
          return (
            <li
              key={categorie.libelle}
              role="option"
              aria-selected={choisie}
              onClick={() => onChoisir(categorie.libelle)}
              className={`flex min-h-12 cursor-pointer items-start gap-3 border-b border-zinc-100 px-4 py-3 ${
                choisie ? "bg-zinc-100" : ""
              }`}
            >
              <span className="flex-1">
                <span className="block text-base font-medium text-zinc-900">
                  {categorie.libelle}
                </span>
                {categorie.description && (
                  <span className="block text-sm text-zinc-500">
                    {categorie.description}
                  </span>
                )}
              </span>
              {choisie && (
                <CheckIcon
                  className="mt-1 h-5 w-5 text-zinc-700"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>,
    document.body,
  );
}
