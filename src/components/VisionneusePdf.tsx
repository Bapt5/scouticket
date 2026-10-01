"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const NIVEAUX_ZOOM = [1, 1.5, 2, 3];

interface VisionneusePdfProps {
  url: string;
  /** Appelé une seule fois, dès que le bas du document a été atteint (ou qu'il tient déjà entièrement dans le cadre). */
  onScrolleJusquauBout?: () => void;
  className?: string;
}

/**
 * Visionneuse PDF auto-hébergée (react-pdf/pdfjs-dist, pas de conversion ni
 * de service externe), sans barre d'outils native du navigateur (zoom,
 * impression, édition...), pour rester centrée sur la lecture avant
 * signature. Permet de détecter la lecture complète du document via
 * `onScrolleJusquauBout`.
 */
export function VisionneusePdf({
  url,
  onScrolleJusquauBout,
  className,
}: VisionneusePdfProps) {
  const [nombrePages, setNombrePages] = useState(0);
  const [toutesPagesChargees, setToutesPagesChargees] = useState(false);
  const [largeur, setLargeur] = useState(0);
  const [erreur, setErreur] = useState(false);
  const [zoomChoisi, setZoomChoisi] = useState<number | null>(null);
  const conteneurRef = useRef<HTMLDivElement>(null);
  const atteintRef = useRef(false);
  const pagesChargeesRef = useRef(new Set<number>());

  useEffect(() => {
    const el = conteneurRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entree]) =>
      setLargeur(entree.contentRect.width),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function signalerBout() {
    if (atteintRef.current) return;
    atteintRef.current = true;
    onScrolleJusquauBout?.();
  }

  function onScroll() {
    const el = conteneurRef.current;
    if (!el) return;
    const reste = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (reste < 24) signalerBout();
  }

  // Sur petit écran, une page paysage tient trop petite pour être lue :
  // zoom par défaut plus grand, réglable, avec défilement horizontal.
  const zoom = zoomChoisi ?? (largeur > 0 && largeur < 600 ? 2 : 1);
  const indexZoom = NIVEAUX_ZOOM.indexOf(zoom);

  // Les pages ne prennent leur hauteur qu'une fois chargées : avant, le
  // conteneur est vide et semblerait « entièrement visible ».
  function pageChargee(index: number) {
    pagesChargeesRef.current.add(index);
    if (pagesChargeesRef.current.size === nombrePages)
      setToutesPagesChargees(true);
  }

  // Document déjà entièrement visible sans avoir besoin de scroller (court, ou grand écran).
  useEffect(() => {
    if (!toutesPagesChargees) return;
    const id = requestAnimationFrame(() => {
      const el = conteneurRef.current;
      if (el && el.scrollHeight <= el.clientHeight + 4) signalerBout();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toutesPagesChargees, largeur, zoom]);

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <div className="flex items-center justify-end gap-2 text-sm text-zinc-600">
        <span aria-live="polite">Zoom {Math.round(zoom * 100)} %</span>
        <button
          type="button"
          aria-label="Réduire le zoom"
          disabled={indexZoom <= 0}
          onClick={() => setZoomChoisi(NIVEAUX_ZOOM[indexZoom - 1])}
          className="h-9 w-9 rounded-lg border border-zinc-300 bg-white text-lg font-semibold text-zinc-800 disabled:opacity-40"
        >
          -
        </button>
        <button
          type="button"
          aria-label="Augmenter le zoom"
          disabled={indexZoom >= NIVEAUX_ZOOM.length - 1}
          onClick={() => setZoomChoisi(NIVEAUX_ZOOM[indexZoom + 1])}
          className="h-9 w-9 rounded-lg border border-zinc-300 bg-white text-lg font-semibold text-zinc-800 disabled:opacity-40"
        >
          +
        </button>
      </div>
      <div
        ref={conteneurRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-auto rounded-lg border border-zinc-200 bg-zinc-100 p-2 sm:p-4"
      >
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => {
            pagesChargeesRef.current.clear();
            setToutesPagesChargees(false);
            setNombrePages(numPages);
          }}
          onLoadError={() => setErreur(true)}
          loading={
            <p className="p-4 text-sm text-zinc-600">Chargement du document…</p>
          }
          error={
            <p className="p-4 text-sm text-rose-600">
              Impossible d&rsquo;afficher le document.
            </p>
          }
        >
          {!erreur &&
            largeur > 0 &&
            Array.from({ length: nombrePages }, (_, index) => (
              <Page
                key={index}
                pageNumber={index + 1}
                onLoadSuccess={() => pageChargee(index)}
                width={largeur * zoom}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                className="mb-4 w-fit shadow"
              />
            ))}
        </Document>
      </div>
    </div>
  );
}
