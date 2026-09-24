import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCornerEditor: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("@/lib/scanJustificatif", () => ({
  chargerScanic: () =>
    Promise.resolve({ createCornerEditor: mocks.createCornerEditor }),
}));

import { EditeurCoins } from "@/components/EditeurCoins";

const image = { naturalWidth: 10, naturalHeight: 10 } as HTMLImageElement;
const coins = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 10, y: 0 },
  bottomRight: { x: 10, y: 10 },
  bottomLeft: { x: 0, y: 10 },
};

describe("EditeurCoins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createCornerEditor.mockReturnValue({ destroy: mocks.destroy });
  });

  it("monte l'éditeur Scanic avec les coins initiaux", async () => {
    render(
      <EditeurCoins
        image={image}
        coinsInitiaux={coins}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await waitFor(() => expect(mocks.createCornerEditor).toHaveBeenCalled());
    expect(mocks.createCornerEditor.mock.calls[0][0]).toMatchObject({
      image,
      corners: coins,
    });
  });

  it("relaie la validation et l'annulation", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <EditeurCoins
        image={image}
        coinsInitiaux={coins}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    await waitFor(() => expect(mocks.createCornerEditor).toHaveBeenCalled());
    const options = mocks.createCornerEditor.mock.calls[0][0];

    options.onConfirm(coins);
    options.onCancel();

    expect(onConfirm).toHaveBeenCalledWith(coins);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("détruit l'éditeur au démontage", async () => {
    const { unmount } = render(
      <EditeurCoins
        image={image}
        coinsInitiaux={coins}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await waitFor(() => expect(mocks.createCornerEditor).toHaveBeenCalled());

    unmount();

    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
});
