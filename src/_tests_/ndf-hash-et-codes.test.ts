// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hasherDocument } from "@/lib/ndfSignature/document";
import {
  codeCorrespond,
  genererCode,
  hasherCode,
} from "@/lib/ndfSignature/codesVerification";

describe("hash du document initial", () => {
  it("hache un document de façon stable", () => {
    expect(hasherDocument(Buffer.from("a"))).toBe(
      hasherDocument(Buffer.from("a")),
    );
    expect(hasherDocument(Buffer.from("a"))).not.toBe(
      hasherDocument(Buffer.from("b")),
    );
  });

  it("produit un SHA-256 en hexadécimal", () => {
    expect(hasherDocument(Buffer.from("document"))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("codes de vérification", () => {
  it("génère un code à 6 chiffres", () => {
    for (let i = 0; i < 50; i++) expect(genererCode()).toMatch(/^\d{6}$/);
  });

  it("accepte le bon code et refuse les autres", () => {
    const hash = hasherCode("123456");
    expect(codeCorrespond("123456", hash)).toBe(true);
    expect(codeCorrespond("123457", hash)).toBe(false);
    expect(codeCorrespond("", hash)).toBe(false);
  });

  it("ne stocke jamais le code en clair", () => {
    expect(hasherCode("123456")).not.toContain("123456");
  });
});
