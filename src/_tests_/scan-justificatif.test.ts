import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructeur: vi.fn(),
  initialize: vi.fn(),
  scan: vi.fn(),
  extractDocument: vi.fn(),
}));

const moduleScanicFactice = {
  Scanner: class {
    constructor() {
      mocks.constructeur();
    }
    initialize = mocks.initialize;
    scan = mocks.scan;
  },
  extractDocument: mocks.extractDocument,
} as unknown as typeof import("scanic");

import {
  DOSSIER_ASSETS_ML,
  URL_SCANIC,
  coinsParDefaut,
  detecterCoins,
  estErreurAnnulation,
  extraireJustificatif,
  reinitialiserScannerPourTests,
} from "@/lib/scanJustificatif";

const image = { naturalWidth: 800, naturalHeight: 600 } as HTMLImageElement;
const coins = {
  topLeft: { x: 1, y: 1 },
  topRight: { x: 9, y: 1 },
  bottomRight: { x: 9, y: 9 },
  bottomLeft: { x: 1, y: 9 },
};

function canvasAvecBlob(blob: Blob | null) {
  const canvas = document.createElement("canvas");
  canvas.toBlob = (rappel) => rappel(blob);
  return canvas;
}

describe("scanJustificatif", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reinitialiserScannerPourTests(() => Promise.resolve(moduleScanicFactice));
    mocks.initialize.mockResolvedValue(undefined);
    mocks.scan.mockResolvedValue({ success: true, corners: coins });
  });

  describe("detecterCoins", () => {
    /** Résultat de Scanic selon le détecteur demandé. */
    const parDetecteur = (
      resultats: Partial<Record<"ml" | "classical", unknown>>,
    ) =>
      mocks.scan.mockImplementation(
        async (
          _image: unknown,
          { detector }: { detector: "ml" | "classical" },
        ) => {
          const resultat = resultats[detector];
          if (resultat instanceof Error) throw resultat;
          if (typeof resultat === "function") return resultat();
          return resultat;
        },
      );
    const detecteursAppeles = () =>
      mocks.scan.mock.calls.map(([, options]) => options.detector);

    it("essaie d'abord le ML, avec des assets servis par notre origine", async () => {
      await expect(detecterCoins(image)).resolves.toEqual(coins);

      expect(mocks.scan).toHaveBeenCalledTimes(1);
      expect(mocks.scan).toHaveBeenCalledWith(image, {
        mode: "detect",
        detector: "ml",
        ml: { assetBaseUrl: DOSSIER_ASSETS_ML },
      });
      expect(DOSSIER_ASSETS_ML).toMatch(/^\//);
    });

    it("se replie sur le détecteur classique si le ML échoue", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      parDetecteur({
        ml: new Error("ORT_KO"),
        classical: { success: true, corners: coins },
      });

      await expect(detecterCoins(image)).resolves.toEqual(coins);

      expect(detecteursAppeles()).toEqual(["ml", "classical"]);
    });

    it("se replie sur le détecteur classique si le ML ne trouve rien", async () => {
      parDetecteur({
        ml: { success: false, corners: null },
        classical: { success: true, corners: coins },
      });

      await expect(detecterCoins(image)).resolves.toEqual(coins);

      expect(detecteursAppeles()).toEqual(["ml", "classical"]);
    });

    it("se replie sur le détecteur classique si le modèle ML est trop long à charger", async () => {
      vi.useFakeTimers();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        parDetecteur({
          ml: () => new Promise(() => {}),
          classical: { success: true, corners: coins },
        });

        const resultat = detecterCoins(image);
        await vi.advanceTimersByTimeAsync(11_000);

        await expect(resultat).resolves.toEqual(coins);
        expect(detecteursAppeles()).toEqual(["ml", "classical"]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("renvoie null quand aucun détecteur ne trouve le justificatif", async () => {
      mocks.scan.mockResolvedValue({ success: false, corners: null });

      await expect(detecterCoins(image)).resolves.toBeNull();
    });

    it("propage l'erreur du détecteur classique quand le ML a aussi échoué", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      mocks.scan.mockRejectedValue(new Error("WASM_KO"));

      await expect(detecterCoins(image)).rejects.toThrow("WASM_KO");
    });

    it("réutilise une seule instance initialisée pour plusieurs scans", async () => {
      await Promise.all([detecterCoins(image), detecterCoins(image)]);
      await detecterCoins(image);

      expect(mocks.constructeur).toHaveBeenCalledTimes(1);
      expect(mocks.initialize).toHaveBeenCalledTimes(1);
      expect(mocks.scan).toHaveBeenCalledTimes(3);
    });

    it("retente l'initialisation après un échec", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      mocks.initialize.mockRejectedValueOnce(new Error("INIT_KO"));

      await expect(detecterCoins(image)).resolves.toEqual(coins);

      expect(mocks.constructeur).toHaveBeenCalledTimes(2);
    });

    it("abandonne la détection si aucun détecteur ne répond", async () => {
      vi.useFakeTimers();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        mocks.scan.mockReturnValue(new Promise(() => {}));

        const resultat = detecterCoins(image).catch((e) => e);
        await vi.advanceTimersByTimeAsync(41_000);

        await expect(resultat).resolves.toMatchObject({
          message: "SCAN_DETECTION_TIMEOUT",
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it("s'interrompt si le signal est déjà annulé", async () => {
      const controleur = new AbortController();
      controleur.abort();

      const erreur = await detecterCoins(image, {
        signal: controleur.signal,
      }).catch((e) => e);

      expect(estErreurAnnulation(erreur)).toBe(true);
      expect(mocks.scan).not.toHaveBeenCalled();
    });

    it("s'interrompt sans repli si l'annulation survient pendant la détection", async () => {
      const controleur = new AbortController();
      mocks.scan.mockImplementation(async () => {
        controleur.abort();
        return { success: true, corners: coins };
      });

      const erreur = await detecterCoins(image, {
        signal: controleur.signal,
      }).catch((e) => e);

      expect(estErreurAnnulation(erreur)).toBe(true);
      expect(mocks.scan).toHaveBeenCalledTimes(1);
    });
  });

  describe("extraireJustificatif", () => {
    it("produit un JPEG nommé d'après l'original", async () => {
      mocks.extractDocument.mockResolvedValue({
        success: true,
        output: canvasAvecBlob(new Blob(["jpeg"], { type: "image/jpeg" })),
      });

      const fichier = await extraireJustificatif(image, coins, "ticket.png");

      expect(fichier.name).toBe("ticket.jpg");
      expect(fichier.type).toBe("image/jpeg");
      expect(mocks.extractDocument).toHaveBeenCalledWith(image, coins, {
        output: "canvas",
      });
    });

    it("échoue si Scanic n'extrait rien", async () => {
      mocks.extractDocument.mockResolvedValue({ success: false, output: null });

      await expect(
        extraireJustificatif(image, coins, "ticket.png"),
      ).rejects.toThrow("SCAN_EXTRACTION_FAILED");
    });

    it("échoue si la conversion en blob échoue", async () => {
      mocks.extractDocument.mockResolvedValue({
        success: true,
        output: canvasAvecBlob(null),
      });

      await expect(
        extraireJustificatif(image, coins, "ticket.png"),
      ).rejects.toThrow("BLOB_CONVERSION_FAILED");
    });

    it("respecte l'annulation", async () => {
      const controleur = new AbortController();
      controleur.abort();

      const erreur = await extraireJustificatif(image, coins, "ticket.png", {
        signal: controleur.signal,
      }).catch((e) => e);

      expect(estErreurAnnulation(erreur)).toBe(true);
      expect(mocks.extractDocument).not.toHaveBeenCalled();
    });
  });

  it("charge Scanic depuis une URL versionnée de notre origine", () => {
    expect(URL_SCANIC).toMatch(/^\/assets\/scanic\/[^/]+\/scanic\.js$/);
  });

  it("propose par défaut des coins couvrant toute l'image", () => {
    expect(coinsParDefaut(image)).toEqual({
      topLeft: { x: 0, y: 0 },
      topRight: { x: 800, y: 0 },
      bottomRight: { x: 800, y: 600 },
      bottomLeft: { x: 0, y: 600 },
    });
  });
});
