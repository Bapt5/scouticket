"use client";

import { useEffect, useState } from "react";
import { CheckIcon, MinusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { UniteGroupe } from "@/lib/group";

type Membre = { id: string; nom: string; email: string; role: string };

function libelleRole(role: string) {
  if (role === "owner") return "Responsable";
  if (role === "admin") return "Administrateur";
  return "Membre";
}

export function GestionAccesUniteMembre({
  membre,
  onClose,
  onMembreRetire,
}: {
  readonly membre: Membre;
  readonly onClose: () => void;
  readonly onMembreRetire: (membreId: string) => void;
}) {
  const [chargement, setChargement] = useState(true);
  const [accesTotal, setAccesTotal] = useState(false);
  const [unites, setUnites] = useState<UniteGroupe[]>([]);
  const [uniteIdsAutorisees, setUniteIdsAutorisees] = useState<Set<string>>(
    new Set(),
  );
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmationRetrait, setConfirmationRetrait] = useState(false);
  const [retraitEnCours, setRetraitEnCours] = useState(false);

  useEffect(() => {
    let annule = false;
    fetch(`/api/group/members/${membre.id}/unites`)
      .then((reponse) => (reponse.ok ? reponse.json() : null))
      .then(
        (
          corps: {
            accesTotal: boolean;
            unites: UniteGroupe[];
            uniteIdsAutorisees: string[];
          } | null,
        ) => {
          if (annule) return;
          if (!corps) {
            setMessage("Impossible de charger les accès de ce membre.");
            return;
          }
          setAccesTotal(corps.accesTotal);
          setUnites(corps.unites);
          setUniteIdsAutorisees(new Set(corps.uniteIdsAutorisees));
        },
      )
      .catch(() => {
        if (!annule)
          setMessage("Impossible de charger les accès de ce membre.");
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
  }, [membre.id]);

  const basculerUnite = (uniteId: string) =>
    setUniteIdsAutorisees((precedent) => {
      const suivant = new Set(precedent);
      if (suivant.has(uniteId)) suivant.delete(uniteId);
      else suivant.add(uniteId);
      return suivant;
    });

  const etatToutSelectionner =
    uniteIdsAutorisees.size === 0
      ? "aucune"
      : uniteIdsAutorisees.size === unites.length
        ? "toutes"
        : "partiel";

  const basculerTout = () =>
    setUniteIdsAutorisees(
      // Majorité déjà cochée (ou tout coché) : on décoche tout : sinon on
      // sélectionne tout, y compris depuis une sélection partielle minoritaire.
      uniteIdsAutorisees.size > unites.length / 2
        ? new Set()
        : new Set(unites.map((unite) => unite.id)),
    );

  const enregistrer = async () => {
    setEnregistrement(true);
    setMessage("");
    const reponse = await fetch(`/api/group/members/${membre.id}/unites`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uniteIds: [...uniteIdsAutorisees] }),
    });
    setEnregistrement(false);
    setMessage(
      reponse.ok
        ? "Accès enregistrés."
        : "Impossible d’enregistrer les accès. Réessayez.",
    );
  };

  const retirerMembre = async () => {
    setRetraitEnCours(true);
    setMessage("");
    const reponse = await fetch(`/api/group/members/${membre.id}`, {
      method: "DELETE",
    });
    if (reponse.ok) {
      onMembreRetire(membre.id);
      return;
    }
    setRetraitEnCours(false);
    setConfirmationRetrait(false);
    const corps = (await reponse.json().catch(() => null)) as {
      error?: string;
    } | null;
    setMessage(corps?.error ?? "Impossible de retirer ce membre.");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titre-acces-unite-membre"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex h-[32rem] w-full max-w-md flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 p-6">
          <div className="min-w-0">
            <h2
              id="titre-acces-unite-membre"
              className="truncate text-lg font-semibold text-zinc-900"
            >
              {membre.nom || membre.email}
            </h2>
            {membre.nom && (
              <p className="truncate text-sm text-zinc-500">{membre.email}</p>
            )}
            <p className="mt-1 text-sm text-zinc-600">
              {libelleRole(membre.role)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 rounded-xl p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {chargement ? (
            <p className="text-sm text-zinc-600">Chargement…</p>
          ) : accesTotal ? (
            <p className="text-sm text-zinc-600">
              Ce membre a accès à toutes les unités du groupe (responsable ou
              administrateur).
            </p>
          ) : unites.length === 0 ? (
            <p className="text-sm text-zinc-600">
              Ce groupe n’a pas encore d’unité configurée.
            </p>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={
                  etatToutSelectionner === "partiel"
                    ? "mixed"
                    : etatToutSelectionner === "toutes"
                }
                onClick={basculerTout}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-zinc-300 p-3 text-left text-sm text-zinc-600 transition-colors hover:border-[#1E3A8A] hover:bg-blue-50"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  Tout sélectionner
                </span>
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    etatToutSelectionner === "aucune"
                      ? "border-zinc-400"
                      : "border-zinc-600 bg-zinc-600"
                  }`}
                >
                  {etatToutSelectionner === "partiel" && (
                    <MinusIcon className="h-3.5 w-3.5 text-white" />
                  )}
                  {etatToutSelectionner === "toutes" && (
                    <CheckIcon className="h-3.5 w-3.5 text-white" />
                  )}
                </span>
              </button>
              {unites.map((unite) => {
                const autorisee = uniteIdsAutorisees.has(unite.id);
                return (
                  <button
                    key={unite.id}
                    type="button"
                    aria-pressed={autorisee}
                    onClick={() => basculerUnite(unite.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition-colors ${
                      autorisee
                        ? "border-[#1E3A8A] bg-blue-50"
                        : "border-zinc-200 hover:bg-zinc-50"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: unite.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-zinc-800">
                      {unite.label}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        autorisee
                          ? "border-[#1E3A8A] bg-[#1E3A8A]"
                          : "border-zinc-300"
                      }`}
                    >
                      {autorisee && (
                        <CheckIcon className="h-3.5 w-3.5 text-white" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-200 p-6">
          {message && <p className="mb-3 text-sm text-zinc-600">{message}</p>}
          {!chargement && !accesTotal && (
            <button
              type="button"
              disabled={enregistrement}
              onClick={() => void enregistrer()}
              className="w-full rounded-xl bg-[#1E3A8A] p-3 font-semibold text-white shadow-sm transition-colors hover:bg-[#162d69] focus:outline-none focus:ring-2 focus:ring-[#1E3A8A] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {enregistrement ? "Enregistrement…" : "Enregistrer les accès"}
            </button>
          )}
          {membre.role !== "owner" &&
            (confirmationRetrait ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-900">
                  Retirer ce membre du groupe ?
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={retraitEnCours}
                    onClick={() => void retirerMembre()}
                    className="flex-1 rounded-lg bg-red-700 p-2 text-sm font-semibold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {retraitEnCours ? "Retrait…" : "Confirmer"}
                  </button>
                  <button
                    type="button"
                    disabled={retraitEnCours}
                    onClick={() => setConfirmationRetrait(false)}
                    className="flex-1 rounded-lg border border-zinc-300 p-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmationRetrait(true)}
                className="mt-3 w-full rounded-xl border border-red-200 p-3 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
              >
                Retirer l’utilisateur
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
