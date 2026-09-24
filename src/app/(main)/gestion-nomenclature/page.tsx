"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  EditeurNomenclature,
  type BrouillonNomenclature,
} from "@/components/EditeurNomenclature";
import { clientAuth } from "@/lib/auth-client";
import {
  PARAMETRES_ANNEE_COMPTABLE_PAR_DEFAUT,
  erreurDebutAnneeComptable,
  validerFormatNomenclature,
  type ParametresAnneeComptable,
} from "@/lib/nomenclature";

type ReponseNomenclature = {
  format: string | null;
  anneeComptable: ParametresAnneeComptable;
  compteurs?: {
    prochainNumeroGlobal: number;
    anneeComptableCourante: number;
    prochainNumeroComptable: number;
  };
};

const BROUILLON_INITIAL: BrouillonNomenclature = {
  personnalise: false,
  format: "",
  anneeComptable: PARAMETRES_ANNEE_COMPTABLE_PAR_DEFAUT,
  prochainNumeroGlobal: "1",
  prochainNumeroComptable: "1",
};

export default function PageGestionNomenclature() {
  const { data: organisation } = clientAuth.useActiveOrganization();
  const [brouillon, setBrouillon] = useState(BROUILLON_INITIAL);
  const [initial, setInitial] = useState(BROUILLON_INITIAL);
  const [anneeCourante, setAnneeCourante] = useState(new Date().getFullYear());
  const [chargement, setChargement] = useState(true);
  const [estResponsable, setEstResponsable] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/group/nomenclature")
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees: ReponseNomenclature | null) => {
        if (!donnees?.compteurs) {
          setMessage("Accès réservé aux responsables du groupe.");
          return;
        }
        const charge: BrouillonNomenclature = {
          personnalise: donnees.format !== null,
          format: donnees.format ?? "",
          anneeComptable: donnees.anneeComptable,
          prochainNumeroGlobal: String(donnees.compteurs.prochainNumeroGlobal),
          prochainNumeroComptable: String(
            donnees.compteurs.prochainNumeroComptable,
          ),
        };
        setEstResponsable(true);
        setAnneeCourante(donnees.compteurs.anneeComptableCourante);
        setBrouillon(charge);
        setInitial(charge);
      })
      .catch(() => setMessage("Impossible de charger la nomenclature."))
      .finally(() => setChargement(false));
  }, []);

  const enregistrer = async (event: FormEvent) => {
    event.preventDefault();
    setEnregistrement(true);
    setMessage("");
    const global = Number(brouillon.prochainNumeroGlobal);
    const comptable = Number(brouillon.prochainNumeroComptable);
    // Les compteurs ne sont envoyés que s'ils ont été modifiés, pour ne pas
    // écraser un numéro attribué entre-temps par un autre envoi.
    const reponse = await fetch("/api/group/nomenclature", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: brouillon.personnalise ? brouillon.format : null,
        anneeComptable: brouillon.anneeComptable,
        prochainNumeroGlobal:
          brouillon.prochainNumeroGlobal !== initial.prochainNumeroGlobal
            ? global
            : undefined,
        prochainNumeroComptable:
          brouillon.prochainNumeroComptable !== initial.prochainNumeroComptable
            ? { annee: anneeCourante, numero: comptable }
            : undefined,
      }),
    });
    const corps = (await reponse.json().catch(() => null)) as {
      error?: string;
    } | null;
    setEnregistrement(false);
    if (reponse.ok) {
      setInitial(brouillon);
      setMessage("Nomenclature enregistrée.");
    } else {
      setMessage(corps?.error ?? "Impossible d’enregistrer la nomenclature.");
    }
  };

  if (!organisation) return <main className="p-6">Aucun groupe actif.</main>;
  const formatInvalide =
    brouillon.personnalise &&
    (validerFormatNomenclature(brouillon.format) ||
      erreurDebutAnneeComptable(
        brouillon.anneeComptable.mois,
        brouillon.anneeComptable.jour,
      ));
  return (
    <main className="min-h-screen bg-zinc-50 p-4">
      <section className="mx-auto max-w-lg rounded-xl border border-zinc-200 bg-white p-6">
        <Link href="/" className="text-sm text-[#1E3A8A]">
          ← Retour
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-900">
          Nom des justificatifs
        </h1>
        <p className="mt-2 text-zinc-600">{organisation.name}</p>
        {chargement ? (
          <p className="mt-5 text-sm text-zinc-600">Chargement…</p>
        ) : !estResponsable ? (
          <p className="mt-5 text-sm text-rose-600">{message}</p>
        ) : (
          <form onSubmit={enregistrer} className="mt-5 space-y-5">
            <EditeurNomenclature
              valeur={brouillon}
              onChange={setBrouillon}
              anneeComptableCourante={anneeCourante}
            />
            {message && <p className="text-sm text-zinc-600">{message}</p>}
            <button
              disabled={enregistrement || Boolean(formatInvalide)}
              className="w-full rounded-xl bg-[#1E3A8A] p-3 font-semibold text-white shadow-sm transition-colors hover:bg-[#162d69] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {enregistrement ? "Enregistrement…" : "Enregistrer"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
