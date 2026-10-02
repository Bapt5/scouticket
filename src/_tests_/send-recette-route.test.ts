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
  validerCorpsRequeteRecette: vi.fn(),
  envoyerEmailRecette: vi.fn(),
  reserverNumeros: vi.fn(),
  requeteClient: vi.fn(),
  liberer: vi.fn(),
  convertirPiecesJointesEnPdf: vi.fn(),
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
    reserverNumeros: mocks.reserverNumeros,
  };
});
vi.mock("@/lib/baseDeDonnees", () => ({
  pool: {
    connect: async () => ({
      query: mocks.requeteClient,
      release: mocks.liberer,
    }),
  },
}));
vi.mock("@/lib/api/securiteRequetes", () => ({
  verifierOrigineRequete: mocks.verifierOrigineRequete,
  verifierRateLimit: mocks.verifierRateLimit,
  reponseRateLimit: mocks.reponseRateLimit,
}));
vi.mock("@/lib/api/validateBodyRecette", () => ({
  validerCorpsRequeteRecette: mocks.validerCorpsRequeteRecette,
}));
vi.mock("@/lib/conversionJustificatifs", () => ({
  convertirPiecesJointesEnPdf: mocks.convertirPiecesJointesEnPdf,
}));
vi.mock("@/lib/email", () => ({
  envoyerEmailRecette: mocks.envoyerEmailRecette,
}));

import { POST } from "@/app/api/send-recette/route";

const REQUETE_BASE = () =>
  new Request("https://example.test/api/send-recette", {
    method: "POST",
    body: JSON.stringify({ userEmail: "membre@example.test" }),
  });

const detailRecetteSansPieceJointe = {
  emailUtilisateur: "membre@example.test",
  date: "2026-01-01",
  branche: "farfadets",
  montant: 45,
  piecesJointes: [],
  detailRecette: {
    date: "2026-01-01",
    modePaiement: "Virement",
    description: "",
    lignes: [{ categorie: "Cotisations SGDF", montant: 45 }],
  },
};

describe("POST /api/send-recette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SMTP_HOST = "smtp.test";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASSWORD = "password";

    mocks.recupererContexteGroupe.mockResolvedValue({
      session: { user: { email: "membre@example.test", name: "Jean Dupont" } },
      identifiantUtilisateur: "user_1",
      identifiantOrganisation: "org_1",
    });
    mocks.verifierOrigineRequete.mockReturnValue(null);
    mocks.verifierRateLimit.mockReturnValue({ autorise: true });
    mocks.validerCorpsRequeteRecette.mockReturnValue({
      donneesEmail: { ...detailRecetteSansPieceJointe },
    });
    mocks.recupererGroupeActif.mockResolvedValue({
      organisation: { id: "org_1", name: "Groupe test" },
      unites: [{ id: "farfadets", label: "Farfadets", color: "#6CC24A" }],
      emailsTresoriers: ["tresorerie@example.test"],
      nomenclature: {
        anneeComptable: { mois: 9, jour: 1, format: "debut-fin" },
        depense: { format: null },
        recette: { format: null },
      },
      parametres: {
        scanJustificatifsActif: false,
        convertirJustificatifsEnPdf: false,
        moyensPaiement: ["Carte de procurement"],
      },
    });
    mocks.recupererRoleMembre.mockResolvedValue("owner");
    mocks.envoyerEmailRecette.mockResolvedValue({ messageId: "abc" });
  });

  it("envoie une recette sans pièce jointe et sans réserver de numéro", async () => {
    const reponse = await POST(REQUETE_BASE() as never);

    expect(reponse.status).toBe(200);
    expect(mocks.reserverNumeros).not.toHaveBeenCalled();
    expect(mocks.envoyerEmailRecette).toHaveBeenCalledTimes(1);
  });

  it("refuse tant que le groupe n'a aucun trésorier", async () => {
    mocks.recupererGroupeActif.mockResolvedValue({
      organisation: { id: "org_1", name: "Groupe test" },
      unites: [{ id: "farfadets", label: "Farfadets", color: "#6CC24A" }],
      emailsTresoriers: [],
      nomenclature: {
        anneeComptable: { mois: 9, jour: 1, format: "debut-fin" },
        depense: { format: null },
        recette: { format: null },
      },
      parametres: {
        scanJustificatifsActif: false,
        convertirJustificatifsEnPdf: false,
        moyensPaiement: [],
      },
    });

    const reponse = await POST(REQUETE_BASE() as never);

    expect(reponse.status).toBe(403);
    expect(mocks.envoyerEmailRecette).not.toHaveBeenCalled();
  });

  it("refuse un membre sans accès à l'unité soumise", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");
    mocks.recupererUnitesAutoriseesMembre.mockResolvedValue(new Set());

    const reponse = await POST(REQUETE_BASE() as never);

    expect(reponse.status).toBe(403);
    expect(mocks.envoyerEmailRecette).not.toHaveBeenCalled();
  });

  describe("avec une nomenclature de recette mais sans pièce jointe", () => {
    beforeEach(() => {
      mocks.validerCorpsRequeteRecette.mockReturnValue({
        donneesEmail: { ...detailRecetteSansPieceJointe },
      });
      mocks.recupererGroupeActif.mockResolvedValue({
        organisation: { id: "org_1", name: "Groupe test" },
        unites: [{ id: "farfadets", label: "Farfadets", color: "#6CC24A" }],
        emailsTresoriers: ["tresorerie@example.test"],
        nomenclature: {
          anneeComptable: { mois: 9, jour: 1, format: "debut-fin" },
          depense: { format: null },
          recette: { format: "{YYYY} - R{GlobalNumero}" },
        },
        parametres: {
          scanJustificatifsActif: false,
          convertirJustificatifsEnPdf: false,
          moyensPaiement: [],
        },
      });
      mocks.reserverNumeros.mockResolvedValue({ premierGlobal: 7 });
      mocks.requeteClient.mockResolvedValue({});
    });

    it("réserve quand même un numéro et transmet une référence textuelle sans extension", async () => {
      const reponse = await POST(REQUETE_BASE() as never);

      expect(reponse.status).toBe(200);
      expect(mocks.reserverNumeros).toHaveBeenCalledWith(
        expect.anything(),
        "org_1",
        expect.objectContaining({ global: 1 }),
        "recette",
      );
      const envoye = mocks.envoyerEmailRecette.mock.calls[0][0];
      expect(envoye.detailRecette.reference).toBe("2026 - R007");
      expect(envoye.piecesJointes).toEqual([]);
      expect(mocks.requeteClient).toHaveBeenCalledWith("COMMIT");
    });
  });

  describe("avec une pièce jointe et une nomenclature de recette", () => {
    beforeEach(() => {
      mocks.validerCorpsRequeteRecette.mockReturnValue({
        donneesEmail: {
          ...detailRecetteSansPieceJointe,
          piecesJointes: [
            {
              nomAffiche: "cheque.jpg",
              typeMime: "image/jpeg",
              donneesBase64: "AAAA",
              nomFichierOriginal: "cheque.jpg",
              nomFichierNormalise: "cheque.jpg",
            },
          ],
        },
      });
      mocks.recupererGroupeActif.mockResolvedValue({
        organisation: { id: "org_1", name: "Groupe test" },
        unites: [{ id: "farfadets", label: "Farfadets", color: "#6CC24A" }],
        emailsTresoriers: ["tresorerie@example.test"],
        nomenclature: {
          anneeComptable: { mois: 9, jour: 1, format: "debut-fin" },
          depense: { format: null },
          recette: { format: "{YYYY} - {GlobalNumero}" },
        },
        parametres: {
          scanJustificatifsActif: false,
          convertirJustificatifsEnPdf: false,
          moyensPaiement: [],
        },
      });
      mocks.reserverNumeros.mockResolvedValue({ premierGlobal: 3 });
      mocks.requeteClient.mockResolvedValue({});
    });

    it("réserve un numéro dans le domaine « recette » et valide la transaction", async () => {
      const reponse = await POST(REQUETE_BASE() as never);

      expect(reponse.status).toBe(200);
      expect(mocks.requeteClient).toHaveBeenCalledWith("BEGIN");
      expect(mocks.reserverNumeros).toHaveBeenCalledWith(
        expect.anything(),
        "org_1",
        expect.objectContaining({ global: 1 }),
        "recette",
      );
      expect(mocks.requeteClient).toHaveBeenCalledWith("COMMIT");
      expect(mocks.liberer).toHaveBeenCalled();
      const envoye = mocks.envoyerEmailRecette.mock.calls[0][0];
      expect(envoye.detailRecette.reference).toBe("2026 - 003");
      expect(envoye.piecesJointes[0].nomFichierNormalise).toBe(
        "2026 - 003.jpg",
      );
    });

    it("annule la réservation si l'envoi échoue", async () => {
      mocks.envoyerEmailRecette.mockRejectedValue(new Error("SMTP_DOWN"));

      const reponse = await POST(REQUETE_BASE() as never);

      expect(reponse.status).toBeGreaterThanOrEqual(400);
      expect(mocks.requeteClient).toHaveBeenCalledWith("ROLLBACK");
      expect(mocks.requeteClient).not.toHaveBeenCalledWith("COMMIT");
      expect(mocks.liberer).toHaveBeenCalled();
    });
  });
});
