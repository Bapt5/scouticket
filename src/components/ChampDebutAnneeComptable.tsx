"use client";

import { erreurDebutAnneeComptable, joursMaxDuMois } from "@/lib/nomenclature";

export const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export interface DebutAnneeComptableSaisi {
  mois: number;
  /** `NaN` tant que le champ est vide. */
  jour: number;
}

interface ChampDebutAnneeComptableProps {
  readonly valeur: DebutAnneeComptableSaisi;
  readonly onChange: (valeur: DebutAnneeComptableSaisi) => void;
  readonly desactive?: boolean;
}

/** Début de l'année comptable (jour + mois), avec validation (pas de 29 février). */
export function ChampDebutAnneeComptable({
  valeur,
  onChange,
  desactive = false,
}: ChampDebutAnneeComptableProps) {
  const erreur = erreurDebutAnneeComptable(valeur.mois, valeur.jour);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-zinc-700">
        <span>Début le</span>
        <input
          type="number"
          min={1}
          max={joursMaxDuMois(valeur.mois)}
          disabled={desactive}
          aria-label="Jour de début de l'année comptable"
          aria-invalid={Boolean(erreur)}
          value={Number.isNaN(valeur.jour) ? "" : valeur.jour}
          onChange={(e) =>
            onChange({
              ...valeur,
              jour: e.target.value === "" ? Number.NaN : Number(e.target.value),
            })
          }
          className="w-20 rounded-lg border border-zinc-300 bg-white p-2 text-zinc-900"
        />
        <select
          disabled={desactive}
          aria-label="Mois de début de l'année comptable"
          value={valeur.mois}
          onChange={(e) => {
            const mois = Number(e.target.value);
            // Ramène le jour dans le mois choisi (ex. 31 → 28 en février).
            onChange({
              mois,
              jour: Math.min(valeur.jour, joursMaxDuMois(mois)),
            });
          }}
          className="rounded-lg border border-zinc-300 bg-white p-2 text-zinc-900"
        >
          {MOIS.map((mois, index) => (
            <option key={mois} value={index + 1}>
              {mois}
            </option>
          ))}
        </select>
      </div>
      {erreur ? (
        <p className="text-sm text-rose-600" role="alert">
          {erreur}
        </p>
      ) : (
        valeur.mois === 2 && (
          <p className="text-xs text-zinc-500">
            En février, le début ne peut pas dépasser le 28.
          </p>
        )
      )}
    </div>
  );
}
