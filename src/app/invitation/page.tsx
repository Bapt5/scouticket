"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clientAuth } from "@/lib/auth-client";

function messageErreurInvitation(code: string | undefined) {
  if (code === "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION")
    return "Cette invitation est réservée à une autre adresse e-mail. Connectez-vous avec l’adresse invitée.";
  if (
    code ===
    "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION"
  )
    return "Confirmez d’abord votre adresse e-mail avant d’accepter cette invitation.";
  if (code === "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED")
    return "Ce groupe a atteint son nombre maximal de membres.";
  return "Invitation invalide ou expirée.";
}

type ErreurInvitation = {
  code?: string;
};

type EtatInvitation =
  "chargement" | "en_attente" | "deja_acceptee" | "invalide";

type InvitationVerifiee = {
  nomGroupe: string;
  statut: "en_attente" | "deja_acceptee";
};

function extraireErreurInvitation(erreur: unknown): ErreurInvitation {
  if (typeof erreur !== "object" || erreur === null) return {};
  const valeur = erreur as Record<string, unknown>;
  return {
    ...(typeof valeur.code === "string" ? { code: valeur.code } : {}),
  };
}

function avecDelai<T>(promesse: Promise<T>, delaiMs: number) {
  return Promise.race([
    promesse,
    new Promise<never>((_, rejeter) => {
      window.setTimeout(() => rejeter(new Error("DELAI_DEPASSE")), delaiMs);
    }),
  ]);
}

/** Affiche une invitation de groupe et permet d’y répondre. */
export default function PageInvitation({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const routeur = useRouter();
  const {
    data: session,
    isPending,
    refetch: rafraichirSession,
  } = clientAuth.useSession();
  const [invitationId, setInvitationId] = useState<string>();
  const [nomGroupe, setNomGroupe] = useState<string>();
  const [etatInvitation, setEtatInvitation] =
    useState<EtatInvitation>("chargement");
  const [message, setMessage] = useState("");
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    let annule = false;
    void searchParams
      .then(({ id }) => {
        let identifiant =
          new URLSearchParams(window.location.search).get("id") || id;
        if (!identifiant) {
          const retour = window.sessionStorage.getItem("invitation-retour");
          if (retour) {
            const urlRetour = new URL(retour, window.location.origin);
            if (
              urlRetour.origin === window.location.origin &&
              urlRetour.pathname === "/invitation"
            )
              identifiant = urlRetour.searchParams.get("id") || undefined;
          }
        }

        if (annule) return;
        setInvitationId(identifiant);
        if (!identifiant) {
          setEtatInvitation("invalide");
          return;
        }
        void fetch(`/api/invitation?id=${encodeURIComponent(identifiant)}`)
          .then(async (reponse) => {
            if (!reponse.ok) return null;
            return (await reponse.json()) as InvitationVerifiee;
          })
          .then((invitation) => {
            if (annule) return;
            if (!invitation) {
              setEtatInvitation("invalide");
              return;
            }
            setNomGroupe(invitation.nomGroupe);
            setEtatInvitation(invitation.statut);
          })
          .catch(() => {
            if (!annule) setEtatInvitation("invalide");
          });
      })
      .catch(() => {
        if (!annule) setEtatInvitation("invalide");
      });
    return () => {
      annule = true;
    };
  }, [searchParams]);
  useEffect(() => {
    if (
      isPending ||
      session ||
      enCours ||
      !invitationId ||
      etatInvitation !== "en_attente"
    )
      return;
    const retour = new URLSearchParams({
      callbackURL: `/invitation?id=${invitationId}`,
      invitation: "1",
    });
    window.location.replace(`/sign-in?${retour.toString()}`);
  }, [enCours, etatInvitation, invitationId, isPending, session]);
  useEffect(() => {
    if (etatInvitation !== "deja_acceptee") return;
    window.sessionStorage.removeItem("invitation-retour");
    const minuterie = window.setTimeout(() => routeur.replace("/"), 3_000);
    return () => window.clearTimeout(minuterie);
  }, [etatInvitation, routeur]);
  const accepter = async () => {
    if (!invitationId || enCours || etatInvitation !== "en_attente") return;
    setEnCours(true);
    setMessage("");
    try {
      const resultat = await avecDelai(
        clientAuth.organization.acceptInvitation({ invitationId }),
        15_000,
      );
      if (resultat.error) {
        const erreur = extraireErreurInvitation(resultat.error);
        setMessage(`${messageErreurInvitation(erreur.code)}`);
        setEnCours(false);
        return;
      }
      setMessage("Invitation acceptée. Redirection…");
      window.sessionStorage.removeItem("invitation-retour");
      const identifiantOrganisation = resultat.data?.invitation?.organizationId;
      if (identifiantOrganisation) {
        void fetch("/api/user/default-group", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId: identifiantOrganisation }),
          keepalive: true,
        }).catch(() => {});
      }
      try {
        await rafraichirSession?.();
      } catch {
        // La session déjà active reste exploitable si son rafraîchissement échoue.
      }
      routeur.replace("/");
    } catch (erreur) {
      const estDelaiDepasse =
        erreur instanceof Error && erreur.message === "DELAI_DEPASSE";
      setMessage(
        estDelaiDepasse
          ? "L’acceptation prend trop de temps. Vérifiez votre connexion puis réessayez. (code : DELAI_DEPASSE)"
          : "Impossible d’accepter cette invitation. Réessayez.",
      );
      setEnCours(false);
    }
  };
  const refuser = async () => {
    if (!invitationId || etatInvitation !== "en_attente") return;
    const resultat = await clientAuth.organization.rejectInvitation({
      invitationId,
    });
    setMessage(
      resultat.error
        ? "Impossible de refuser cette invitation."
        : "Invitation refusée.",
    );
    if (!resultat.error) window.sessionStorage.removeItem("invitation-retour");
  };
  if (etatInvitation === "chargement")
    return (
      <main className="min-h-screen bg-zinc-50 p-6 text-center text-zinc-600">
        Chargement de l’invitation…
      </main>
    );
  if (etatInvitation === "invalide")
    return (
      <main className="min-h-screen bg-zinc-50 p-6 flex items-center justify-center">
        <section className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 text-center">
          <h1 className="text-xl font-semibold text-[#1E3A8A]">
            Invitation invalide ou expirée
          </h1>
          <p className="mt-2 text-zinc-600">
            Cette invitation est invalide, expirée ou ne vous est pas destinée.
          </p>
          <Link href="/" className="mt-4 inline-block text-[#1E3A8A] underline">
            Retour à l’accueil
          </Link>
        </section>
      </main>
    );
  if (!session)
    return (
      <main className="min-h-screen bg-zinc-50 p-6 text-center">
        <p>Redirection vers la connexion…</p>
        <Link
          href="/sign-in"
          className="mt-4 inline-block text-[#1E3A8A] underline"
        >
          Accéder à la connexion
        </Link>
      </main>
    );
  if (etatInvitation === "deja_acceptee")
    return (
      <main className="min-h-screen bg-zinc-50 p-6 flex items-center justify-center">
        <section className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 text-center">
          <h1 className="text-xl font-semibold text-[#1E3A8A]">
            Invitation déjà acceptée
          </h1>
          <p className="mt-2 text-zinc-600">
            Vous avez déjà rejoint {nomGroupe || "ce groupe"}. Redirection…
          </p>
          <Link href="/" className="mt-4 inline-block text-[#1E3A8A] underline">
            Retourner à l’accueil
          </Link>
        </section>
      </main>
    );
  return (
    <main className="min-h-screen bg-zinc-50 p-6 flex items-center justify-center">
      <section className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 text-center">
        <h1 className="text-xl font-semibold text-[#1E3A8A]">
          Invitation Scouticket
        </h1>
        <p className="mt-2 text-zinc-600">
          Vous allez rejoindre {nomGroupe || "ce groupe"}.
        </p>
        <button
          type="button"
          onClick={() => void accepter()}
          disabled={enCours}
          className="mt-5 rounded-lg bg-[#1E3A8A] px-5 py-3 text-white disabled:opacity-50"
        >
          {enCours ? "Acceptation…" : "Accepter l’invitation"}
        </button>
        <button
          type="button"
          onClick={() => void refuser()}
          disabled={enCours}
          className="mt-3 block w-full text-sm text-zinc-600 underline disabled:opacity-50"
        >
          Refuser l’invitation
        </button>
        {message && (
          <p role="alert" className="mt-4 text-zinc-600">
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
