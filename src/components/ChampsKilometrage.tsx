"use client";

import {
  distanceSaisieValide,
  type LigneKilometriqueSaisie,
} from "@/lib/depenses";
import {
  DISTANCE_MAX_KM_PAR_LIGNE,
  LONGUEUR_MIN_OBJET_DEPLACEMENT,
} from "@/constants/piecesJointes";

interface ChampsKilometrageProps {
  readonly idPrefixe: string;
  readonly ligne: LigneKilometriqueSaisie;
  readonly onChange: (modification: Partial<LigneKilometriqueSaisie>) => void;
  readonly afficherErreurs: boolean;
}

const classesChamp = (erreur: boolean) =>
  `w-full p-3 border rounded-lg focus:ring-2 focus:ring-zinc-400 focus:border-zinc-400 bg-white text-zinc-900 ${erreur ? "border-rose-500" : "border-zinc-300"}`;

/** Champs d'un déplacement à rembourser au kilomètre (note de frais). */
export function ChampsKilometrage({
  idPrefixe,
  ligne,
  onChange,
  afficherErreurs,
}: Readonly<ChampsKilometrageProps>) {
  const erreurDate = afficherErreurs && !ligne.date;
  const erreurDistance =
    afficherErreurs && !distanceSaisieValide(ligne.distanceKm);
  const erreurActivite = afficherErreurs && !ligne.activite.trim();
  const erreurObjet =
    afficherErreurs &&
    ligne.objet.trim().length < LONGUEUR_MIN_OBJET_DEPLACEMENT;

  return (
    <>
      <div className="space-y-2">
        <label
          htmlFor={`${idPrefixe}-date`}
          className="block text-sm font-medium text-zinc-700"
        >
          Date du déplacement *
        </label>
        <input
          id={`${idPrefixe}-date`}
          type="date"
          value={ligne.date}
          onChange={(e) => onChange({ date: e.target.value })}
          aria-invalid={erreurDate}
          className={classesChamp(erreurDate)}
        />
        {erreurDate && (
          <p className="text-sm text-rose-700">Saisissez une date.</p>
        )}
      </div>
      <div className="space-y-2">
        <label
          htmlFor={`${idPrefixe}-distance`}
          className="block text-sm font-medium text-zinc-700"
        >
          Distance parcourue (km) *
        </label>
        <input
          id={`${idPrefixe}-distance`}
          type="text"
          inputMode="decimal"
          placeholder="Ex. 42,5"
          value={ligne.distanceKm}
          onChange={(e) => onChange({ distanceKm: e.target.value })}
          aria-invalid={erreurDistance}
          className={classesChamp(erreurDistance)}
        />
        {erreurDistance && (
          <p className="text-sm text-rose-700">
            Saisissez une distance en km (supérieure à 0, au plus{" "}
            {DISTANCE_MAX_KM_PAR_LIGNE} km, 2 décimales maximum).
          </p>
        )}
      </div>
      <div className="space-y-2">
        <label
          htmlFor={`${idPrefixe}-activite`}
          className="block text-sm font-medium text-zinc-700"
        >
          Activité liée *
        </label>
        <input
          id={`${idPrefixe}-activite`}
          type="text"
          placeholder="Journée, week-end, camp…"
          value={ligne.activite}
          onChange={(e) => onChange({ activite: e.target.value })}
          aria-invalid={erreurActivite}
          className={classesChamp(erreurActivite)}
        />
        {erreurActivite && (
          <p className="text-sm text-rose-700">
            Indiquez l’activité liée au déplacement.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <label
          htmlFor={`${idPrefixe}-objet`}
          className="block text-sm font-medium text-zinc-700"
        >
          Objet du déplacement *
        </label>
        <textarea
          id={`${idPrefixe}-objet`}
          placeholder="Soyez précis sur les motifs et les destinations (ex. Paris - Rambouillet aller-retour, repérage du lieu de camp)."
          value={ligne.objet}
          onChange={(e) => onChange({ objet: e.target.value })}
          rows={3}
          aria-invalid={erreurObjet}
          className={`${classesChamp(erreurObjet)} resize-none`}
        />
        {erreurObjet && (
          <p className="text-sm text-rose-700">
            Précisez le motif et les destinations (
            {LONGUEUR_MIN_OBJET_DEPLACEMENT} caractères minimum).
          </p>
        )}
      </div>
    </>
  );
}
