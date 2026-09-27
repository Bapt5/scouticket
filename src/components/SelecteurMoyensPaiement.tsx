"use client";

import { useState, type KeyboardEvent } from "react";
import { TrashIcon } from "@heroicons/react/24/outline";

interface SelecteurMoyensPaiementProps {
  readonly id: string;
  readonly libelle: string;
  readonly valeur: string[];
  readonly onChange: (moyens: string[]) => void;
  readonly desactive?: boolean;
}

const NOMBRE_MAX_MOYENS_PAIEMENT = 20;

const normaliser = (texte: string) =>
  texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Champ d'ajout suivi de la liste des moyens actuels (défilable au-delà de 4
// lignes), chacun retirable via sa poubelle.
export function SelecteurMoyensPaiement({
  id,
  libelle,
  valeur,
  onChange,
  desactive = false,
}: SelecteurMoyensPaiementProps) {
  const [saisie, setSaisie] = useState("");

  const nouveauMoyen = saisie.trim();
  const requete = normaliser(nouveauMoyen);
  const existeDeja = valeur.some((moyen) => normaliser(moyen) === requete);
  const peutAjouter =
    nouveauMoyen.length > 0 &&
    !existeDeja &&
    valeur.length < NOMBRE_MAX_MOYENS_PAIEMENT;

  const ajouter = () => {
    if (!peutAjouter) return;
    onChange([...valeur, nouveauMoyen]);
    setSaisie("");
  };

  const retirer = (moyen: string) => {
    if (desactive || valeur.length <= 1) return;
    onChange(valeur.filter((item) => item !== moyen));
  };

  const gererTouche = (evenement: KeyboardEvent<HTMLInputElement>) => {
    if (evenement.key === "Enter") {
      evenement.preventDefault();
      ajouter();
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-zinc-700">
        {libelle}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          autoComplete="off"
          disabled={desactive}
          placeholder="Nom du moyen de paiement…"
          value={saisie}
          onChange={(evenement) => setSaisie(evenement.target.value)}
          onKeyDown={gererTouche}
          className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-zinc-400 focus:border-zinc-400 bg-white text-zinc-900 border-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          disabled={!peutAjouter}
          onClick={ajouter}
          className="shrink-0 rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Ajouter
        </button>
      </div>
      {nouveauMoyen && existeDeja && (
        <p className="text-xs text-zinc-500">
          Ce moyen de paiement existe déjà.
        </p>
      )}
      <ul
        aria-label="Moyens de paiement actuels"
        className="max-h-48 space-y-1 overflow-y-auto"
      >
        {valeur.map((moyen) => (
          <li
            key={moyen}
            className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2"
          >
            <span className="text-sm text-zinc-900">{moyen}</span>
            <button
              type="button"
              aria-label={`Retirer ${moyen}`}
              disabled={desactive || valeur.length <= 1}
              onClick={() => retirer(moyen)}
              className="rounded p-1 text-zinc-500 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <TrashIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
