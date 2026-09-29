"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { ListePrioriteSignataires } from "@/components/ListePrioriteSignataires";
import type { MembreSignataire } from "@/lib/groupServer";

type Categorie = {
  retenus: MembreSignataire[];
  nonRetenus: MembreSignataire[];
};
type Signataires = { responsables: Categorie; tresoriers: Categorie };

const SIGNATAIRES_VIDE: Signataires = {
  responsables: { retenus: [], nonRetenus: [] },
  tresoriers: { retenus: [], nonRetenus: [] },
};

export default function PageSignataires() {
  const [signataires, setSignataires] =
    useState<Signataires>(SIGNATAIRES_VIDE);
  const [chargement, setChargement] = useState(true);
  const [accesAutorise, setAccesAutorise] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/group/signataires")
      .then(async (reponse) => {
        if (!reponse.ok) {
          setMessage("Accès réservé aux responsables du groupe.");
          return;
        }
        setAccesAutorise(true);
        setSignataires((await reponse.json()) as Signataires);
      })
      .catch(() => setMessage("Impossible de charger les signataires."))
      .finally(() => setChargement(false));
  }, []);

  // La liste de priorité d'une catégorie est remplacée intégralement, mais
  // l'API attend toujours les deux catégories : on renvoie donc aussi
  // l'ordre inchangé de l'autre.
  const modifier = async (
    categorie: "responsables" | "tresoriers",
    idsRetenus: string[],
  ) => {
    const precedent = signataires;
    const membresCategorie = [
      ...precedent[categorie].retenus,
      ...precedent[categorie].nonRetenus,
    ];
    const retenus = idsRetenus
      .map((id) => membresCategorie.find((membre) => membre.id === id))
      .filter((membre): membre is MembreSignataire => membre !== undefined);
    const nonRetenus = membresCategorie.filter(
      (membre) => !idsRetenus.includes(membre.id),
    );
    setSignataires({ ...precedent, [categorie]: { retenus, nonRetenus } });
    setEnregistrement(true);
    setMessage("");
    try {
      const reponse = await fetch("/api/group/signataires", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responsables: (categorie === "responsables"
            ? retenus
            : precedent.responsables.retenus
          ).map((membre) => membre.id),
          tresoriers: (categorie === "tresoriers"
            ? retenus
            : precedent.tresoriers.retenus
          ).map((membre) => membre.id),
        }),
      });
      const corps = reponse.ok
        ? ((await reponse.json().catch(() => null)) as Signataires | null)
        : null;
      if (!corps) throw new Error("SIGNATAIRES_NON_ENREGISTRES");
      setSignataires(corps);
      setMessage("Signataires enregistrés.");
    } catch {
      setSignataires(precedent);
      setMessage("Impossible d’enregistrer les signataires. Réessayez.");
    } finally {
      setEnregistrement(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 p-4">
      <section className="mx-auto max-w-lg rounded-xl border border-zinc-200 bg-white p-6">
        <Link href="/parametres-groupe" className="text-sm text-[#1E3A8A]">
          ← Retour aux paramètres
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-900">
          Gestion des signataires
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Définissez, pour les Responsables de groupe et les Trésoriers,
          l’ordre de priorité des signataires des notes de frais.
        </p>
        {chargement ? (
          <p className="mt-5 text-sm text-zinc-600">Chargement…</p>
        ) : !accesAutorise ? (
          <p className="mt-5 text-sm text-rose-600">{message}</p>
        ) : (
          <div className="mt-6 space-y-6">
            <ListePrioriteSignataires
              titre="Responsables de groupe"
              idPrefixe="responsables"
              retenus={signataires.responsables.retenus}
              nonRetenus={signataires.responsables.nonRetenus}
              desactive={enregistrement}
              onChange={(ids) => modifier("responsables", ids)}
            />
            <ListePrioriteSignataires
              titre="Trésoriers"
              idPrefixe="tresoriers"
              retenus={signataires.tresoriers.retenus}
              nonRetenus={signataires.tresoriers.nonRetenus}
              desactive={enregistrement}
              onChange={(ids) => modifier("tresoriers", ids)}
            />
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <div className="flex items-center gap-2">
                <InformationCircleIcon
                  className="h-5 w-5 shrink-0 text-blue-600"
                  aria-hidden="true"
                />
                <p className="font-semibold text-blue-900">
                  Règle de remplacement
                </p>
              </div>
              <ul className="mt-2 list-disc space-y-1.5 pl-9">
                <li>
                  Si le bénéficiaire devrait signer (premier de sa liste), il
                  est remplacé par le signataire suivant dans la même liste.
                </li>
                <li>
                  S’il n’y a personne d’autre chez les Trésoriers, le premier
                  Responsable de groupe non bénéficiaire prend le rôle du
                  traitement. Le suivant dans la liste des Responsables de
                  groupe prend le rôle de l’approbation.
                </li>
                <li>
                  S’il n’y a personne d’autre chez les Responsables de
                  groupe, le deuxième Trésorier non bénéficiaire approuve. Le
                  premier Trésorier disponible traite toujours le virement.
                </li>
                <li>
                  Si aucune solution n’est trouvée dans les deux listes,
                  l’envoi de la note de frais échoue avec un message
                  invitant à contacter un Trésorier ou un Responsable de
                  groupe pour résoudre le problème.
                </li>
              </ul>
              <p className="mt-2 pl-9 text-blue-700">
                Cette règle n’est pas encore appliquée à l’envoi des notes de
                frais ; elle le sera dans une prochaine étape.
              </p>
            </div>
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
