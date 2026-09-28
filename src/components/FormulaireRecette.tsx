"use client";

import { useState, type FormEvent } from "react";
import {
  BanknotesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  type PieceJointeDepense,
} from "@/constants/piecesJointes";
import {
  CATEGORIES_COMPTABLES_RECETTES,
  MOYENS_PAIEMENT_RECETTE,
} from "@/constants/configRecettes";
import { analyserMontantSaisi, totalLignes } from "@/lib/depenses";
import {
  detailSaisieRecetteComplet,
  detailSaisieRecetteVide,
  type DetailSaisieRecette,
} from "@/lib/recettes";
import { LignesCategories } from "@/components/LignesCategories";
import { CapturePhoto } from "@/components/PhotoCapture";
import type { UniteGroupe } from "@/lib/group";

interface FormulaireRecetteProps {
  readonly emailUtilisateur: string;
  readonly units: UniteGroupe[];
  readonly uniteInitiale?: string;
  readonly aTresorier: boolean;
  readonly onChangementUnite?: (unitId: string) => void;
  readonly estEnLigne: boolean;
  /** Recadrage automatique de la pièce jointe avec Scanic (paramètre du groupe). */
  readonly scanActive?: boolean;
}

export function FormulaireRecette({
  emailUtilisateur,
  units,
  uniteInitiale = "",
  aTresorier,
  onChangementUnite,
  estEnLigne,
  scanActive,
}: Readonly<FormulaireRecetteProps>) {
  const [branche, setBranche] = useState(uniteInitiale);
  const [detail, setDetail] = useState<DetailSaisieRecette>(
    detailSaisieRecetteVide(),
  );
  const [pieceJointe, setPieceJointe] = useState<PieceJointeDepense | null>(
    null,
  );
  const [afficherErreursValidation, setAfficherErreursValidation] =
    useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [statutEnvoi, setStatutEnvoi] = useState<{
    type: "succes" | "erreur" | null;
    message: string;
  }>({ type: null, message: "" });

  const uniteSelectionnee = units.find((unit) => unit.id === branche);
  const total = totalLignes(
    detail.lignes.map((ligne) => ({
      montant: analyserMontantSaisi(ligne.montant),
    })),
  );
  const detailValide = detailSaisieRecetteComplet(detail);
  const formulaireEstValide = Boolean(branche && detailValide);
  const erreurUnite = afficherErreursValidation && !branche;

  const envoyerRecette = async (evenement: FormEvent) => {
    evenement.preventDefault();
    setAfficherErreursValidation(true);
    if (!formulaireEstValide) return;

    setEnvoiEnCours(true);
    setStatutEnvoi({ type: null, message: "" });

    try {
      const reponse = await fetch("/api/send-recette", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail: emailUtilisateur,
          unitId: branche,
          recette: {
            date: detail.date,
            paymentMethod: detail.modePaiement,
            description: detail.description,
            lines: detail.lignes.map((ligne) => ({
              category: ligne.categorie,
              amount: analyserMontantSaisi(ligne.montant),
            })),
          },
          ...(pieceJointe
            ? {
                attachment: {
                  displayName: pieceJointe.nomAffiche,
                  mimeType: pieceJointe.typeMime,
                  base64Data: pieceJointe.donneesBase64,
                  originalFileName: pieceJointe.nomFichierOriginal,
                },
              }
            : {}),
        }),
      });

      const texteReponse = await reponse.text();
      let erreurApi = "";
      if (texteReponse) {
        try {
          const donnees = JSON.parse(texteReponse) as { error?: string };
          erreurApi = donnees.error || "";
        } catch {
          // Certaines erreurs plateforme (ex. 413) ne renvoient pas du JSON.
        }
      }

      if (reponse.ok) {
        setStatutEnvoi({
          type: "succes",
          message:
            "Email envoyé avec succès ! La recette a été transmise à la trésorerie et une copie vous a été envoyée.",
        });
        setDetail(detailSaisieRecetteVide());
        setPieceJointe(null);
        setAfficherErreursValidation(false);
      } else {
        const piecesJointesTropLourdes =
          reponse.status === 413 ||
          /payload too large|request entity too large|function_payload_too_large/i.test(
            texteReponse,
          );
        const erreurValidation = reponse.status === 400;
        const erreurAuth = reponse.status === 401 || reponse.status === 403;
        const tropDeTentatives = reponse.status === 429;
        const erreurServeur = reponse.status >= 500;

        let messageErreur = erreurApi || "Erreur lors de l'envoi de l'email";
        if (piecesJointesTropLourdes) {
          messageErreur = `Pièce jointe trop volumineuse (max ${(MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB), réessayez.`;
        } else if (erreurAuth) {
          messageErreur =
            "Session expirée ou accès refusé. Veuillez vous reconnecter puis réessayer.";
        } else if (tropDeTentatives) {
          messageErreur =
            "Trop de tentatives. Veuillez patienter quelques minutes puis réessayer.";
        } else if (erreurServeur) {
          messageErreur =
            "Erreur serveur temporaire. Veuillez réessayer plus tard.";
        } else if (erreurValidation && !erreurApi) {
          messageErreur =
            "Données invalides. Vérifiez le formulaire puis réessayez.";
        }
        setStatutEnvoi({ type: "erreur", message: messageErreur });
      }
    } catch (erreur) {
      console.error("Erreur:", erreur);
      setStatutEnvoi({
        type: "erreur",
        message: "Erreur de connexion. Veuillez réessayer.",
      });
    } finally {
      setEnvoiEnCours(false);
    }
  };

  return (
    <form noValidate onSubmit={envoyerRecette} className="space-y-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
        <BanknotesIcon className="h-5 w-5 text-zinc-700" aria-hidden="true" />
        Informations de la recette
      </h2>

      <div className="space-y-2">
        <label
          htmlFor="date-recette"
          className="block text-sm font-medium text-zinc-700"
        >
          Date de la recette *
        </label>
        <input
          id="date-recette"
          type="date"
          value={detail.date}
          onChange={(e) =>
            setDetail((precedent) => ({ ...precedent, date: e.target.value }))
          }
          className="w-full rounded-lg border border-zinc-300 bg-white p-3 text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-zinc-700">
          Mode de paiement *
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {MOYENS_PAIEMENT_RECETTE.map((moyen) => {
            const selectionne = detail.modePaiement === moyen;
            return (
              <label
                key={moyen}
                className={`cursor-pointer rounded-lg border p-2 text-center text-sm font-medium transition-colors ${
                  selectionne
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <input
                  type="radio"
                  name="mode-paiement-recette"
                  value={moyen}
                  checked={selectionne}
                  onChange={() =>
                    setDetail((precedent) => ({
                      ...precedent,
                      modePaiement: moyen,
                    }))
                  }
                  className="sr-only"
                />
                {moyen}
              </label>
            );
          })}
        </div>
        {afficherErreursValidation && !detail.modePaiement && (
          <p className="text-sm text-rose-700">
            Sélectionnez un mode de paiement.
          </p>
        )}
      </fieldset>

      <LignesCategories
        idPrefixe="recette"
        lignes={detail.lignes}
        onChange={(lignes) =>
          setDetail((precedent) => ({ ...precedent, lignes }))
        }
        afficherErreurs={afficherErreursValidation}
        categories={CATEGORIES_COMPTABLES_RECETTES}
      />

      <div className="space-y-2">
        <label
          htmlFor="description-recette"
          className="block text-sm font-medium text-zinc-700"
        >
          Description (optionnel)
        </label>
        <textarea
          id="description-recette"
          value={detail.description}
          onChange={(e) =>
            setDetail((precedent) => ({
              ...precedent,
              description: e.target.value,
            }))
          }
          rows={2}
          className="w-full rounded-lg border border-zinc-300 bg-white p-3 text-zinc-900 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
      </div>

      <div className="space-y-2">
        {pieceJointe ? (
          <>
            <p className="block text-sm font-medium text-zinc-700">
              Justificatif (optionnel)
            </p>
            <p className="flex items-center justify-between gap-2 text-sm text-zinc-700">
              <span>{pieceJointe.nomAffiche}</span>
              <button
                type="button"
                onClick={() => setPieceJointe(null)}
                className="text-rose-700 underline"
              >
                Retirer
              </button>
            </p>
          </>
        ) : (
          <CapturePhoto
            onAttachmentsAdd={(nouvelles) =>
              setPieceJointe(nouvelles[0] ?? null)
            }
            currentCount={0}
            maxFichiers={1}
            scanActive={scanActive}
            titre="Justificatif (optionnel)"
          />
        )}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="branche-recette"
          className="block text-sm font-medium text-zinc-700"
        >
          Unité *
        </label>
        <select
          id="branche-recette"
          value={branche}
          onChange={(e) => {
            setBranche(e.target.value);
            onChangementUnite?.(e.target.value);
          }}
          aria-invalid={erreurUnite}
          className={`w-full rounded-lg border p-3 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 bg-white text-zinc-900 ${
            erreurUnite ? "border-rose-500" : "border-zinc-300"
          }`}
        >
          <option value="">Sélectionner une unité</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.label}
            </option>
          ))}
        </select>
        {erreurUnite && (
          <p className="text-sm text-rose-700">Sélectionnez une unité.</p>
        )}
        {uniteSelectionnee && (
          <div
            className="mt-2 h-1.5 rounded-full"
            style={{ backgroundColor: uniteSelectionnee.color }}
          />
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <span className="text-sm font-medium text-zinc-700">
          Total de la recette
        </span>
        <span className="text-lg font-bold text-zinc-900">
          {total.toFixed(2)} €
        </span>
      </div>

      {statutEnvoi.type && (
        <div
          className={`space-y-3 rounded-lg p-4 ${
            statutEnvoi.type === "succes"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <p className="flex items-start gap-2 text-sm">
            {statutEnvoi.type === "succes" ? (
              <CheckCircleIcon
                className="h-5 w-5 flex-none"
                aria-hidden="true"
              />
            ) : (
              <ExclamationTriangleIcon
                className="h-5 w-5 flex-none"
                aria-hidden="true"
              />
            )}
            <span>{statutEnvoi.message}</span>
          </p>
        </div>
      )}

      {formulaireEstValide && !statutEnvoi.type && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-sm text-zinc-800">
            <span className="inline-flex items-center gap-2 font-medium">
              <PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" /> Email
              sera envoyé à :
            </span>
            <br />• Trésorerie : votre groupe
            <br />• Vous : {emailUtilisateur}
          </p>
        </div>
      )}

      {!estEnLigne && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <ExclamationTriangleIcon
            className="mt-0.5 h-5 w-5"
            aria-hidden="true"
          />
          <span>
            Vous êtes hors ligne. Vous pouvez préparer la recette mais
            l&apos;envoi ne fonctionnera qu&apos;une fois reconnecté.
          </span>
        </div>
      )}

      <button
        type="submit"
        disabled={envoiEnCours || !estEnLigne || !aTresorier}
        className={`w-full rounded-lg p-4 font-semibold text-white transition-colors focus:outline-none ${
          !envoiEnCours && estEnLigne && aTresorier
            ? "bg-zinc-900 hover:bg-zinc-800 focus:ring-2 focus:ring-zinc-400"
            : "cursor-not-allowed bg-zinc-300"
        }`}
      >
        {!aTresorier
          ? "Aucun trésorier n'est configuré pour ce groupe"
          : envoiEnCours
            ? "Envoi en cours…"
            : "Envoyer la recette"}
      </button>
    </form>
  );
}
