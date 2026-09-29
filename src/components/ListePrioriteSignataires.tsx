"use client";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import type { MembreSignataire } from "@/lib/groupServer";

interface ListePrioriteSignatairesProps {
  readonly titre: string;
  readonly idPrefixe: string;
  readonly retenus: MembreSignataire[];
  readonly nonRetenus: MembreSignataire[];
  readonly onChange: (idsRetenus: string[]) => void;
  readonly desactive?: boolean;
}

// Liste de priorité ordonnée (monter/descendre/retirer) avec réintégration
// des membres exclus via des puces cliquables. Le composant est contrôlé :
// il ne fait que dériver et renvoyer le nouvel ordre des ids retenus.
export function ListePrioriteSignataires({
  titre,
  idPrefixe,
  retenus,
  nonRetenus,
  onChange,
  desactive = false,
}: ListePrioriteSignatairesProps) {
  const deplacer = (index: number, direction: -1 | 1) => {
    const cible = index + direction;
    if (desactive || cible < 0 || cible >= retenus.length) return;
    const suivant = retenus.map((membre) => membre.id);
    [suivant[index], suivant[cible]] = [suivant[cible], suivant[index]];
    onChange(suivant);
  };

  const retirer = (id: string) => {
    if (desactive) return;
    onChange(retenus.map((membre) => membre.id).filter((item) => item !== id));
  };

  const ajouter = (id: string) => {
    if (desactive) return;
    onChange([...retenus.map((membre) => membre.id), id]);
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-900">{titre}</h3>
      <ol className="mt-2 space-y-2">
        {retenus.map((membre, index) => (
          <li
            key={membre.id}
            className="flex items-center gap-2 rounded-xl border border-zinc-200 p-3 text-sm"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">
              {membre.nom}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => deplacer(index, -1)}
                disabled={desactive || index === 0}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label={`Monter ${membre.nom}`}
              >
                <ChevronUpIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => deplacer(index, 1)}
                disabled={desactive || index === retenus.length - 1}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label={`Descendre ${membre.nom}`}
              >
                <ChevronDownIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label={`Retirer ${membre.nom} de la liste`}
                onClick={() => retirer(membre.id)}
                disabled={desactive}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <TrashIcon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
        {retenus.length === 0 && (
          <li className="rounded-xl border border-dashed border-zinc-300 p-3 text-sm text-zinc-500">
            Aucun signataire dans cette liste.
          </li>
        )}
      </ol>
      {nonRetenus.length > 0 && (
        <div className="mt-2" id={`${idPrefixe}-non-retenus`}>
          <p className="text-xs text-zinc-500">
            Exclus de la liste (rôle conservé), cliquer pour réintégrer :
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            {nonRetenus.map((membre) => (
              <button
                key={membre.id}
                type="button"
                onClick={() => ajouter(membre.id)}
                disabled={desactive}
                className="flex items-center gap-1.5 rounded-full border border-dashed border-zinc-300 py-1 pl-3 pr-2 text-xs text-zinc-500 transition-colors hover:border-[#1E3A8A] hover:text-[#1E3A8A] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {membre.nom}
                <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
