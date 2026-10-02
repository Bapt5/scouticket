"use client";

import { useState } from "react";

interface TauxKilometreProps {
  readonly taux: number;
  /** Date (AAAA-MM-JJ) de dernière mise à jour du taux. */
  readonly misAJourLe: string;
  readonly desactive?: boolean;
  readonly onChange: (taux: number) => void;
}

function formaterDate(dateIso: string): string {
  const [annee, mois, jour] = dateIso.split("-");
  return `${jour}/${mois}/${annee.slice(2)}`;
}

/** Champ du taux du kilomètre (€ / km), enregistré à la validation du champ. */
export function TauxKilometre({
  taux,
  misAJourLe,
  desactive = false,
  onChange,
}: Readonly<TauxKilometreProps>) {
  const [saisie, setSaisie] = useState(String(taux).replace(".", ","));
  const valeur = Number(saisie.replace(",", "."));
  const valide =
    saisie.trim() !== "" &&
    Number.isFinite(valeur) &&
    valeur > 0 &&
    valeur <= 5 &&
    Math.round(valeur * 10000) / 10000 === valeur;

  const valider = () => {
    if (valide && valeur !== taux) onChange(valeur);
  };

  return (
    <div>
      <label htmlFor="taux-km" className="font-medium text-zinc-900">
        Taux du kilomètre (€ / km)
      </label>
      <input
        id="taux-km"
        type="text"
        inputMode="decimal"
        value={saisie}
        disabled={desactive}
        aria-invalid={!valide}
        onChange={(evenement) => setSaisie(evenement.target.value)}
        onBlur={valider}
        className={`mt-1 block w-32 rounded-lg border bg-white p-3 text-zinc-900 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-50 ${valide ? "border-zinc-300" : "border-rose-500"}`}
      />
      <p className="mt-1 text-sm text-zinc-600">
        {valide
          ? `Mis à jour le ${formaterDate(misAJourLe)}.`
          : "Saisissez un taux positif, 4 décimales maximum."}
      </p>
    </div>
  );
}
