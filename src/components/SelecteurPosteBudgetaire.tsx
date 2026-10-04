"use client";

import type { PosteBudgetaire } from "@/lib/budget";

interface SelecteurPosteBudgetaireProps {
  readonly id: string;
  readonly postes: readonly PosteBudgetaire[];
  readonly valeur: string;
  readonly onChange: (posteId: string) => void;
  /** Affiche l'erreur « poste obligatoire ». */
  readonly erreur?: boolean;
  readonly libelle?: string;
}

/** Choix du poste budgétaire d'une pièce (obligatoire quand le suivi est actif). */
export function SelecteurPosteBudgetaire({
  id,
  postes,
  valeur,
  onChange,
  erreur = false,
  libelle = "Poste budgétaire *",
}: SelecteurPosteBudgetaireProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-zinc-700">
        {libelle}
      </label>
      <select
        id={id}
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={erreur}
        aria-describedby={erreur ? `erreur-${id}` : undefined}
        className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-zinc-400 focus:border-zinc-400 bg-white text-zinc-900 ${erreur ? "border-rose-500" : "border-zinc-300"}`}
      >
        <option value="">Sélectionner un poste</option>
        {postes.map((poste) => (
          <option key={poste.id} value={poste.id}>
            {poste.label}
          </option>
        ))}
      </select>
      {erreur && (
        <p id={`erreur-${id}`} className="text-sm text-rose-700">
          Sélectionnez un poste budgétaire.
        </p>
      )}
    </div>
  );
}
