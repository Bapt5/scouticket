"use client";

import { useEffect, useState, type FormEvent } from "react";
import { clientAuth } from "@/lib/auth-client";

const classeChamp =
  "mt-1 w-full rounded-lg border border-zinc-300 bg-white p-3 text-zinc-900 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-[#1E3A8A]/20";
const classeBouton =
  "rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-60";

/** Section « Mon profil » de la page Mon compte : nom, e-mail et mot de passe. */
export default function ProfilUtilisateur() {
  const { data: session } = clientAuth.useSession();
  const utilisateur = session?.user;

  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [profilEnCours, setProfilEnCours] = useState(false);
  const [erreurProfil, setErreurProfil] = useState("");
  const [succesProfil, setSuccesProfil] = useState("");

  const [ancienMotDePasse, setAncienMotDePasse] = useState("");
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [motDePasseEnCours, setMotDePasseEnCours] = useState(false);
  const [erreurMotDePasse, setErreurMotDePasse] = useState("");
  const [succesMotDePasse, setSuccesMotDePasse] = useState("");

  const [motDePasseOuvert, setMotDePasseOuvert] = useState(false);
  const [aMotDePasse, setAMotDePasse] = useState<boolean | null>(null);
  useEffect(() => {
    let annule = false;
    void clientAuth
      .listAccounts()
      .then(({ data }) => {
        if (annule) return;
        setAMotDePasse(
          !data || data.some((compte) => compte.providerId === "credential"),
        );
      })
      .catch(() => {
        if (!annule) setAMotDePasse(true);
      });
    return () => {
      annule = true;
    };
  }, []);

  const nomSession = utilisateur?.name;
  const emailSession = utilisateur?.email;
  useEffect(() => {
    if (nomSession !== undefined) setNom(nomSession);
    if (emailSession !== undefined) setEmail(emailSession);
  }, [nomSession, emailSession]);

  const enregistrerProfil = async (evenement: FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    if (!utilisateur) return;
    const nomPropre = nom.trim();
    const emailPropre = email.trim();
    const nomModifie = nomPropre !== utilisateur.name;
    const emailModifie =
      emailPropre.toLowerCase() !== utilisateur.email.toLowerCase();

    setErreurProfil("");
    setSuccesProfil("");
    if (!nomModifie && !emailModifie) {
      setSuccesProfil("Aucune modification à enregistrer.");
      return;
    }

    setProfilEnCours(true);
    const messages: string[] = [];
    if (nomModifie) {
      const { error } = await clientAuth.updateUser({ name: nomPropre });
      if (error) {
        setProfilEnCours(false);
        setErreurProfil(
          error.message || "Impossible de modifier le nom. Réessayez.",
        );
        return;
      }
      messages.push("Votre nom a été mis à jour.");
    }
    if (emailModifie) {
      const { error } = await clientAuth.changeEmail({
        newEmail: emailPropre,
        callbackURL: "/compte",
      });
      if (error) {
        setProfilEnCours(false);
        setErreurProfil(
          error.message ||
            "Impossible de modifier l’adresse e-mail. Réessayez.",
        );
        if (messages.length > 0) setSuccesProfil(messages.join(" "));
        return;
      }
      messages.push(
        "Un lien de confirmation a été envoyé à la nouvelle adresse : votre e-mail ne changera qu’après confirmation.",
      );
      setEmail(utilisateur.email);
    }
    setProfilEnCours(false);
    setSuccesProfil(messages.join(" "));
  };

  const modifierMotDePasse = async (evenement: FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    setErreurMotDePasse("");
    setSuccesMotDePasse("");
    setMotDePasseOuvert(true);
    if (nouveauMotDePasse !== confirmation) {
      setErreurMotDePasse("Les mots de passe ne correspondent pas.");
      return;
    }
    setMotDePasseEnCours(true);
    const { error } = await clientAuth.changePassword({
      currentPassword: ancienMotDePasse,
      newPassword: nouveauMotDePasse,
      revokeOtherSessions: true,
    });
    setMotDePasseEnCours(false);
    if (error) {
      setErreurMotDePasse(
        error.message ||
          "Impossible de modifier le mot de passe. Vérifiez l’ancien mot de passe puis réessayez.",
      );
      return;
    }
    setAncienMotDePasse("");
    setNouveauMotDePasse("");
    setConfirmation("");
    setSuccesMotDePasse("Votre mot de passe a été modifié.");
  };

  const profilModifiable = aMotDePasse === true;
  const profilEnChargement = aMotDePasse === null || !utilisateur;
  const classeChampProfil = profilEnChargement
    ? classeChamp.replace("bg-white", "animate-pulse bg-zinc-100")
    : classeChamp;
  const classeBoutonProfil = profilEnChargement
    ? `${classeBouton} animate-pulse`
    : classeBouton;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Mon profil</h2>
        <form onSubmit={enregistrerProfil} className="mt-3 space-y-3">
          <label className="block text-sm font-medium text-zinc-700">
            Nom
            <input
              value={nom}
              onChange={(evenement) => setNom(evenement.target.value)}
              autoComplete="name"
              required
              disabled={!profilModifiable}
              className={classeChampProfil}
            />
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            Adresse e-mail
            <input
              type="email"
              value={email}
              onChange={(evenement) => setEmail(evenement.target.value)}
              autoComplete="email"
              required
              disabled={!profilModifiable}
              className={classeChampProfil}
            />
          </label>
          {erreurProfil && (
            <p role="alert" className="text-sm text-rose-700">
              {erreurProfil}
            </p>
          )}
          {succesProfil && (
            <p role="status" className="text-sm text-emerald-700">
              {succesProfil}
            </p>
          )}
          {aMotDePasse === false ? (
            <p className="text-sm text-zinc-700">
              Vous êtes connecté avec Google. Votre nom et votre adresse e-mail
              se gèrent depuis votre compte Google : ils ne peuvent pas être
              modifiés ici.
            </p>
          ) : (
            <button
              type="submit"
              disabled={profilEnCours || !utilisateur || !profilModifiable}
              className={classeBoutonProfil}
            >
              {profilEnCours ? "Enregistrement…" : "Enregistrer"}
            </button>
          )}
        </form>
      </section>

      <details
        open={motDePasseOuvert}
        onToggle={(evenement) =>
          setMotDePasseOuvert(evenement.currentTarget.open)
        }
        className="rounded-lg border border-zinc-200 p-4"
      >
        <summary className="cursor-pointer text-lg font-semibold text-zinc-900">
          Modifier mon mot de passe
        </summary>
        {aMotDePasse === null && (
          <p className="mt-3 text-sm text-zinc-700">Chargement…</p>
        )}
        {aMotDePasse === false && (
          <p className="mt-3 text-sm text-zinc-700">
            Vous êtes connecté avec Google : votre mot de passe se gère depuis
            votre compte Google et ne peut pas être modifié ici.
          </p>
        )}
        {aMotDePasse === true && (
          <form onSubmit={modifierMotDePasse} className="mt-3 space-y-3">
            <label className="block text-sm font-medium text-zinc-700">
              Ancien mot de passe
              <input
                type="password"
                value={ancienMotDePasse}
                onChange={(evenement) =>
                  setAncienMotDePasse(evenement.target.value)
                }
                autoComplete="current-password"
                required
                className={classeChamp}
              />
            </label>
            <label className="block text-sm font-medium text-zinc-700">
              Nouveau mot de passe
              <input
                type="password"
                value={nouveauMotDePasse}
                onChange={(evenement) =>
                  setNouveauMotDePasse(evenement.target.value)
                }
                autoComplete="new-password"
                minLength={8}
                required
                className={classeChamp}
              />
            </label>
            <label className="block text-sm font-medium text-zinc-700">
              Confirmer le nouveau mot de passe
              <input
                type="password"
                value={confirmation}
                onChange={(evenement) =>
                  setConfirmation(evenement.target.value)
                }
                autoComplete="new-password"
                minLength={8}
                required
                className={classeChamp}
              />
            </label>
            {erreurMotDePasse && (
              <p role="alert" className="text-sm text-rose-700">
                {erreurMotDePasse}
              </p>
            )}
            {succesMotDePasse && (
              <p role="status" className="text-sm text-emerald-700">
                {succesMotDePasse}
              </p>
            )}
            <button
              type="submit"
              disabled={motDePasseEnCours}
              className={classeBouton}
            >
              {motDePasseEnCours
                ? "Enregistrement…"
                : "Modifier le mot de passe"}
            </button>
          </form>
        )}
      </details>
    </div>
  );
}
