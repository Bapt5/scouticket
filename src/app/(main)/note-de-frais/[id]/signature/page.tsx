"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SaisieCodeVerification } from "@/components/SaisieCodeVerification";
import { VisionneusePdf } from "@/components/VisionneusePdf";

type Etape = "beneficiaire" | "responsable" | "tresorier";

interface ResumeNoteDeFrais {
  etape: Etape;
  signataireNom: string;
  demandeur: string;
  branche: string;
  montant: number;
  date: string;
  ribDisponible: boolean;
}

const LIBELLES_ETAPE: Record<Etape, string> = {
  beneficiaire: "Signature du bénéficiaire",
  responsable: "Visa de l'approbateur",
  tresorier: "Traitement par le trésorier",
};

async function chargerResume(url: string): Promise<ResumeNoteDeFrais> {
  const reponse = await fetch(url);
  if (!reponse.ok) {
    const corps = (await reponse.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(corps?.error ?? "Impossible de charger la note de frais");
  }
  return reponse.json() as Promise<ResumeNoteDeFrais>;
}

export default function PageSignatureNoteDeFrais({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [resume, setResume] = useState<ResumeNoteDeFrais | null>(null);
  const [erreurChargement, setErreurChargement] = useState("");
  const [chargement, setChargement] = useState(true);
  const [documentLu, setDocumentLu] = useState(false);

  const rechargerResume = useCallback(() => {
    setChargement(true);
    chargerResume(`/api/note-de-frais/${id}`)
      .then(setResume)
      .catch((erreur: Error) => setErreurChargement(erreur.message))
      .finally(() => setChargement(false));
  }, [id]);

  useEffect(() => {
    rechargerResume();
  }, [rechargerResume]);

  const [dateVirement, setDateVirement] = useState("");
  const [motifRefus, setMotifRefus] = useState("");
  const [afficherRefus, setAfficherRefus] = useState(false);

  // Dialog de saisie du code : null quand fermé, sinon la décision qu'il confirmera.
  const [dialogueDecision, setDialogueDecision] = useState<
    "signee" | "refusee" | null
  >(null);
  const [code, setCode] = useState("");
  const [codeEnvoye, setCodeEnvoye] = useState(false);

  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState("");
  const [erreurDialogue, setErreurDialogue] = useState("");
  const [termine, setTermine] = useState<"signee" | "refusee" | null>(null);

  async function envoyerCode() {
    setErreurDialogue("");
    try {
      const reponse = await fetch(`/api/note-de-frais/${id}/envoyer-code`, {
        method: "POST",
      });
      if (!reponse.ok) {
        const corps = (await reponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(corps?.error ?? "Envoi du code impossible");
      }
      setCodeEnvoye(true);
    } catch (erreur) {
      setErreurDialogue(erreur instanceof Error ? erreur.message : "Erreur");
    }
  }

  function ouvrirDialogue(decision: "signee" | "refusee") {
    setDialogueDecision(decision);
    setCode("");
    setCodeEnvoye(false);
    setErreurDialogue("");
    void envoyerCode();
  }

  function fermerDialogue() {
    if (enCours) return;
    setDialogueDecision(null);
  }

  async function confirmerDecision() {
    if (!dialogueDecision) return;
    if (code.length !== 6) {
      setErreurDialogue("Saisissez les 6 chiffres du code reçu par e-mail.");
      return;
    }
    setEnCours(true);
    setErreurDialogue("");
    try {
      const reponse = await fetch(`/api/note-de-frais/${id}/signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: dialogueDecision,
          code,
          ...(resume?.etape === "tresorier" && dialogueDecision === "signee"
            ? { dateVirement }
            : {}),
          ...(dialogueDecision === "refusee" && motifRefus
            ? { motifRefus }
            : {}),
        }),
      });
      if (!reponse.ok) {
        const corps = (await reponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(corps?.error ?? "Action impossible");
      }
      // Pas de rechargement du résumé : le statut vient d'avancer, l'API
      // répondrait « pas le signataire attendu » à l'utilisateur.
      setTermine(dialogueDecision);
      setDialogueDecision(null);
    } catch (erreur) {
      setErreurDialogue(erreur instanceof Error ? erreur.message : "Erreur");
    } finally {
      setEnCours(false);
    }
  }

  const dateVirementManquante = resume?.etape === "tresorier" && !dateVirement;
  const signatureBloquee = !documentLu || dateVirementManquante;

  return (
    <main className="min-h-screen bg-zinc-50 p-2 sm:p-4">
      <section className="mx-auto max-w-3xl rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Signature électronique
        </h1>

        {chargement && (
          <p className="mt-5 text-sm text-zinc-600">Chargement…</p>
        )}

        {erreurChargement && !chargement && !termine && (
          <p className="mt-5 text-sm text-rose-600">{erreurChargement}</p>
        )}

        {termine && (
          <>
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              {termine === "signee"
                ? "Votre décision a bien été enregistrée."
                : "La note de frais a été refusée ; le circuit de signature est annulé."}
            </div>
            <Link
              href="/"
              className="mt-4 inline-block rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E3A8A]/90"
            >
              Retour à l&rsquo;accueil
            </Link>
          </>
        )}

        {resume && !termine && (
          <div className="mt-5 space-y-5">
            <p className="text-sm font-medium text-zinc-500">
              {LIBELLES_ETAPE[resume.etape]}
            </p>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
              <p>
                <strong>{resume.demandeur}</strong> · {resume.branche}
              </p>
              <p>
                Montant : <strong>{resume.montant.toFixed(2)} €</strong> · Date
                : {resume.date}
              </p>
            </div>

            <div>
              <VisionneusePdf
                url={`/api/note-de-frais/${id}/document`}
                onScrolleJusquauBout={() => setDocumentLu(true)}
                className="h-[65vh] w-full"
              />
              {!documentLu && (
                <p className="mt-2 text-sm text-zinc-500">
                  Faites défiler le document jusqu&rsquo;en bas pour pouvoir
                  signer.
                </p>
              )}
            </div>

            {resume.etape === "tresorier" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">
                  Effectuez le virement avant de signer.
                </p>
                <p className="mt-1">
                  Votre signature atteste que le virement a été fait : ne signez
                  qu&rsquo;une fois le paiement envoyé au bénéficiaire.
                </p>
                {resume.ribDisponible ? (
                  <a
                    href={`/api/note-de-frais/${id}/rib`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block font-semibold underline"
                  >
                    Consulter le RIB
                  </a>
                ) : (
                  <p className="mt-2">
                    Aucun RIB n&rsquo;a été joint à cette note de frais :
                    contactez le bénéficiaire pour obtenir ses coordonnées
                    bancaires.
                  </p>
                )}
              </div>
            )}

            {resume.etape === "tresorier" && (
              <div>
                <label
                  htmlFor="date-virement"
                  className="block text-sm font-medium text-zinc-700"
                >
                  Date du virement
                </label>
                <input
                  id="date-virement"
                  type="date"
                  value={dateVirement}
                  onChange={(evenement) =>
                    setDateVirement(evenement.target.value)
                  }
                  className="mt-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (signatureBloquee) return;
                  ouvrirDialogue("signee");
                }}
                aria-disabled={signatureBloquee}
                // Volontairement pas `disabled` : un bouton HTML désactivé
                // ne reçoit plus aucun événement souris, donc son `title`
                // ne s'affiche jamais au survol (testé). Le clic est bloqué
                // dans le gestionnaire ci-dessus à la place.
                title={
                  !documentLu
                    ? "Faites défiler le document jusqu'en bas d'abord"
                    : dateVirementManquante
                      ? "Indiquez la date du virement"
                      : undefined
                }
                className={`w-full rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors sm:w-auto ${
                  signatureBloquee
                    ? "cursor-not-allowed bg-emerald-600/40"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {resume.etape === "tresorier"
                  ? `Valider le traitement en tant que ${resume.signataireNom}`
                  : `Signer en tant que ${resume.signataireNom}`}
              </button>
              <button
                type="button"
                onClick={() => setAfficherRefus((valeur) => !valeur)}
                className="w-full rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 sm:w-auto"
              >
                Refuser
              </button>
            </div>

            {afficherRefus && (
              <div className="space-y-2">
                <label
                  htmlFor="motif-refus"
                  className="block text-sm font-medium text-zinc-700"
                >
                  Motif du refus (facultatif)
                </label>
                <textarea
                  id="motif-refus"
                  value={motifRefus}
                  onChange={(evenement) =>
                    setMotifRefus(evenement.target.value)
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
                  rows={2}
                />
                <button
                  type="button"
                  onClick={() => ouvrirDialogue("refusee")}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Confirmer le refus
                </button>
              </div>
            )}

            {message && (
              <p role="status" className="text-sm text-zinc-600">
                {message}
              </p>
            )}
          </div>
        )}
      </section>

      {dialogueDecision && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titre-dialogue-code"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
          onClick={fermerDialogue}
        >
          <div
            onClick={(evenement) => evenement.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-xl"
          >
            <h2
              id="titre-dialogue-code"
              className="text-lg font-semibold text-zinc-900"
            >
              Code de vérification
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              {codeEnvoye
                ? "Saisissez le code que nous venons de vous envoyer par e-mail."
                : "Envoi du code par e-mail…"}
            </p>
            <div className="mt-4">
              <SaisieCodeVerification
                valeur={code}
                onChange={setCode}
                desactive={enCours || !codeEnvoye}
              />
            </div>
            {erreurDialogue && (
              <p className="mt-2 text-sm text-rose-600">{erreurDialogue}</p>
            )}
            <button
              type="button"
              onClick={() => void envoyerCode()}
              disabled={enCours}
              className="mt-3 text-sm font-medium text-[#1E3A8A] underline disabled:opacity-50"
            >
              Renvoyer le code
            </button>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={code.length !== 6 || enCours}
                onClick={() => void confirmerDecision()}
                className={`flex-1 rounded-lg p-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  dialogueDecision === "signee"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {enCours
                  ? "Envoi…"
                  : dialogueDecision === "signee"
                    ? resume?.etape === "tresorier"
                      ? "Valider le traitement"
                      : "Signer"
                    : "Confirmer le refus"}
              </button>
              <button
                type="button"
                disabled={enCours}
                onClick={fermerDialogue}
                className="flex-1 rounded-lg border border-zinc-300 p-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
