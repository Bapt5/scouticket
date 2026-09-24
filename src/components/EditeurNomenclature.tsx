"use client";

import { useRef } from "react";
import {
  VARIABLES_NOMENCLATURE,
  erreurDebutAnneeComptable,
  genererNomsNomenclature,
  joursMaxDuMois,
  libelleAnneeComptable,
  validerFormatNomenclature,
  type FormatAnneeComptable,
  type ParametresAnneeComptable,
} from "@/lib/nomenclature";

export interface BrouillonNomenclature {
  personnalise: boolean;
  format: string;
  anneeComptable: ParametresAnneeComptable;
  prochainNumeroGlobal: string;
  prochainNumeroComptable: string;
}

interface EditeurNomenclatureProps {
  readonly valeur: BrouillonNomenclature;
  readonly onChange: (valeur: BrouillonNomenclature) => void;
  readonly anneeComptableCourante: number;
}

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

const classeChamp =
  "w-full rounded-lg border border-zinc-300 bg-white p-3 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]";

export function EditeurNomenclature({
  valeur,
  onChange,
  anneeComptableCourante,
}: EditeurNomenclatureProps) {
  const champFormat = useRef<HTMLInputElement>(null);
  const { anneeComptable } = valeur;
  const erreurFormat = valeur.personnalise
    ? validerFormatNomenclature(valeur.format)
    : null;
  const commenceEnJanvier =
    anneeComptable.mois === 1 && anneeComptable.jour === 1;

  const erreurDebut = erreurDebutAnneeComptable(
    anneeComptable.mois,
    anneeComptable.jour,
  );

  const modifierAnnee = (modification: Partial<ParametresAnneeComptable>) =>
    onChange({
      ...valeur,
      anneeComptable: { ...anneeComptable, ...modification },
    });

  const inserer = (nom: string) => {
    const champ = champFormat.current;
    const debut = champ?.selectionStart ?? valeur.format.length;
    const fin = champ?.selectionEnd ?? valeur.format.length;
    const jeton = `{${nom}}`;
    onChange({
      ...valeur,
      format: valeur.format.slice(0, debut) + jeton + valeur.format.slice(fin),
    });
    requestAnimationFrame(() => {
      champ?.focus();
      champ?.setSelectionRange(debut + jeton.length, debut + jeton.length);
    });
  };

  const apercu =
    valeur.personnalise && !erreurFormat
      ? genererNomsNomenclature({
          format: valeur.format,
          parametresAnnee: anneeComptable,
          date: "2026-03-05",
          branche: "Louveteaux",
          depenses: [
            {
              typeDepense: "Carburants",
              modePaiement: "Carte bancaire",
              montant: 28.5,
            },
            {
              typeDepense: "Fournitures",
              modePaiement: "Espèces",
              montant: 12,
            },
          ],
          extensions: ["pdf", "jpg"],
          premierGlobal: 42,
          premierComptable: 13,
        })
      : [];

  return (
    <div className="space-y-5">
      <label className="flex items-start gap-3 text-sm text-zinc-800">
        <input
          type="checkbox"
          checked={valeur.personnalise}
          onChange={(e) =>
            onChange({
              ...valeur,
              personnalise: e.target.checked,
              format:
                e.target.checked && !valeur.format
                  ? "{YYYY}-{MM}-{DD} - {Branche} - {Type} - {ModePaiement} - {Montant}"
                  : valeur.format,
            })
          }
          className="mt-1"
        />
        <span>
          Personnaliser le nom des justificatifs envoyés à la trésorerie
          <span className="block text-zinc-500">
            Sinon, chaque fichier garde le nom du fichier importé.
          </span>
        </span>
      </label>

      {valeur.personnalise && (
        <>
          <div className="space-y-2">
            <label
              htmlFor="format-nomenclature"
              className="block text-sm font-medium text-zinc-700"
            >
              Format du nom
            </label>
            <input
              id="format-nomenclature"
              ref={champFormat}
              value={valeur.format}
              onChange={(e) => onChange({ ...valeur, format: e.target.value })}
              aria-invalid={Boolean(erreurFormat)}
              className={classeChamp}
            />
            {erreurFormat && (
              <p className="text-sm text-rose-600" role="alert">
                {erreurFormat}
              </p>
            )}
            <div className="flex flex-wrap gap-2" aria-label="Variables">
              {VARIABLES_NOMENCLATURE.map((variable) => (
                <button
                  key={variable.nom}
                  type="button"
                  title={`${variable.description} (ex. ${variable.exemple})`}
                  onClick={() => inserer(variable.nom)}
                  className="rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs text-zinc-800 hover:bg-zinc-100"
                >
                  {`{${variable.nom}}`}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500">
              L&apos;extension du fichier est ajoutée automatiquement.
            </p>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-zinc-700">
              Année comptable
            </legend>
            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <span>Début le</span>
              <input
                type="number"
                min={1}
                max={joursMaxDuMois(anneeComptable.mois)}
                aria-label="Jour de début de l'année comptable"
                aria-invalid={Boolean(erreurDebut)}
                value={
                  Number.isNaN(anneeComptable.jour) ? "" : anneeComptable.jour
                }
                onChange={(e) =>
                  modifierAnnee({
                    jour:
                      e.target.value === ""
                        ? Number.NaN
                        : Number(e.target.value),
                  })
                }
                className="w-20 rounded-lg border border-zinc-300 bg-white p-2"
              />
              <select
                aria-label="Mois de début de l'année comptable"
                value={anneeComptable.mois}
                onChange={(e) => {
                  const mois = Number(e.target.value);
                  // Ramène le jour dans le mois choisi (ex. 31 → 28 en février).
                  modifierAnnee({
                    mois,
                    jour: Math.min(anneeComptable.jour, joursMaxDuMois(mois)),
                  });
                }}
                className="rounded-lg border border-zinc-300 bg-white p-2"
              >
                {MOIS.map((mois, index) => (
                  <option key={mois} value={index + 1}>
                    {mois}
                  </option>
                ))}
              </select>
            </div>
            {erreurDebut ? (
              <p className="text-sm text-rose-600" role="alert">
                {erreurDebut}
              </p>
            ) : (
              anneeComptable.mois === 2 && (
                <p className="text-xs text-zinc-500">
                  En février, le début ne peut pas dépasser le 28.
                </p>
              )
            )}
            {!commenceEnJanvier && (
              <div>
                <label
                  htmlFor="format-annee-comptable"
                  className="block text-sm text-zinc-700"
                >
                  Affichage de {"{AnneeComptable}"} (chevauchement de deux
                  années)
                </label>
                <select
                  id="format-annee-comptable"
                  value={anneeComptable.format}
                  onChange={(e) =>
                    modifierAnnee({
                      format: e.target.value as FormatAnneeComptable,
                    })
                  }
                  className={`${classeChamp} mt-1`}
                >
                  {(["debut", "fin", "debut-fin"] as const).map((format) => (
                    <option key={format} value={format}>
                      {libelleAnneeComptable(anneeComptableCourante, {
                        ...anneeComptable,
                        format,
                      })}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-zinc-700">
              Prochains numéros (à modifier pour reprendre une numérotation
              existante)
            </legend>
            <label className="block text-sm text-zinc-700">
              {"{GlobalNumero}"}
              <input
                type="number"
                min={1}
                value={valeur.prochainNumeroGlobal}
                onChange={(e) =>
                  onChange({ ...valeur, prochainNumeroGlobal: e.target.value })
                }
                className={`${classeChamp} mt-1`}
              />
            </label>
            <label className="block text-sm text-zinc-700">
              {"{GlobalNumeroComptable}"} pour l&apos;année comptable en cours (
              {libelleAnneeComptable(anneeComptableCourante, anneeComptable)})
              <input
                type="number"
                min={1}
                value={valeur.prochainNumeroComptable}
                onChange={(e) =>
                  onChange({
                    ...valeur,
                    prochainNumeroComptable: e.target.value,
                  })
                }
                className={`${classeChamp} mt-1`}
              />
            </label>
          </fieldset>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800">
            <p className="font-medium">Aperçu (deux justificatifs)</p>
            {apercu.length === 0 ? (
              <p className="text-zinc-500">Format invalide.</p>
            ) : (
              <ul className="mt-1 list-disc pl-5">
                {apercu.map((nom) => (
                  <li key={nom}>{nom}</li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
