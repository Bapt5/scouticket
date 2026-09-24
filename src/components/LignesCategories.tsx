"use client";

import { PlusCircleIcon, TrashIcon } from "@heroicons/react/24/outline";
import { MAX_LIGNES_PAR_JUSTIFICATIF } from "@/constants/piecesJointes";
import {
  analyserMontantSaisi,
  montantSaisiValide,
  totalLignes,
  type LigneSaisie,
} from "@/lib/depenses";
import { SelecteurCategorie } from "@/components/SelecteurCategorie";

interface LignesCategoriesProps {
  readonly idPrefixe: string;
  readonly lignes: LigneSaisie[];
  readonly onChange: (lignes: LigneSaisie[]) => void;
  readonly afficherErreurs: boolean;
}

// Lignes « montant + catégorie comptable » d'un justificatif. La première
// ligne est toujours présente ; les suivantes peuvent être ajoutées/retirées.
export function LignesCategories({
  idPrefixe,
  lignes,
  onChange,
  afficherErreurs,
}: LignesCategoriesProps) {
  const modifierLigne = (index: number, modification: Partial<LigneSaisie>) =>
    onChange(
      lignes.map((ligne, i) =>
        i === index ? { ...ligne, ...modification } : ligne,
      ),
    );

  const total = totalLignes(
    lignes.map((ligne) => ({ montant: analyserMontantSaisi(ligne.montant) })),
  );

  return (
    <div className="space-y-3">
      {lignes.map((ligne, index) => {
        const erreurCategorie = afficherErreurs && !ligne.categorie;
        const erreurMontant =
          afficherErreurs && !montantSaisiValide(ligne.montant);
        const idMontant = `${idPrefixe}-montant-${index}`;
        const idCategorie = `${idPrefixe}-categorie-${index}`;
        return (
          <div
            key={index}
            className="grid grid-cols-[7rem_1fr_auto] gap-x-3 gap-y-1 items-start"
          >
            <div className="space-y-1">
              <label
                htmlFor={idMontant}
                className="block text-sm font-medium text-zinc-700"
              >
                Montant (€) *
              </label>
              <input
                id={idMontant}
                type="number"
                step="0.01"
                placeholder="0.00"
                value={ligne.montant}
                onChange={(e) =>
                  modifierLigne(index, { montant: e.target.value })
                }
                aria-invalid={erreurMontant}
                aria-describedby={
                  erreurMontant ? `erreur-${idMontant}` : undefined
                }
                className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-zinc-400 focus:border-zinc-400 bg-white text-zinc-900 ${
                  erreurMontant ? "border-rose-500" : "border-zinc-300"
                }`}
              />
            </div>
            <SelecteurCategorie
              id={idCategorie}
              libelle="Catégorie comptable *"
              valeur={ligne.categorie}
              onChange={(categorie) => modifierLigne(index, { categorie })}
              invalide={erreurCategorie}
              idErreur={`erreur-${idCategorie}`}
            />
            {/* Colonne réservée pour que la mise en page ne bouge pas à l'ajout de lignes */}
            <div className="pt-7 w-10">
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => onChange(lignes.filter((_, i) => i !== index))}
                  className="p-2 rounded-md text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition-colors"
                  aria-label={`Supprimer la ligne ${index + 1}`}
                >
                  <TrashIcon className="w-5 h-5" aria-hidden="true" />
                </button>
              )}
            </div>
            {(erreurMontant || erreurCategorie) && (
              <div className="col-span-3 space-y-1 text-sm text-rose-700">
                {erreurMontant && (
                  <p id={`erreur-${idMontant}`}>
                    Saisissez un montant supérieur à 0 €.
                  </p>
                )}
                {erreurCategorie && (
                  <p id={`erreur-${idCategorie}`}>
                    Sélectionnez une catégorie.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onChange([...lignes, { categorie: "", montant: "" }])}
          disabled={lignes.length >= MAX_LIGNES_PAR_JUSTIFICATIF}
          className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 disabled:text-zinc-400"
        >
          <PlusCircleIcon className="w-5 h-5" aria-hidden="true" />
          Ajouter une catégorie
        </button>
        <p className="text-sm text-zinc-700">
          Total du justificatif :{" "}
          <span className="font-semibold text-zinc-900">
            {total.toFixed(2)} €
          </span>
        </p>
      </div>
    </div>
  );
}
