"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CornerPoints } from "scanic";
import { chargerScanic } from "@/lib/scanJustificatif";

/**
 * Le zoom de la loupe de Scanic s'applique aux pixels de l'image source : sur
 * une photo de plusieurs milliers de pixels affichée en petit, il devient
 * énorme. On édite donc une copie réduite (coins remis à l'échelle ensuite)
 * avec un zoom modéré. Ajuster ces deux constantes pour régler la loupe.
 */
const DIMENSION_EDITION_MAX = 800;
const ZOOM_LOUPE = 1.5;
const TAILLE_LOUPE = 110;

function mettreAEchelle(coins: CornerPoints, facteur: number): CornerPoints {
  const point = ({ x, y }: { x: number; y: number }) => ({
    x: x * facteur,
    y: y * facteur,
  });
  return {
    topLeft: point(coins.topLeft),
    topRight: point(coins.topRight),
    bottomRight: point(coins.bottomRight),
    bottomLeft: point(coins.bottomLeft),
  };
}

/** Copie réduite de l'image pour l'édition ; `facteur` = réduite / originale. */
function preparerImageEdition(image: HTMLImageElement) {
  const largeur = image.naturalWidth || image.width;
  const hauteur = image.naturalHeight || image.height;
  const facteur = Math.min(
    1,
    DIMENSION_EDITION_MAX / Math.max(largeur, hauteur),
  );
  if (!(facteur < 1)) return { source: image, facteur: 1 };
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(largeur * facteur);
  canvas.height = Math.round(hauteur * facteur);
  const contexte = canvas.getContext("2d");
  if (!contexte) return { source: image, facteur: 1 };
  contexte.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { source: canvas, facteur };
}

interface EditeurCoinsProps {
  readonly image: HTMLImageElement;
  readonly coinsInitiaux: CornerPoints;
  readonly onConfirm: (coins: CornerPoints) => void;
  readonly onCancel: () => void;
}

/** Ajustement manuel des quatre coins du justificatif (éditeur de Scanic). */
export function EditeurCoins({
  image,
  coinsInitiaux,
  onConfirm,
  onCancel,
}: Readonly<EditeurCoinsProps>) {
  const conteneurRef = useRef<HTMLDivElement>(null);
  // Les callbacks sont lus via une ref pour ne pas recréer l'éditeur à chaque rendu.
  const rappelsRef = useRef({ onConfirm, onCancel });
  useEffect(() => {
    rappelsRef.current = { onConfirm, onCancel };
  });

  const { source, facteur } = useMemo(
    () => preparerImageEdition(image),
    [image],
  );

  useEffect(() => {
    const conteneur = conteneurRef.current;
    if (!conteneur) return;
    let annule = false;
    let editeur: { destroy: () => void } | null = null;

    chargerScanic().then(({ createCornerEditor }) => {
      if (annule) return;
      editeur = createCornerEditor({
        container: conteneur,
        image: source,
        corners: mettreAEchelle(coinsInitiaux, facteur),
        magnifier: { zoom: ZOOM_LOUPE, size: TAILLE_LOUPE },
        toolbar: {
          labels: {
            reset: "Réinitialiser",
            cancel: "Annuler",
            apply: "Valider",
          },
        },
        onConfirm: (coins) =>
          rappelsRef.current.onConfirm(mettreAEchelle(coins, 1 / facteur)),
        onCancel: () => rappelsRef.current.onCancel(),
      });
    });

    return () => {
      annule = true;
      editeur?.destroy();
    };
  }, [source, facteur, coinsInitiaux]);

  return (
    <div>
      <p className="mb-2 text-sm text-zinc-600">
        Déplacez les coins pour qu&apos;ils suivent les bords du justificatif.
      </p>
      <div ref={conteneurRef} className="w-full" />
    </div>
  );
}
