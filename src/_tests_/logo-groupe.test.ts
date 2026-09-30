// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/baseDeDonnees", () => ({ pool: { query: vi.fn() } }));

import { ErreurLogo, normaliserLogo } from "@/lib/logoGroupe";

const image = (
  largeur: number,
  hauteur: number,
  format: "png" | "jpeg" | "webp" = "png",
) =>
  sharp({
    create: {
      width: largeur,
      height: hauteur,
      channels: 3,
      background: { r: 30, g: 58, b: 138 },
    },
  })
    [format]()
    .toBuffer();

describe("normaliserLogo", () => {
  it.each(["png", "jpeg", "webp"] as const)(
    "accepte le format %s",
    async (f) => {
      const sortie = await normaliserLogo(await image(300, 100, f));
      expect((await sharp(sortie).metadata()).format).toBe("png");
    },
  );

  it("réduit une grande image à 600 px de large maximum", async () => {
    const sortie = await normaliserLogo(await image(1800, 600));
    expect((await sharp(sortie).metadata()).width).toBe(600);
  });

  it("n'agrandit pas une petite image", async () => {
    const sortie = await normaliserLogo(await image(200, 80));
    expect((await sharp(sortie).metadata()).width).toBe(200);
  });

  it("refuse une image trop petite", async () => {
    await expect(normaliserLogo(await image(50, 20))).rejects.toThrow(
      ErreurLogo,
    );
  });

  it("refuse une image trop grande", async () => {
    await expect(normaliserLogo(await image(2500, 400))).rejects.toThrow(
      /trop grande/,
    );
  });

  it("refuse un SVG même avec une extension d'image", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"></svg>',
    );
    await expect(normaliserLogo(svg)).rejects.toThrow(/Format non supporté/);
  });

  it("refuse un fichier qui n'est pas une image", async () => {
    await expect(normaliserLogo(Buffer.from("pas une image"))).rejects.toThrow(
      /illisible/,
    );
  });

  it("refuse un fichier vide ou trop volumineux", async () => {
    await expect(normaliserLogo(Buffer.alloc(0))).rejects.toThrow(/vide/);
    await expect(normaliserLogo(Buffer.alloc(1024 * 1024 + 1))).rejects.toThrow(
      /volumineux/,
    );
  });
});
