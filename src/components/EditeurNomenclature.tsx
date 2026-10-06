"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  VARIABLES_NOMENCLATURE,
  genererNomsNomenclature,
  libelleAnneeComptable,
  validerFormatNomenclature,
  type FormatAnneeComptable,
  type ParametresAnneeComptable,
} from "@/lib/nomenclature";
import { MOIS } from "@/components/ChampDebutAnneeComptable";
import { InfoBulle } from "@/components/InfoBulle";

export interface BrouillonNomenclature {
  personnalise: boolean;
  format: string;
  anneeComptable: ParametresAnneeComptable;
  prochainNumeroGlobal: string;
  prochainNumeroComptable: string;
}

interface ExempleApercu {
  typeDepense: string;
  modePaiement: string;
  montant: number;
}

interface EditeurNomenclatureProps {
  readonly valeur: BrouillonNomenclature;
  readonly onChange: (valeur: BrouillonNomenclature) => void;
  readonly anneeComptableCourante: number;
  /** Masque le fieldset « Année comptable » quand elle est déjà affichée ailleurs (partagée entre domaines). */
  readonly afficherAnneeComptable?: boolean;
  /** Exemples utilisés pour l'aperçu du format, adaptables au domaine (dépense/recette). */
  readonly exemplesApercu?: readonly ExempleApercu[];
}

const EXEMPLES_APERCU_PAR_DEFAUT: readonly ExempleApercu[] = [
  { typeDepense: "Carburant", modePaiement: "Carte bancaire", montant: 28.5 },
  { typeDepense: "Fournitures", modePaiement: "Espèces", montant: 12 },
];

function dateDuJourIso(): string {
  const maintenant = new Date();
  const mois = String(maintenant.getMonth() + 1).padStart(2, "0");
  const jour = String(maintenant.getDate()).padStart(2, "0");
  return `${maintenant.getFullYear()}-${mois}-${jour}`;
}

const classeChamp =
  "w-full rounded-lg border border-zinc-300 bg-white p-3 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]";

export function EditeurNomenclature({
  valeur,
  onChange,
  anneeComptableCourante,
  afficherAnneeComptable = true,
  exemplesApercu = EXEMPLES_APERCU_PAR_DEFAUT,
}: EditeurNomenclatureProps) {
  const champFormat = useRef<HTMLInputElement>(null);
  const { anneeComptable } = valeur;
  const erreurFormat = valeur.personnalise
    ? validerFormatNomenclature(valeur.format)
    : null;
  const commenceEnJanvier =
    anneeComptable.mois === 1 && anneeComptable.jour === 1;

  const jourMoisDebut = `${anneeComptable.jour === 1 ? "1er" : anneeComptable.jour} ${MOIS[anneeComptable.mois - 1] ?? ""}`;

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
          date: dateDuJourIso(),
          branche: "Louveteaux",
          depenses: exemplesApercu.map((exemple) => ({ ...exemple })),
          extensions: exemplesApercu.map((_, index) =>
            index === 0 ? "pdf" : "jpg",
          ),
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
              className="block text-base font-semibold text-zinc-900"
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

          <fieldset className={afficherAnneeComptable ? "space-y-3" : "hidden"}>
            <legend className="mb-1 text-base font-semibold text-zinc-900">
              Année comptable
            </legend>
            <p className="text-xs text-zinc-500">
              Le début de l&apos;année comptable ({jourMoisDebut}) se règle dans
              les{" "}
              <Link
                href="/parametres-groupe"
                className="underline text-[#1E3A8A]"
              >
                paramètres du groupe
              </Link>
              .
            </p>
            {!commenceEnJanvier && (
              <div>
                <label
                  htmlFor="format-annee-comptable"
                  className="block text-sm text-zinc-700"
                >
                  Affichage de {"{AnneeComptable}"}{" "}
                  <InfoBulle texte="Utile quand l'année comptable chevauche deux années civiles : choisissez l'année de début, l'année de fin ou les deux." />
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
            <legend className="mb-1 text-base font-semibold text-zinc-900">
              Prochains numéros{" "}
              <InfoBulle texte="À modifier pour reprendre une numérotation existante. Les numéros ne sont consommés que si l'e-mail est bien parti." />
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
            <p className="font-medium">
              Aperçu{" "}
              <InfoBulle texte="Exemple avec deux justificatifs envoyés ensemble, daté d'aujourd'hui." />
            </p>
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
