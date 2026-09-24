interface InterrupteurParametreProps {
  readonly id: string;
  readonly titre: string;
  readonly description: string;
  readonly actif: boolean;
  readonly desactive?: boolean;
  readonly onChange: (actif: boolean) => void;
}

/** Ligne de paramètre avec interrupteur, réutilisable pour les futurs réglages du groupe. */
export function InterrupteurParametre({
  id,
  titre,
  description,
  actif,
  desactive = false,
  onChange,
}: Readonly<InterrupteurParametreProps>) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="font-medium text-zinc-900">
          {titre}
        </label>
        <p className="mt-1 text-sm text-zinc-600">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={actif}
        disabled={desactive}
        onClick={() => onChange(!actif)}
        className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          actif ? "bg-[#1E3A8A]" : "bg-zinc-300"
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            actif ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
