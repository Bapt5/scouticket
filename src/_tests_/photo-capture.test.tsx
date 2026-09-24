import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chargerImage: vi.fn(),
  detecterCoins: vi.fn(),
  prechaufferScanner: vi.fn(),
}));

vi.mock("@/lib/scanJustificatif", () => ({
  chargerImage: mocks.chargerImage,
  detecterCoins: mocks.detecterCoins,
  prechaufferScanner: mocks.prechaufferScanner,
  estErreurAnnulation: (e: unknown) =>
    e instanceof DOMException && e.name === "AbortError",
}));

vi.mock("@/components/ApercuScan", () => ({
  ApercuScan: ({
    coinsDetectes,
    onDecision,
    fichierOriginal,
  }: {
    coinsDetectes: unknown;
    fichierOriginal: File;
    onDecision: (decision: unknown) => void;
  }) => (
    <div role="dialog" data-coins={String(coinsDetectes !== null)}>
      <button onClick={() => onDecision({ type: "original" })}>Original</button>
      <button
        onClick={() =>
          onDecision({
            type: "fichier",
            fichier: new File(["r"], "ajuste.jpg", { type: "image/jpeg" }),
          })
        }
      >
        Recadré
      </button>
      <button onClick={() => onDecision({ type: "annule" })}>
        Annuler l&apos;aperçu {fichierOriginal.name}
      </button>
    </div>
  ),
}));

import { CapturePhoto } from "@/components/PhotoCapture";

const coins = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 1, y: 0 },
  bottomRight: { x: 1, y: 1 },
  bottomLeft: { x: 0, y: 1 },
};
const image = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement;

const png = () => new File(["png"], "ticket.png", { type: "image/png" });
const pdf = () => new File(["pdf"], "facture.pdf", { type: "application/pdf" });

function afficher(props: { scanActive?: boolean } = {}) {
  const onAttachmentsAdd = vi.fn();
  const { container } = render(
    <CapturePhoto
      onAttachmentsAdd={onAttachmentsAdd}
      currentCount={0}
      {...props}
    />,
  );
  return {
    onAttachmentsAdd,
    camera: container.querySelector<HTMLInputElement>("input[capture]")!,
    galerie: container.querySelector<HTMLInputElement>("input[multiple]")!,
  };
}

describe("CapturePhoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Petite image : pas de redimensionnement, le fichier est conservé tel quel.
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 100, height: 100 }),
    );
    mocks.chargerImage.mockResolvedValue(image);
    mocks.detecterCoins.mockResolvedValue(coins);
  });

  it("garde le comportement actuel quand le scan est désactivé", async () => {
    const { onAttachmentsAdd, camera } = afficher();

    await userEvent.upload(camera, png());

    await waitFor(() => expect(onAttachmentsAdd).toHaveBeenCalled());
    expect(onAttachmentsAdd.mock.calls[0][0][0]).toMatchObject({
      nomAffiche: "ticket.png",
      typeMime: "image/png",
      nomFichierOriginal: "ticket.png",
    });
    expect(mocks.chargerImage).not.toHaveBeenCalled();
    expect(mocks.prechaufferScanner).not.toHaveBeenCalled();
  });

  it("préchauffe Scanic quand le scan est activé", () => {
    afficher({ scanActive: true });

    expect(mocks.prechaufferScanner).toHaveBeenCalledOnce();
  });

  it("propose toujours l'aperçu et l'ajustement des coins après la détection d'une photo", async () => {
    const { onAttachmentsAdd, camera } = afficher({
      scanActive: true,
    });

    await userEvent.upload(camera, png());

    const dialogue = await screen.findByRole("dialog");
    expect(dialogue).toHaveAttribute("data-coins", "true");
    expect(mocks.detecterCoins).toHaveBeenCalledWith(
      image,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(onAttachmentsAdd).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Recadré" }));
    await waitFor(() => expect(onAttachmentsAdd).toHaveBeenCalled());
    expect(onAttachmentsAdd.mock.calls[0][0][0]).toMatchObject({
      nomAffiche: "ajuste.jpg",
      typeMime: "image/jpeg",
      nomFichierOriginal: "ticket.png",
    });
  });

  it("ouvre l'ajustement manuel si la détection échoue sur une photo", async () => {
    mocks.detecterCoins.mockResolvedValue(null);
    const { onAttachmentsAdd, camera } = afficher({ scanActive: true });

    await userEvent.upload(camera, png());

    const dialogue = await screen.findByRole("dialog");
    expect(dialogue).toHaveAttribute("data-coins", "false");
    await userEvent.click(screen.getByRole("button", { name: "Original" }));
    await waitFor(() => expect(onAttachmentsAdd).toHaveBeenCalled());
    expect(onAttachmentsAdd.mock.calls[0][0][0].nomAffiche).toBe("ticket.png");
  });

  it("propose un aperçu pour une image importée et ajoute le recadrage choisi", async () => {
    const { onAttachmentsAdd, galerie } = afficher({ scanActive: true });

    await userEvent.upload(galerie, png());

    const dialogue = await screen.findByRole("dialog");
    expect(dialogue).toHaveAttribute("data-coins", "true");
    expect(onAttachmentsAdd).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Recadré" }));
    await waitFor(() => expect(onAttachmentsAdd).toHaveBeenCalled());
    expect(onAttachmentsAdd.mock.calls[0][0][0].nomAffiche).toBe("ajuste.jpg");
  });

  it("n'ajoute rien si l'aperçu est annulé", async () => {
    const { onAttachmentsAdd, galerie } = afficher({ scanActive: true });

    await userEvent.upload(galerie, png());
    await userEvent.click(
      await screen.findByRole("button", { name: /Annuler l'aperçu/ }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(onAttachmentsAdd).not.toHaveBeenCalled();
  });

  it("propose l'aperçu sans recadrage si la détection lève une erreur", async () => {
    mocks.detecterCoins.mockRejectedValue(new Error("WASM_KO"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { galerie } = afficher({ scanActive: true });

    await userEvent.upload(galerie, png());

    expect(await screen.findByRole("dialog")).toHaveAttribute(
      "data-coins",
      "false",
    );
  });

  it("conserve l'image d'origine si elle ne peut pas être chargée pour le scan", async () => {
    mocks.chargerImage.mockRejectedValue(
      new Error("IMAGE_ELEMENT_LOAD_FAILED"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { onAttachmentsAdd, galerie } = afficher({ scanActive: true });

    await userEvent.upload(galerie, png());

    await waitFor(() => expect(onAttachmentsAdd).toHaveBeenCalled());
    expect(onAttachmentsAdd.mock.calls[0][0][0].nomAffiche).toBe("ticket.png");
    expect(
      screen.getByText(/recadrage automatique impossible/),
    ).toBeInTheDocument();
  });

  it("ajoute un PDF directement, sans passer par Scanic", async () => {
    const { onAttachmentsAdd, galerie } = afficher({ scanActive: true });

    await userEvent.upload(galerie, pdf());

    await waitFor(() => expect(onAttachmentsAdd).toHaveBeenCalled());
    expect(onAttachmentsAdd.mock.calls[0][0][0]).toMatchObject({
      nomAffiche: "facture.pdf",
      typeMime: "application/pdf",
    });
    expect(mocks.chargerImage).not.toHaveBeenCalled();
    expect(mocks.detecterCoins).not.toHaveBeenCalled();
  });

  it("permet d'annuler une détection en cours", async () => {
    mocks.detecterCoins.mockImplementation(
      (_image, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, rejeter) =>
          signal.addEventListener("abort", () =>
            rejeter(new DOMException("Scan annulé", "AbortError")),
          ),
        ),
    );
    const { onAttachmentsAdd, camera } = afficher({ scanActive: true });

    await userEvent.upload(camera, png());
    await userEvent.click(
      await screen.findByRole("button", { name: "Annuler" }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
    expect(onAttachmentsAdd).not.toHaveBeenCalled();
    expect(screen.queryByText(/Impossible de traiter/)).not.toBeInTheDocument();
  });
});
