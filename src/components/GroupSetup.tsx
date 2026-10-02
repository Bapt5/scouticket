"use client";

import { useState, type FormEvent } from "react";
import { EditeurUnites } from "@/components/EditeurUnites";
import { UNITES_PAR_DEFAUT, type UniteBrouillon } from "@/lib/group";

/** Collecte les unités du groupe avant d’enregistrer sa configuration. */
export function ConfigurationGroupe({
  onSaved,
  unitesInitiales = UNITES_PAR_DEFAUT,
}: {
  readonly onSaved: () => void;
  readonly unitesInitiales?: UniteBrouillon[];
}) {
  const [unites, setUnites] = useState<UniteBrouillon[]>(unitesInitiales);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState("");

  const enregistrer = async (event: FormEvent) => {
    event.preventDefault();
    setEnregistrement(true);
    setErreur("");
    try {
      const reponse = await fetch("/api/group/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ units: unites }),
      });
      if (!reponse.ok) {
        const corps = (await reponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        setErreur(
          corps?.error ??
            "Impossible d’enregistrer le groupe. Vérifiez les informations puis réessayez.",
        );
        return;
      }
      onSaved();
    } catch {
      setErreur("Impossible d’enregistrer le groupe. Réessayez plus tard.");
    } finally {
      setEnregistrement(false);
    }
  };

  return (
    <section
      className="min-h-[31rem] space-y-6"
      aria-labelledby="configuration-groupe"
    >
      <div>
        <h2
          id="configuration-groupe"
          className="text-xl font-semibold text-zinc-900"
        >
          Configurer votre groupe
        </h2>
        <p className="mt-1 min-h-5 text-sm text-zinc-600">
          Choisissez les unités de votre groupe.
        </p>
      </div>

      <form onSubmit={enregistrer} className="space-y-5">
        <EditeurUnites unites={unites} onChange={setUnites} />
        <button
          disabled={enregistrement || unites.length === 0}
          className="w-full rounded-xl bg-[#1E3A8A] p-3 font-semibold text-white shadow-sm transition-colors hover:bg-[#162d69] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enregistrement ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
      <p className="min-h-5 text-sm text-rose-700" role="alert">
        {erreur}
      </p>
    </section>
  );
}
