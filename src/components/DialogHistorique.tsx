"use client";

import { useState } from "react";
import { LignesCategories } from "@/components/LignesCategories";
import {
  categoriesPourTypeEnvoi,
  type CategorieComptable,
} from "@/constants/configDepenses";
import {
  CATEGORIES_COMPTABLES_RECETTES,
  MOYENS_PAIEMENT_RECETTE,
} from "@/constants/configRecettes";
import {
  analyserMontantSaisi,
  montantSaisiValide,
  totalLignes,
  type LigneSaisie,
} from "@/lib/depenses";
import {
  LIBELLES_TYPES_HISTORIQUE,
  formaterDateHistorique,
  formaterMontantHistorique,
  type LigneHistoriqueApi,
} from "@/lib/historique";
import type { UniteGroupe } from "@/lib/group";

interface DialogHistoriqueProps {
  readonly entree: LigneHistoriqueApi;
  readonly responsable: boolean;
  readonly unites: readonly UniteGroupe[];
  readonly moyensPaiement: readonly string[];
  readonly onFermer: () => void;
  /** Appelé après une modification ou une suppression réussie. */
  readonly onChange: () => void;
}

const categoriesPourEntree = (
  type: LigneHistoriqueApi["type"],
): readonly CategorieComptable[] =>
  type === "recette"
    ? CATEGORIES_COMPTABLES_RECETTES
    : type === "note-de-frais"
      ? categoriesPourTypeEnvoi("note-de-frais")
      : categoriesPourTypeEnvoi("depense-groupe");

const classeChamp =
  "w-full rounded-lg border border-zinc-300 bg-white p-2 text-zinc-900 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400";

function Champ({
  libelle,
  children,
}: {
  readonly libelle: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase text-zinc-500">{libelle}</dt>
      <dd className="mt-1 text-zinc-900">{children}</dd>
    </div>
  );
}

/** Détail d'une ligne d'historique, avec modification et suppression pour les responsables. */
export function DialogHistorique({
  entree,
  responsable,
  unites,
  moyensPaiement,
  onFermer,
  onChange,
}: DialogHistoriqueProps) {
  const [edition, setEdition] = useState(false);
  const [suppressionDemandee, setSuppressionDemandee] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [afficherErreurs, setAfficherErreurs] = useState(false);

  const [date, setDate] = useState(entree.date);
  const [uniteId, setUniteId] = useState(entree.uniteId ?? "");
  const [modePaiement, setModePaiement] = useState(entree.modePaiement);
  const [activite, setActivite] = useState(entree.activite);
  const [description, setDescription] = useState(entree.description);
  const [lignes, setLignes] = useState<LigneSaisie[]>(
    entree.lignes.map((ligne) => ({
      categorie: ligne.categorie,
      montant: String(ligne.montant),
    })),
  );

  const fermer = () => {
    if (!enCours) onFermer();
  };

  const montantsValides = lignes.every(
    (ligne) =>
      ligne.categorie &&
      montantSaisiValide(ligne.montant) &&
      Math.round(analyserMontantSaisi(ligne.montant) * 100) / 100 ===
        analyserMontantSaisi(ligne.montant),
  );
  const formulaireValide = Boolean(date) && montantsValides;

  const appeler = async (
    requete: Promise<Response>,
    messageErreur: string,
  ): Promise<boolean> => {
    setEnCours(true);
    setErreur("");
    try {
      const reponse = await requete;
      if (!reponse.ok) {
        const corps = (await reponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        setErreur(corps?.error ?? messageErreur);
        return false;
      }
      return true;
    } catch {
      setErreur(messageErreur);
      return false;
    } finally {
      setEnCours(false);
    }
  };

  const enregistrer = async () => {
    setAfficherErreurs(true);
    if (!formulaireValide) return;
    const ok = await appeler(
      fetch(`/api/historique/${entree.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          ...(uniteId && { uniteId }),
          modePaiement,
          activite,
          description,
          lignes: lignes.map((ligne) => ({
            categorie: ligne.categorie,
            montant: analyserMontantSaisi(ligne.montant),
          })),
        }),
      }),
      "Impossible d’enregistrer les modifications.",
    );
    if (ok) onChange();
  };

  const supprimer = async () => {
    const ok = await appeler(
      fetch(`/api/historique/${entree.id}`, { method: "DELETE" }),
      "Impossible de supprimer cette entrée.",
    );
    if (ok) onChange();
  };

  // Le moyen enregistré reste proposé même s'il n'est plus dans la liste du groupe.
  const moyensProposes: readonly string[] =
    entree.type === "recette" ? MOYENS_PAIEMENT_RECETTE : moyensPaiement;
  const optionsModePaiement = moyensProposes.includes(entree.modePaiement)
    ? moyensProposes
    : [entree.modePaiement, ...moyensProposes].filter(Boolean);
  const totalEdition = totalLignes(
    lignes.map((ligne) => ({ montant: analyserMontantSaisi(ligne.montant) })),
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titre-dialog-historique"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      onClick={fermer}
    >
      <div
        onClick={(evenement) => evenement.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="titre-dialog-historique"
            className="text-lg font-semibold text-zinc-900"
          >
            {LIBELLES_TYPES_HISTORIQUE[entree.type]} du{" "}
            {formaterDateHistorique(entree.date)}
          </h2>
          <p className="text-lg font-semibold text-zinc-900">
            {formaterMontantHistorique(
              edition ? totalEdition : entree.montantTotal,
            )}
          </p>
        </div>

        {edition ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-zinc-700">
                Date
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`mt-1 ${classeChamp}`}
                />
              </label>
              <label className="block text-sm font-medium text-zinc-700">
                Unité
                <select
                  value={uniteId}
                  onChange={(e) => setUniteId(e.target.value)}
                  className={`mt-1 ${classeChamp}`}
                >
                  {!entree.uniteId && (
                    <option value="">{entree.uniteLabel} (supprimée)</option>
                  )}
                  {unites.map((unite) => (
                    <option key={unite.id} value={unite.id}>
                      {unite.label}
                    </option>
                  ))}
                </select>
              </label>
              {entree.type !== "note-de-frais" && (
                <label className="block text-sm font-medium text-zinc-700">
                  Mode de paiement
                  <select
                    value={modePaiement}
                    onChange={(e) => setModePaiement(e.target.value)}
                    className={`mt-1 ${classeChamp}`}
                  >
                    {optionsModePaiement.map((moyen) => (
                      <option key={moyen} value={moyen}>
                        {moyen}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {entree.type === "note-de-frais" && (
                <label className="block text-sm font-medium text-zinc-700">
                  Activité
                  <input
                    value={activite}
                    maxLength={200}
                    onChange={(e) => setActivite(e.target.value)}
                    className={`mt-1 ${classeChamp}`}
                  />
                </label>
              )}
            </div>
            <label className="block text-sm font-medium text-zinc-700">
              Description
              <textarea
                value={description}
                maxLength={1000}
                rows={2}
                onChange={(e) => setDescription(e.target.value)}
                className={`mt-1 ${classeChamp}`}
              />
            </label>
            <LignesCategories
              idPrefixe="historique"
              lignes={lignes}
              onChange={setLignes}
              afficherErreurs={afficherErreurs}
              categories={categoriesPourEntree(entree.type)}
            />
          </div>
        ) : (
          <>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Champ libelle="Référence">
                {entree.reference ?? (
                  <span className="text-zinc-500">Aucune</span>
                )}
              </Champ>
              <Champ libelle="Unité">
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: entree.uniteCouleur }}
                  />
                  {entree.uniteLabel}
                </span>
              </Champ>
              {entree.modePaiement && (
                <Champ libelle="Mode de paiement">{entree.modePaiement}</Champ>
              )}
              {entree.activite && (
                <Champ libelle="Activité">{entree.activite}</Champ>
              )}
              {entree.description && (
                <Champ libelle="Description">{entree.description}</Champ>
              )}
              <Champ libelle="Saisie par">
                {entree.auteurNom ?? "Ancien membre"}
              </Champ>
              {entree.modifieLe && (
                <Champ libelle="Dernière modification">
                  Modifié le{" "}
                  {new Date(entree.modifieLe).toLocaleDateString("fr-FR")} par{" "}
                  {entree.modifieParNom ?? "un ancien membre"}
                </Champ>
              )}
            </dl>
            <h3 className="mt-5 text-sm font-semibold text-zinc-900">
              Détail par catégorie comptable
            </h3>
            <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm">
              {entree.lignes.map((ligne, index) => (
                <li
                  key={index}
                  className="flex justify-between gap-4 px-3 py-2"
                >
                  <span className="text-zinc-700">{ligne.categorie}</span>
                  <span className="font-medium text-zinc-900">
                    {formaterMontantHistorique(ligne.montant)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {erreur && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {erreur}
          </p>
        )}

        {suppressionDemandee && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <p>
              Supprimer définitivement cette entrée ? L’e-mail déjà envoyé n’est
              pas affecté et son numéro de nomenclature ne sera pas réattribué.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={enCours}
                onClick={() => void supprimer()}
                className="rounded-lg bg-red-700 px-3 py-1.5 font-semibold text-white hover:bg-red-800 disabled:opacity-60"
              >
                {enCours ? "Suppression…" : "Supprimer définitivement"}
              </button>
              <button
                type="button"
                disabled={enCours}
                onClick={() => setSuppressionDemandee(false)}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {responsable && !edition && !suppressionDemandee && (
            <>
              <button
                type="button"
                onClick={() => setSuppressionDemandee(true)}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Supprimer
              </button>
              <button
                type="button"
                onClick={() => setEdition(true)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
              >
                Modifier
              </button>
            </>
          )}
          {edition && (
            <button
              type="button"
              disabled={enCours}
              onClick={() => void enregistrer()}
              className="rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E3A8A]/90 disabled:opacity-60"
            >
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
          )}
          <button
            type="button"
            disabled={enCours}
            onClick={fermer}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
          >
            {edition ? "Annuler" : "Fermer"}
          </button>
        </div>
      </div>
    </div>
  );
}
