"use client";

import { useState, useRef, useEffect } from "react";
import { CameraIcon, ArrowUpOnSquareIcon } from "@heroicons/react/24/outline";
import type { CornerPoints } from "scanic";
import { estTypeMimePieceJointeAutorise } from "@/lib/attachments";
import {
  chargerImage,
  detecterCoins,
  estErreurAnnulation,
  prechaufferScanner,
} from "@/lib/scanJustificatif";
import { ApercuScan, type DecisionScan } from "@/components/ApercuScan";
import {
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SIZE_BYTES,
  PieceJointeDepense,
} from "@/constants/piecesJointes";

// --- Utilitaires ---
async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("FILE_READER_ERROR"));
    reader.readAsDataURL(blob);
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob);
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) throw new Error("FILE_DATA_URL_INVALID");
  return dataUrl.slice(commaIndex + 1);
}

// Fallback createImageBitmap pour navigateurs anciens
async function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("IMAGE_ELEMENT_LOAD_FAILED"));
    };
    img.src = url;
  });
}

async function downscaleImage(
  file: File,
  maxDim = 1600,
  quality = 0.75,
): Promise<Blob> {
  let width: number;
  let height: number;
  let drawSource: CanvasImageSource;

  // Détection prudente de createImageBitmap (certains navigateurs anciens)
  const canUseCreateImageBitmap =
    typeof window !== "undefined" && "createImageBitmap" in window;
  const bitmapOrImage = canUseCreateImageBitmap
    ? await createImageBitmap(file).catch(() => null)
    : null;
  if (bitmapOrImage) {
    width = (bitmapOrImage as any).width;
    height = (bitmapOrImage as any).height;
    drawSource = bitmapOrImage;
  } else {
    const imgEl = await loadImageElement(file);
    width = imgEl.width;
    height = imgEl.height;
    drawSource = imgEl;
  }

  const largest = Math.max(width, height);
  const scale = Math.min(1, maxDim / largest);
  if (scale === 1) {
    return file;
  }

  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_CONTEXT_FAILED");
  ctx.drawImage(drawSource, 0, 0, targetWidth, targetHeight);
  if (
    "close" in drawSource &&
    typeof (drawSource as any).close === "function"
  ) {
    try {
      (drawSource as any).close();
    } catch {}
  }

  const outputMime =
    file.type && file.type.startsWith("image/") ? file.type : "image/jpeg";
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("BLOB_CONVERSION_FAILED"));
          return;
        }
        resolve(blob);
      },
      outputMime,
      outputMime === "image/png" ? undefined : quality,
    );
  });
}

interface CapturePhotoProps {
  readonly onAttachmentsAdd: (piecesJointes: PieceJointeDepense[]) => void;
  readonly currentCount: number;
  /** Recadrage automatique des images avec Scanic (paramètre du groupe). */
  readonly scanActive?: boolean;
  /** Nombre maximal de justificatifs (1 pour une dépense du groupe). */
  readonly maxFichiers?: number;
}

interface RevueScan {
  readonly fichier: File;
  readonly image: HTMLImageElement;
  readonly coins: CornerPoints | null;
  readonly resoudre: (decision: DecisionScan) => void;
}

export function CapturePhoto({
  onAttachmentsAdd,
  currentCount,
  scanActive = false,
  maxFichiers = MAX_ATTACHMENT_COUNT,
}: Readonly<CapturePhotoProps>) {
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [compressedInfo, setCompressedInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileBrowseInputRef = useRef<HTMLInputElement>(null);
  const [scanEnCours, setScanEnCours] = useState(false);
  const [revue, setRevue] = useState<RevueScan | null>(null);
  const controleurRef = useRef<AbortController | null>(null);
  const revueRef = useRef<RevueScan | null>(null);

  useEffect(() => {
    if (scanActive) prechaufferScanner();
  }, [scanActive]);

  // Annule un scan en cours et ferme l'aperçu si le composant disparaît.
  useEffect(
    () => () => {
      controleurRef.current?.abort();
      revueRef.current?.resoudre({ type: "annule" });
    },
    [],
  );

  useEffect(() => {
    if (currentCount === 0) {
      setCompressedInfo(null);
      setErrorMessages([]);
    }
  }, [currentCount]);

  const demanderRevue = (
    fichier: File,
    image: HTMLImageElement,
    coins: CornerPoints | null,
  ) =>
    new Promise<DecisionScan>((resoudre) => {
      const nouvelleRevue: RevueScan = {
        fichier,
        image,
        coins,
        resoudre: (decision) => {
          revueRef.current = null;
          setRevue(null);
          resoudre(decision);
        },
      };
      revueRef.current = nouvelleRevue;
      setRevue(nouvelleRevue);
    });

  /**
   * Recadre une image avec Scanic. Retourne le fichier à ajouter (recadré ou
   * d'origine), ou `null` si l'utilisateur annule.
   */
  const scannerImage = async (
    file: File,
    signal: AbortSignal,
    avertissements: string[],
  ): Promise<File | null> => {
    let image: HTMLImageElement;
    try {
      image = await chargerImage(file);
    } catch (e) {
      console.error("Erreur chargement justificatif pour le scan:", e);
      avertissements.push(
        `${file.name}: recadrage automatique impossible, image d'origine conservée.`,
      );
      return file;
    }

    // Le repli du détecteur ML vers le classique est géré par detecterCoins.
    let coins: CornerPoints | null = null;
    try {
      coins = await detecterCoins(image, { signal });
    } catch (e) {
      if (estErreurAnnulation(e)) return null;
      console.error("Erreur détection justificatif:", e);
    }

    // Photo comme import : l'aperçu (avec ajustement des coins) est toujours proposé.
    setScanEnCours(false);
    const decision = await demanderRevue(file, image, coins);
    if (decision.type === "annule") return null;
    return decision.type === "fichier" ? decision.fichier : file;
  };

  const processFiles = async (files: FileList, fromCamera = false) => {
    const selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) return;

    const nextErrors: string[] = [];
    setCompressedInfo(null);

    if (currentCount >= maxFichiers) {
      setErrorMessages([
        `Vous avez déjà atteint la limite de ${maxFichiers} justificatifs.`,
      ]);
      return;
    }

    const availableSlots = maxFichiers - currentCount;
    const candidates = selectedFiles.slice(0, availableSlots);
    if (selectedFiles.length > availableSlots) {
      nextErrors.push(`Nombre maximum atteint: ${maxFichiers} justificatifs.`);
    }

    const piecesJointesCreees: PieceJointeDepense[] = [];
    const compressionMessages: string[] = [];

    const controleur = new AbortController();
    controleurRef.current = controleur;

    for (const file of candidates) {
      if (controleur.signal.aborted) break;
      if (!estTypeMimePieceJointeAutorise(file.type)) {
        nextErrors.push(
          `${file.name}: type non supporté (images JPG/PNG/WEBP ou PDF uniquement).`,
        );
        continue;
      }
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        nextErrors.push(
          `${file.name}: fichier trop volumineux (max ${(MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)).toFixed(0)}MB).`,
        );
        continue;
      }

      try {
        let source: File = file;
        // Les PDF et autres fichiers non image sont ajoutés tels quels.
        if (scanActive && file.type.startsWith("image/")) {
          setScanEnCours(true);
          const scanne = await scannerImage(
            file,
            controleur.signal,
            nextErrors,
          );
          setScanEnCours(false);
          if (!scanne) continue;
          source = scanne;
        }

        let processedBlob: Blob = source;
        if (source.type.startsWith("image/")) {
          processedBlob = await downscaleImage(source);
          const originalKb = (source.size / 1024).toFixed(0);
          const newKb = (processedBlob.size / 1024).toFixed(0);
          if (originalKb !== newKb) {
            compressionMessages.push(
              `${file.name}: ${originalKb}KB → ${newKb}KB`,
            );
          }
        }

        const typeMime = processedBlob.type || source.type;
        const donneesBase64 = await blobToBase64(processedBlob);
        piecesJointesCreees.push({
          nomAffiche: source.name,
          typeMime,
          donneesBase64,
          nomFichierOriginal: file.name,
          nomFichierNormalise: file.name,
        });
      } catch (e) {
        console.error("Erreur traitement justificatif:", e);
        nextErrors.push(`${file.name}: erreur de lecture/traitement.`);
      }
    }

    setScanEnCours(false);
    controleurRef.current = null;

    if (piecesJointesCreees.length > 0) {
      onAttachmentsAdd(piecesJointesCreees);
    }

    if (
      fromCamera &&
      piecesJointesCreees.length === 0 &&
      nextErrors.length === 0 &&
      !controleur.signal.aborted
    ) {
      nextErrors.push("Impossible de traiter la photo capturée.");
    }

    if (compressionMessages.length > 0) {
      setCompressedInfo(compressionMessages.join(" | "));
    }

    setErrorMessages(nextErrors);
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files) return;
    try {
      await processFiles(files, event.target === fileInputRef.current);
    } finally {
      event.target.value = "";
    }
  };

  const handleCameraCapture = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileBrowse = () => {
    if (fileBrowseInputRef.current) {
      fileBrowseInputRef.current.click();
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
        <CameraIcon className="w-5 h-5 text-zinc-700" aria-hidden="true" />{" "}
        Justificatif de dépense
      </h2>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleCameraCapture}
          className="flex flex-col items-center p-4 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 transition-colors"
        >
          <CameraIcon className="w-6 h-6 mb-2" aria-hidden="true" />
          <span className="text-sm font-medium">Prendre photo</span>
        </button>
        <button
          onClick={handleFileBrowse}
          className="flex flex-col items-center p-4 bg-white text-zinc-900 rounded-lg border border-zinc-200 hover:bg-zinc-100 transition-colors"
        >
          <ArrowUpOnSquareIcon
            className="w-6 h-6 mb-2 text-zinc-700"
            aria-hidden="true"
          />
          <span className="text-sm font-medium">Importer fichier</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      <input
        ref={fileBrowseInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {scanEnCours && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700"
        >
          <span>Détection du justificatif…</span>
          <button
            type="button"
            onClick={() => controleurRef.current?.abort()}
            className="font-medium text-rose-700 hover:underline"
          >
            Annuler
          </button>
        </div>
      )}

      {revue && (
        <ApercuScan
          fichierOriginal={revue.fichier}
          image={revue.image}
          coinsDetectes={revue.coins}
          onDecision={revue.resoudre}
        />
      )}

      {compressedInfo && errorMessages.length === 0 && (
        <p className="text-xs text-zinc-500">Optimisation: {compressedInfo}</p>
      )}

      {errorMessages.length > 0 && (
        <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          <ul className="list-disc pl-5 space-y-1">
            {errorMessages.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
