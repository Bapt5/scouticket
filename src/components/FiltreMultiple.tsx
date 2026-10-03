"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  MinusIcon,
} from "@heroicons/react/24/outline";

export interface OptionFiltre {
  readonly id: string;
  readonly libelle: string;
  /** Pastille de couleur facultative (ex. couleur d'une unité). */
  readonly couleur?: string;
}

interface FiltreMultipleProps {
  readonly libelle: string;
  readonly options: readonly OptionFiltre[];
  /** Identifiants retenus ; `null` = aucune restriction (tout est sélectionné). */
  readonly valeur: readonly string[] | null;
  readonly onChange: (valeur: string[] | null) => void;
  readonly libelleTous: string;
  readonly libelleAucun: string;
  readonly libelleNombre: (nombre: number) => string;
}

/**
 * Filtre à sélection multiple avec « Tout sélectionner » (même principe que
 * la gestion des accès aux unités d'un membre). Tout sélectionner équivaut à
 * ne pas filtrer ; tout désélectionner ne laisse aucun résultat.
 */
export function FiltreMultiple({
  libelle,
  options,
  valeur,
  onChange,
  libelleTous,
  libelleAucun,
  libelleNombre,
}: FiltreMultipleProps) {
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const fermerSiExterieur = (evenement: MouseEvent) => {
      if (!conteneur.current?.contains(evenement.target as Node))
        setOuvert(false);
    };
    const fermerAvecEchap = (evenement: KeyboardEvent) => {
      if (evenement.key === "Escape") setOuvert(false);
    };
    document.addEventListener("mousedown", fermerSiExterieur);
    document.addEventListener("keydown", fermerAvecEchap);
    return () => {
      document.removeEventListener("mousedown", fermerSiExterieur);
      document.removeEventListener("keydown", fermerAvecEchap);
    };
  }, [ouvert]);

  const selection = new Set(valeur ?? options.map((option) => option.id));
  const nombre = options.filter((option) => selection.has(option.id)).length;
  const etat =
    nombre === options.length ? "toutes" : nombre === 0 ? "aucune" : "partiel";

  // Toutes les options retenues : on ne filtre pas du tout.
  const appliquer = (ids: Set<string>) =>
    onChange(
      options.every((option) => ids.has(option.id))
        ? null
        : options.map((option) => option.id).filter((id) => ids.has(id)),
    );

  const basculer = (id: string) => {
    const suivante = new Set(selection);
    if (suivante.has(id)) suivante.delete(id);
    else suivante.add(id);
    appliquer(suivante);
  };

  // Majorité déjà cochée : on décoche tout, sinon on sélectionne tout.
  const basculerTout = () =>
    appliquer(
      nombre > options.length / 2
        ? new Set()
        : new Set(options.map((option) => option.id)),
    );

  const resume =
    etat === "toutes"
      ? libelleTous
      : etat === "aucune"
        ? libelleAucun
        : nombre === 1
          ? (options.find((option) => selection.has(option.id))?.libelle ??
            libelleNombre(1))
          : libelleNombre(nombre);

  return (
    <div ref={conteneur} className="relative">
      <button
        type="button"
        aria-label={libelle}
        aria-haspopup="true"
        aria-expanded={ouvert}
        onClick={() => setOuvert((precedent) => !precedent)}
        className="flex items-center gap-2 rounded-lg border border-zinc-300 bg-white p-2 text-sm text-zinc-900 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400"
      >
        <span className="max-w-40 truncate">{resume}</span>
        <ChevronDownIcon
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-zinc-500"
        />
      </button>
      {ouvert && (
        <div
          role="group"
          aria-label={libelle}
          className="absolute left-0 z-20 mt-1 max-h-80 w-72 space-y-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2 text-zinc-900 shadow-xl"
        >
          <button
            type="button"
            role="checkbox"
            aria-checked={etat === "partiel" ? "mixed" : etat === "toutes"}
            onClick={basculerTout}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed border-zinc-300 p-2 text-left text-sm text-zinc-600 transition-colors hover:border-[#1E3A8A] hover:bg-blue-50"
          >
            <span className="min-w-0 flex-1 truncate font-medium">
              Tout sélectionner
            </span>
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                etat === "aucune"
                  ? "border-zinc-400"
                  : "border-zinc-600 bg-zinc-600"
              }`}
            >
              {etat === "partiel" && (
                <MinusIcon className="h-3.5 w-3.5 text-white" />
              )}
              {etat === "toutes" && (
                <CheckIcon className="h-3.5 w-3.5 text-white" />
              )}
            </span>
          </button>
          {options.map((option) => {
            const retenue = selection.has(option.id);
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={retenue}
                onClick={() => basculer(option.id)}
                className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left text-sm transition-colors ${
                  retenue
                    ? "border-[#1E3A8A] bg-blue-50"
                    : "border-zinc-200 hover:bg-zinc-50"
                }`}
              >
                {option.couleur && (
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: option.couleur }}
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-zinc-800">
                  {option.libelle}
                </span>
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    retenue
                      ? "border-[#1E3A8A] bg-[#1E3A8A]"
                      : "border-zinc-300"
                  }`}
                >
                  {retenue && <CheckIcon className="h-3.5 w-3.5 text-white" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
