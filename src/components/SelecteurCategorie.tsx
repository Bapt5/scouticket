"use client";

import { useCallback, useId, useState, type KeyboardEvent } from "react";
import {
  CATEGORIES_COMPTABLES,
  type CategorieComptable,
} from "@/constants/configDepenses";
import { FeuilleCategories } from "@/components/FeuilleCategories";
import { useEstMobile } from "@/lib/useEstMobile";

interface SelecteurCategorieProps {
  readonly id: string;
  readonly libelle: string;
  /** Libellé affiché à la place de `libelle` sur téléphone (colonne étroite). */
  readonly libelleMobile?: string;
  readonly valeur: string;
  readonly onChange: (categorie: string) => void;
  readonly invalide?: boolean;
  readonly idErreur?: string;
  /** Liste des catégories proposées (dépenses par défaut). */
  readonly categories?: readonly CategorieComptable[];
}

const normaliser = (texte: string) =>
  texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Sur ordinateur : liste déroulante avec recherche. Sur téléphone : le champ
// ouvre une feuille plein écran (recherche + liste pleine largeur), car la
// colonne du formulaire est trop étroite pour une liste déroulante.
// Chaque option affiche son libellé et sa description ; celle de la catégorie
// choisie est affichée par `LignesCategories`, sur toute la largeur de la ligne.
export function SelecteurCategorie({
  id,
  libelle,
  libelleMobile,
  valeur,
  onChange,
  invalide = false,
  idErreur,
  categories = CATEGORIES_COMPTABLES,
}: SelecteurCategorieProps) {
  const idListe = useId();
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [indexActif, setIndexActif] = useState(0);
  const estMobile = useEstMobile();

  const requete = normaliser(recherche);
  const resultats = categories.filter(
    (categorie) =>
      !requete ||
      normaliser(`${categorie.libelle} ${categorie.description}`).includes(
        requete,
      ),
  );
  const idOption = (index: number) => `${idListe}-option-${index}`;

  const fermer = useCallback(() => {
    setOuvert(false);
    setRecherche("");
  }, []);

  const choisir = (categorie: string) => {
    onChange(categorie);
    fermer();
  };

  const gererTouche = (evenement: KeyboardEvent<HTMLInputElement>) => {
    if (evenement.key === "ArrowDown") {
      evenement.preventDefault();
      setOuvert(true);
      setIndexActif((index) => Math.min(index + 1, resultats.length - 1));
    } else if (evenement.key === "ArrowUp") {
      evenement.preventDefault();
      setIndexActif((index) => Math.max(index - 1, 0));
    } else if (evenement.key === "Enter" && ouvert) {
      evenement.preventDefault();
      const choix = resultats[indexActif];
      if (choix) choisir(choix.libelle);
    } else if (evenement.key === "Escape") {
      fermer();
    }
  };

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-zinc-700">
        {estMobile ? (libelleMobile ?? libelle) : libelle}
      </label>
      {estMobile ? (
        <>
          <button
            id={id}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={ouvert}
            aria-describedby={invalide ? idErreur : undefined}
            onClick={() => setOuvert(true)}
            className={`w-full truncate rounded-lg border bg-white p-3 text-left ${
              invalide ? "border-rose-500" : "border-zinc-300"
            } ${valeur ? "text-zinc-900" : "text-zinc-500"}`}
          >
            {valeur || "Choisir…"}
          </button>
          {ouvert && (
            <FeuilleCategories
              libelle={libelle}
              valeur={valeur}
              recherche={recherche}
              onRecherche={setRecherche}
              resultats={resultats}
              onChoisir={choisir}
              onFermer={fermer}
            />
          )}
        </>
      ) : (
        <div className="relative">
          <input
            id={id}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-expanded={ouvert}
            aria-controls={idListe}
            aria-autocomplete="list"
            aria-activedescendant={
              ouvert && resultats[indexActif] ? idOption(indexActif) : undefined
            }
            aria-invalid={invalide}
            aria-describedby={invalide ? idErreur : undefined}
            placeholder="Rechercher une catégorie…"
            value={ouvert ? recherche : valeur}
            onFocus={() => setOuvert(true)}
            onBlur={fermer}
            onChange={(evenement) => {
              setRecherche(evenement.target.value);
              setIndexActif(0);
              setOuvert(true);
            }}
            onKeyDown={gererTouche}
            className={`w-full p-3 border rounded-lg focus:ring-2 focus:ring-zinc-400 focus:border-zinc-400 bg-white text-zinc-900 ${
              invalide ? "border-rose-500" : "border-zinc-300"
            }`}
          />
          {ouvert && (
            <ul
              id={idListe}
              role="listbox"
              aria-label={libelle}
              className="absolute z-20 left-0 right-0 top-full mt-1 max-h-72 overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg"
            >
              {resultats.length === 0 && (
                <li className="p-3 text-sm text-zinc-500">
                  Aucune catégorie trouvée
                </li>
              )}
              {resultats.map((categorie, index) => (
                <li
                  key={categorie.libelle}
                  id={idOption(index)}
                  role="option"
                  aria-selected={categorie.libelle === valeur}
                  // mouseDown pour agir avant le blur du champ
                  onMouseDown={(evenement) => {
                    evenement.preventDefault();
                    choisir(categorie.libelle);
                  }}
                  onMouseEnter={() => setIndexActif(index)}
                  className={`cursor-pointer border-b border-zinc-100 px-3 py-2 last:border-b-0 ${
                    index === indexActif ? "bg-zinc-100" : ""
                  }`}
                >
                  <span className="block text-sm font-medium text-zinc-900">
                    {categorie.libelle}
                  </span>
                  {categorie.description && (
                    <span className="block text-xs text-zinc-500">
                      {categorie.description}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
