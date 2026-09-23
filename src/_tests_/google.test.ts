import { afterEach, describe, expect, it, vi } from "vitest";
import { googleActif } from "../lib/google";

describe("googleActif", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("est inactif sans identifiants", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(googleActif()).toBe(false);
  });

  it("est inactif avec un seul identifiant", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect(googleActif()).toBe(false);
  });

  it("est actif avec les deux identifiants", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    expect(googleActif()).toBe(true);
  });
});
