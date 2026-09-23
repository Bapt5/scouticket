import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recupererContexteGroupe: vi.fn(),
  recupererSession: vi.fn(),
  recupererGroupeActif: vi.fn(),
  recupererRoleMembre: vi.fn(),
  recupererUnitesAutoriseesMembre: vi.fn(),
  verifierOrigineRequete: vi.fn(),
  verifierRateLimit: vi.fn(),
  reponseRateLimit: vi.fn(),
  validerCorpsRequete: vi.fn(),
  envoyerEmailDepense: vi.fn(),
}));

vi.mock("@/lib/sessionServeur", () => ({
  recupererContexteGroupe: mocks.recupererContexteGroupe,
  recupererSession: mocks.recupererSession,
}));
vi.mock("@/lib/groupServer", async () => {
  const reel =
    await vi.importActual<typeof import("@/lib/groupServer")>(
      "@/lib/groupServer",
    );
  return {
    ...reel,
    recupererGroupeActif: mocks.recupererGroupeActif,
    recupererRoleMembre: mocks.recupererRoleMembre,
    recupererUnitesAutoriseesMembre: mocks.recupererUnitesAutoriseesMembre,
  };
});
vi.mock("@/lib/api/securiteRequetes", () => ({
  verifierOrigineRequete: mocks.verifierOrigineRequete,
  verifierRateLimit: mocks.verifierRateLimit,
  reponseRateLimit: mocks.reponseRateLimit,
}));
vi.mock("@/lib/api/validateBody", () => ({
  validerCorpsRequete: mocks.validerCorpsRequete,
}));
vi.mock("@/lib/email", () => ({
  envoyerEmailDepense: mocks.envoyerEmailDepense,
}));

import { POST } from "@/app/api/send-expense/route";

const REQUETE_BASE = () =>
  new Request("https://example.test/api/send-expense", {
    method: "POST",
    body: JSON.stringify({ userEmail: "membre@example.test" }),
  });

describe("POST /api/send-expense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SMTP_HOST = "smtp.test";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASSWORD = "password";

    mocks.recupererContexteGroupe.mockResolvedValue({
      session: { user: { email: "membre@example.test" } },
      identifiantUtilisateur: "user_1",
      identifiantOrganisation: "org_1",
    });
    mocks.recupererSession.mockResolvedValue({
      user: { id: "user_1", email: "membre@example.test" },
    });
    mocks.verifierOrigineRequete.mockReturnValue(null);
    mocks.verifierRateLimit.mockReturnValue({ autorise: true });
    mocks.validerCorpsRequete.mockReturnValue({
      donneesEmail: {
        emailUtilisateur: "membre@example.test",
        date: "2026-01-01",
        branche: "farfadets",
        typeDepense: "Transport",
        modePaiement: "Carte",
        montant: 12,
        description: "",
        piecesJointes: [],
      },
    });
    mocks.recupererGroupeActif.mockResolvedValue({
      organisation: { id: "org_1", name: "Groupe test" },
      unites: [{ id: "farfadets", label: "Farfadets", color: "#6CC24A" }],
      emailTresorerie: "tresorerie@example.test",
      validation: { status: "verified" },
    });
    mocks.envoyerEmailDepense.mockResolvedValue({ messageId: "abc" });
  });

  it("refuse un membre sans accès à l’unité soumise", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");
    mocks.recupererUnitesAutoriseesMembre.mockResolvedValue(new Set());

    const reponse = await POST(REQUETE_BASE() as never);

    expect(reponse.status).toBe(403);
    expect(mocks.envoyerEmailDepense).not.toHaveBeenCalled();
  });

  it("autorise un membre ayant accès à l’unité soumise", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");
    mocks.recupererUnitesAutoriseesMembre.mockResolvedValue(
      new Set(["farfadets"]),
    );

    const reponse = await POST(REQUETE_BASE() as never);

    expect(reponse.status).toBe(200);
    expect(mocks.envoyerEmailDepense).toHaveBeenCalled();
  });

  it.each(["admin", "owner"])(
    "laisse un responsable (%s) soumettre sans ligne d’accès",
    async (role) => {
      mocks.recupererRoleMembre.mockResolvedValue(role);
      mocks.recupererUnitesAutoriseesMembre.mockResolvedValue(new Set());

      const reponse = await POST(REQUETE_BASE() as never);

      expect(reponse.status).toBe(200);
      expect(mocks.recupererUnitesAutoriseesMembre).not.toHaveBeenCalled();
      expect(mocks.envoyerEmailDepense).toHaveBeenCalled();
    },
  );
});
