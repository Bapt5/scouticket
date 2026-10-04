"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  LONGUEUR_MAX_LIBELLE_POSTE,
  NOMBRE_MAX_POSTES_PAR_DOMAINE,
  type DomaineBudget,
  type PosteBrouillon,
} from "@/lib/budget";

interface EditeurPostesBudgetairesProps {
  readonly domaine: DomaineBudget;
  /** Tous les postes du groupe (les deux domaines) : seul `domaine` est édité. */
  readonly postes: PosteBrouillon[];
  readonly onChange: (postes: PosteBrouillon[]) => void;
  readonly desactive?: boolean;
}

/** Ajout, renommage, réordonnancement et suppression des postes d'un domaine. */
export function EditeurPostesBudgetaires({
  domaine,
  postes,
  onChange,
  desactive = false,
}: EditeurPostesBudgetairesProps) {
  const duDomaine = postes.filter((poste) => poste.domaine === domaine);

  // Recompose la liste complète en conservant l'ordre des autres domaines.
  const remplacer = (nouveaux: PosteBrouillon[]) =>
    onChange([
      ...postes.filter((poste) => poste.domaine !== domaine),
      ...nouveaux,
    ]);

  const modifier = (index: number, label: string) =>
    remplacer(
      duDomaine.map((poste, i) => (i === index ? { ...poste, label } : poste)),
    );

  const deplacer = (index: number, sens: -1 | 1) => {
    const cible = index + sens;
    if (cible < 0 || cible >= duDomaine.length) return;
    const copie = [...duDomaine];
    [copie[index], copie[cible]] = [copie[cible], copie[index]];
    remplacer(copie);
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {duDomaine.map((poste, index) => (
          <li key={poste.id ?? `nouveau-${index}`} className="flex gap-2">
            <input
              value={poste.label}
              maxLength={LONGUEUR_MAX_LIBELLE_POSTE}
              disabled={desactive}
              aria-label={`Nom du poste ${index + 1}`}
              onChange={(e) => modifier(index, e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white p-2 text-zinc-900 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400"
            />
            <button
              type="button"
              disabled={desactive || index === 0}
              onClick={() => deplacer(index, -1)}
              aria-label={`Monter ${poste.label || "le poste"}`}
              className="rounded-lg border border-zinc-300 p-2 text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
            >
              <ArrowUpIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={desactive || index === duDomaine.length - 1}
              onClick={() => deplacer(index, 1)}
              aria-label={`Descendre ${poste.label || "le poste"}`}
              className="rounded-lg border border-zinc-300 p-2 text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
            >
              <ArrowDownIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={desactive}
              onClick={() => remplacer(duDomaine.filter((_, i) => i !== index))}
              aria-label={`Supprimer ${poste.label || "le poste"}`}
              className="rounded-lg border border-zinc-300 p-2 text-rose-700 hover:bg-rose-50 disabled:opacity-40"
            >
              <TrashIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={
          desactive || duDomaine.length >= NOMBRE_MAX_POSTES_PAR_DOMAINE
        }
        onClick={() =>
          remplacer([...duDomaine, { id: null, domaine, label: "" }])
        }
        className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
      >
        <PlusIcon className="h-4 w-4" aria-hidden="true" />
        Ajouter un poste
      </button>
    </div>
  );
}
