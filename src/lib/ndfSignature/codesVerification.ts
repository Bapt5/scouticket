import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const DUREE_VALIDITE_CODE_MINUTES = 10;
export const NOMBRE_MAX_TENTATIVES_CODE = 5;

/** Code numérique à 6 chiffres, envoyé par e-mail au signataire. */
export function genererCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hasherCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function codeCorrespond(codeSaisi: string, codeHash: string): boolean {
  const hashSaisi = Buffer.from(hasherCode(codeSaisi), "hex");
  const hashAttendu = Buffer.from(codeHash, "hex");
  return (
    hashSaisi.length === hashAttendu.length &&
    timingSafeEqual(hashSaisi, hashAttendu)
  );
}
