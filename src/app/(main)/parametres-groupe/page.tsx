"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InterrupteurParametre } from "@/components/InterrupteurParametre";
import { clientAuth } from "@/lib/auth-client";
import {
  PARAMETRES_GROUPE_PAR_DEFAUT,
  type ParametresGroupe,
} from "@/lib/parametresGroupe";

type Groupe = { isAdmin: boolean; parametres?: ParametresGroupe };

export default function PageParametresGroupe() {
  const { data: organisation } = clientAuth.useActiveOrganization();
  const [parametres, setParametres] = useState<ParametresGroupe>(
    PARAMETRES_GROUPE_PAR_DEFAUT,
  );
  const [chargement, setChargement] = useState(true);
  const [estAdministrateur, setEstAdministrateur] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/group/config")
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((groupe: Groupe | null) => {
        if (!groupe?.isAdmin) {
          setMessage("Accès réservé aux responsables du groupe.");
          return;
        }
        setEstAdministrateur(true);
        setParametres(groupe.parametres ?? PARAMETRES_GROUPE_PAR_DEFAUT);
      })
      .catch(() => setMessage("Impossible de charger les paramètres."))
      .finally(() => setChargement(false));
  }, []);

  // Chaque interrupteur s'enregistre immédiatement ; l'état est rétabli en cas d'échec.
  const modifier = async (modification: Partial<ParametresGroupe>) => {
    const precedents = parametres;
    setParametres({ ...parametres, ...modification });
    setEnregistrement(true);
    setMessage("");
    try {
      const reponse = await fetch("/api/group/parametres", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modification),
      });
      const corps = reponse.ok
        ? ((await reponse.json().catch(() => null)) as {
            parametres?: ParametresGroupe;
          } | null)
        : null;
      if (!corps?.parametres) throw new Error("PARAMETRES_NON_ENREGISTRES");
      setParametres(corps.parametres);
      setMessage("Paramètres enregistrés.");
    } catch {
      setParametres(precedents);
      setMessage("Impossible d’enregistrer le paramètre. Réessayez.");
    } finally {
      setEnregistrement(false);
    }
  };

  if (!organisation) return <main className="p-6">Aucun groupe actif.</main>;
  return (
    <main className="min-h-screen bg-zinc-50 p-4">
      <section className="mx-auto max-w-lg rounded-xl border border-zinc-200 bg-white p-6">
        <Link href="/" className="text-sm text-[#1E3A8A]">
          ← Retour
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-900">
          Paramètres du groupe
        </h1>
        <p className="mt-2 text-zinc-600">{organisation.name}</p>
        {chargement ? (
          <p className="mt-5 text-sm text-zinc-600">Chargement…</p>
        ) : !estAdministrateur ? (
          <p className="mt-5 text-sm text-rose-600">{message}</p>
        ) : (
          <div className="mt-5 space-y-5">
            <h2 className="text-lg font-semibold text-zinc-900">
              Justificatifs
            </h2>
            <InterrupteurParametre
              id="scan-justificatifs"
              titre="Scan automatique des justificatifs"
              description="Détecte, redresse et recadre automatiquement les photos et images importées. Les membres peuvent ajuster le recadrage avant l’ajout. Les PDF sont ajoutés tels quels."
              actif={parametres.scanJustificatifsActif}
              desactive={enregistrement}
              onChange={(actif) => modifier({ scanJustificatifsActif: actif })}
            />
            <InterrupteurParametre
              id="convertir-justificatifs-pdf"
              titre="Conversion des justificatifs en PDF"
              description="Convertit toutes les photos et images en PDF avant l’envoi par e-mail à la trésorerie (un PDF par justificatif). Désactivé, les justificatifs sont envoyés dans leur format d’origine."
              actif={parametres.convertirJustificatifsEnPdf}
              desactive={enregistrement}
              onChange={(actif) =>
                modifier({ convertirJustificatifsEnPdf: actif })
              }
            />
            {message && (
              <p role="status" className="text-sm text-zinc-600">
                {message}
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
