import { useId } from "react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

interface InfoBulleProps {
  readonly texte: string;
}

export function InfoBulle({ texte }: InfoBulleProps) {
  const identifiant = useId();
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label="Plus d’informations"
        aria-describedby={identifiant}
        className="rounded-full text-zinc-400 hover:text-zinc-600 focus:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
      >
        <InformationCircleIcon className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        id={identifiant}
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 hidden w-56 -translate-x-1/2 rounded-lg bg-zinc-900 p-2 text-xs font-normal text-white shadow-lg group-focus-within:block group-hover:block"
      >
        {texte}
      </span>
    </span>
  );
}
