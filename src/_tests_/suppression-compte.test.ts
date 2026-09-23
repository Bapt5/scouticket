import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@/lib/baseDeDonnees", () => ({ pool: { query: mocks.query } }));

import { verifierSuppressionCompte } from "@/lib/suppressionCompte";

describe("verifierSuppressionCompte", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuse la suppression tant que l'utilisateur est membre d'un groupe", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    await expect(verifierSuppressionCompte("user_1")).rejects.toBeInstanceOf(
      APIError,
    );
    expect(mocks.query).toHaveBeenCalledWith(expect.any(String), ["user_1"]);
  });

  it("autorise la suppression quand l'utilisateur n'a plus de groupe", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    await expect(verifierSuppressionCompte("user_1")).resolves.toBeUndefined();
  });
});
