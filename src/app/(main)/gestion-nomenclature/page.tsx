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

type Domaine = "depense" | "recette";

const LIBELLES_DOMAINE: Record<Domaine, string> = {
  depense: "Dépenses",
  recette: "Recettes",
};

const EXEMPLES_APERCU: Record<
  Domaine,
  { typeDepense: string; modePaiement: string; montant: number }[]
> = {
  depense: [
    { typeDepense: "Carburant", modePaiement: "Carte bancaire", montant: 28.5 },
    { typeDepense: "Fournitures", modePaiement: "Espèces", montant: 12 },
  ],
  recette: [
    { typeDepense: "Cotisations SGDF", modePaiement: "Virement", montant: 45 },
    {
      typeDepense: "Vente article boutique",
      modePaiement: "Liquide",
      montant: 8,
    },
  ],
};

type ReponseDomaine = {
  format: string | null;
  compteurs?: {
    prochainNumeroGlobal: number;
    prochainNumeroComptable: number;
  };
};

type ReponseNomenclature = {
  anneeComptable: ParametresAnneeComptable;
  anneeComptableCourante?: number;
  depense: ReponseDomaine;
  recette: ReponseDomaine;
};

const brouillonVide: BrouillonNomenclature = {
  personnalise: false,
  format: "",
  anneeComptable: PARAMETRES_ANNEE_COMPTABLE_PAR_DEFAUT,
  prochainNumeroGlobal: "1",
  prochainNumeroComptable: "1",
};

function brouillonDepuis(
  reponse: ReponseDomaine,
  anneeComptable: ParametresAnneeComptable,
): BrouillonNomenclature {
  return {
    personnalise: reponse.format !== null,
    format: reponse.format ?? "",
    anneeComptable,
    prochainNumeroGlobal: String(reponse.compteurs?.prochainNumeroGlobal ?? 1),
    prochainNumeroComptable: String(
      reponse.compteurs?.prochainNumeroComptable ?? 1,
    ),
  };
}

export default function PageGestionNomenclature() {
  const { data: organisation } = clientAuth.useActiveOrganization();
  const [domaine, setDomaine] = useState<Domaine>("depense");
  const [brouillons, setBrouillons] = useState<
    Record<Domaine, BrouillonNomenclature>
  >({ depense: brouillonVide, recette: brouillonVide });
  const [initiaux, setInitiaux] = useState<
    Record<Domaine, BrouillonNomenclature>
  >({ depense: brouillonVide, recette: brouillonVide });
  const [anneeCourante, setAnneeCourante] = useState(new Date().getFullYear());
  const [chargement, setChargement] = useState(true);
  const [estResponsable, setEstResponsable] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/group/nomenclature")
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then((donnees: ReponseNomenclature | null) => {
        if (!donnees?.depense.compteurs || !donnees.recette.compteurs) {
          setMessage("Accès réservé aux responsables du groupe.");
          return;
        }
        const charges: Record<Domaine, BrouillonNomenclature> = {
          depense: brouillonDepuis(donnees.depense, donnees.anneeComptable),
          recette: brouillonDepuis(donnees.recette, donnees.anneeComptable),
        };
        setEstResponsable(true);
        setAnneeCourante(
          donnees.anneeComptableCourante ?? new Date().getFullYear(),
        );
        setBrouillons(charges);
        setInitiaux(charges);
      })
      .catch(() => setMessage("Impossible de charger la nomenclature."))
      .finally(() => setChargement(false));
  }, []);

  const brouillon = brouillons[domaine];
  const initial = initiaux[domaine];

  const modifierBrouillon = (valeur: BrouillonNomenclature) =>
    setBrouillons((precedents) => {
      // L'année comptable est partagée : la modifier sur un domaine la
      // modifie aussi pour l'autre, pour rester cohérent avec le serveur.
      const autre: Domaine = domaine === "depense" ? "recette" : "depense";
      return {
        ...precedents,
        [domaine]: valeur,
        [autre]: {
          ...precedents[autre],
          anneeComptable: valeur.anneeComptable,
        },
      };
    });

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
        domaine,
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
      setInitiaux((precedents) => ({ ...precedents, [domaine]: brouillon }));
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
          Nomenclature
        </h1>
        <p className="mt-2 text-zinc-600">{organisation.name}</p>
        {chargement ? (
          <p className="mt-5 text-sm text-zinc-600">Chargement…</p>
        ) : !estResponsable ? (
          <p className="mt-5 text-sm text-rose-600">{message}</p>
        ) : (
          <form onSubmit={enregistrer} className="mt-5 space-y-5">
            <div
              role="tablist"
              aria-label="Domaine de la nomenclature"
              className="grid grid-cols-2 gap-2"
            >
              {(["depense", "recette"] as const).map((option) => {
                const selectionne = domaine === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={selectionne}
                    onClick={() => setDomaine(option)}
                    className={`rounded-lg border p-2 text-sm font-semibold transition-colors ${
                      selectionne
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    {LIBELLES_DOMAINE[option]}
                  </button>
                );
              })}
            </div>
            <EditeurNomenclature
              valeur={brouillon}
              onChange={modifierBrouillon}
              anneeComptableCourante={anneeCourante}
              afficherAnneeComptable={domaine === "depense"}
              exemplesApercu={EXEMPLES_APERCU[domaine]}
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
