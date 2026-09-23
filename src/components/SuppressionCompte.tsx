"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clientAuth } from "@/lib/auth-client";

const MOT_CONFIRMATION = "SUPPRIMER";

/** Zone « danger » de la page Mon compte : suppression définitive du compte. */
export default function SuppressionCompte() {
  const routeur = useRouter();
  const [groupes, setGroupes] = useState<{ id: string; name: string }[] | null>(
    null,
  );
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [sessionExpiree, setSessionExpiree] = useState(false);

  useEffect(() => {
    let annule = false;
    void clientAuth.organization
      .list()
      .then(({ data }) => {
        if (!annule) setGroupes(data ?? []);
      })
      .catch(() => {
        if (!annule) setGroupes([]);
      });
    return () => {
      annule = true;
    };
  }, []);

  const fermerDialog = () => {
    if (suppressionEnCours) return;
    setDialogOuvert(false);
    setSaisie("");
    setErreur("");
  };

  const supprimerCompte = async () => {
    setSuppressionEnCours(true);
    setErreur("");
    setSessionExpiree(false);
    const { error } = await clientAuth.deleteUser({});
    if (error) {
      setSuppressionEnCours(false);
      setSessionExpiree(error.code === "SESSION_EXPIRED");
      setErreur(
        error.message ||
          "Impossible de supprimer le compte. Reconnectez-vous puis réessayez.",
      );
      return;
    }
    routeur.replace("/sign-in");
  };

  const seReconnecter = async () => {
    await clientAuth.signOut();
    routeur.replace("/sign-in?callbackURL=%2Fcompte");
  };

  const groupesRestants = groupes !== null && groupes.length > 0;

  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-4">
      <h2 className="text-lg font-semibold text-red-900">
        Supprimer mon compte
      </h2>
      <p className="mt-1 text-sm text-red-900">
        Cette action est définitive : votre compte et toutes les données qui y
        sont associées seront supprimés.
      </p>
      {groupesRestants && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            Vous appartenez encore à{" "}
            {groupes.length > 1 ? "des groupes" : "un groupe"} :{" "}
            {groupes.map((groupe) => groupe.name).join(", ")}. Quittez-
            {groupes.length > 1 ? "les" : "le"} avant de supprimer votre compte
            (depuis l’accueil : « Changer de groupe », puis « Quitter »).
          </p>
          <Link href="/" className="mt-2 inline-block font-medium underline">
            Retour à l’accueil
          </Link>
        </div>
      )}
      <button
        type="button"
        disabled={groupes === null || groupesRestants}
        onClick={() => setDialogOuvert(true)}
        className="mt-3 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Supprimer mon compte
      </button>

      {dialogOuvert && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titre-suppression-compte"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
          onClick={fermerDialog}
        >
          <div
            onClick={(evenement) => evenement.stopPropagation()}
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl"
          >
            <h2
              id="titre-suppression-compte"
              className="text-lg font-semibold text-zinc-900"
            >
              Confirmer la suppression
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Votre compte sera supprimé définitivement, sans possibilité de le
              récupérer. Pour confirmer, saisissez{" "}
              <strong>{MOT_CONFIRMATION}</strong> ci-dessous.
            </p>
            <input
              value={saisie}
              onChange={(evenement) => setSaisie(evenement.target.value)}
              aria-label={`Saisissez ${MOT_CONFIRMATION} pour confirmer`}
              autoComplete="off"
              className="mt-4 w-full rounded-lg border border-zinc-300 bg-white p-3 text-zinc-900 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/20"
            />
            {erreur && <p className="mt-2 text-sm text-red-700">{erreur}</p>}
            {sessionExpiree && (
              <button
                type="button"
                onClick={() => void seReconnecter()}
                className="mt-2 text-sm font-medium text-[#1E3A8A] underline"
              >
                Se reconnecter
              </button>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={saisie !== MOT_CONFIRMATION || suppressionEnCours}
                onClick={() => void supprimerCompte()}
                className="flex-1 rounded-lg bg-red-700 p-2 text-sm font-semibold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {suppressionEnCours
                  ? "Suppression…"
                  : "Supprimer définitivement"}
              </button>
              <button
                type="button"
                disabled={suppressionEnCours}
                onClick={fermerDialog}
                className="flex-1 rounded-lg border border-zinc-300 p-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
