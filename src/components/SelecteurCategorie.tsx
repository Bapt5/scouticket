"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { CATEGORIES_COMPTABLES } from "@/constants/configDepenses";

interface SelecteurCategorieProps {
  readonly id: string;
  readonly libelle: string;
  readonly valeur: string;
  readonly onChange: (categorie: string) => void;
  readonly invalide?: boolean;
  readonly idErreur?: string;
}

const normaliser = (texte: string) =>
  texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Liste déroulante avec recherche : chaque option affiche son libellé et sa
// description ; la description de la catégorie choisie reste visible dessous
// (hauteur réservée pour éviter les sauts de mise en page).
export function SelecteurCategorie({
  id,
  libelle,
  valeur,
  onChange,
  invalide = false,
  idErreur,
}: SelecteurCategorieProps) {
  const idListe = useId();
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [indexActif, setIndexActif] = useState(0);

  const requete = normaliser(recherche);
  const resultats = CATEGORIES_COMPTABLES.filter(
    (categorie) =>
      !requete ||
      normaliser(`${categorie.libelle} ${categorie.description}`).includes(
        requete,
      ),
  );
  const categorieChoisie = CATEGORIES_COMPTABLES.find(
    (categorie) => categorie.libelle === valeur,
  );
  const idOption = (index: number) => `${idListe}-option-${index}`;

  const fermer = () => {
    setOuvert(false);
    setRecherche("");
  };

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
        {libelle}
      </label>
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
      {/* Hauteur fixe (2 lignes) ; le texte complet s'affiche au survol via ::after */}
      <div
        data-texte={categorieChoisie?.description || undefined}
        className="group relative h-10 after:pointer-events-none after:absolute after:left-0 after:top-full after:z-30 after:mt-1 after:hidden after:w-full after:rounded-lg after:bg-zinc-900 after:p-2 after:text-xs after:leading-5 after:text-white after:shadow-lg after:content-[attr(data-texte)] hover:after:block"
      >
        <p
          className="line-clamp-2 text-xs leading-5 text-zinc-500"
          aria-live="polite"
        >
          {categorieChoisie?.description}
        </p>
      </div>
    </div>
  );
}
