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
vi.mock("@/lib/api/validateBody", () => ({
  validerCorpsRequete: mocks.validerCorpsRequete,
}));
vi.mock("@/lib/conversionJustificatifs", () => ({
  convertirPiecesJointesEnPdf: mocks.convertirPiecesJointesEnPdf,
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
        montant: 12,
        description: "",
        piecesJointes: [],
        detailsDepenses: [],
      },
    });
    mocks.recupererGroupeActif.mockResolvedValue({
      organisation: { id: "org_1", name: "Groupe test" },
      unites: [{ id: "farfadets", label: "Farfadets", color: "#6CC24A" }],
      emailTresorerie: "tresorerie@example.test",
      validation: { status: "verified" },
      nomenclature: {
        format: null,
        anneeComptable: { mois: 9, jour: 1, format: "debut-fin" },
      },
      parametres: {
        scanJustificatifsActif: false,
        convertirJustificatifsEnPdf: false,
      },
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

  it("sans format, garde le nom du fichier importé et dédoublonne", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("owner");
    const piece = (nom: string) => ({
      nomAffiche: nom,
      typeMime: "image/jpeg",
      donneesBase64: "QQ==",
      nomFichierOriginal: nom,
      nomFichierNormalise: nom,
    });
    const corps = mocks.validerCorpsRequete();
    corps.donneesEmail.piecesJointes = [piece("image.jpg"), piece("image.jpg")];
    mocks.validerCorpsRequete.mockReturnValue(corps);

    const reponse = await POST(REQUETE_BASE() as never);

    expect(reponse.status).toBe(200);
    const envoye = mocks.envoyerEmailDepense.mock.calls[0][0];
    expect(
      envoye.piecesJointes.map(
        (p: { nomFichierNormalise: string }) => p.nomFichierNormalise,
      ),
    ).toEqual(["image - 01.jpg", "image - 02.jpg"]);
    expect(mocks.reserverNumeros).not.toHaveBeenCalled();
    expect(mocks.requeteClient).not.toHaveBeenCalled();
  });

  it("sans format, conserve le nom d'un fichier unique", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("owner");
    const corps = mocks.validerCorpsRequete();
    corps.donneesEmail.piecesJointes = [
      {
        nomAffiche: "Ticket.pdf",
        typeMime: "application/pdf",
        donneesBase64: "QQ==",
        nomFichierOriginal: "Ticket:1.pdf",
        nomFichierNormalise: "Ticket:1.pdf",
      },
    ];
    mocks.validerCorpsRequete.mockReturnValue(corps);

    await POST(REQUETE_BASE() as never);

    expect(
      mocks.envoyerEmailDepense.mock.calls[0][0].piecesJointes[0]
        .nomFichierNormalise,
    ).toBe("Ticket-1.pdf");
  });

  it("convertit les justificatifs en PDF avant le nommage si le groupe l'a activé", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("owner");
    const piece = {
      nomAffiche: "photo.jpg",
      typeMime: "image/jpeg",
      donneesBase64: "QQ==",
      nomFichierOriginal: "photo.jpg",
      nomFichierNormalise: "photo.jpg",
    };
    const corps = mocks.validerCorpsRequete();
    corps.donneesEmail.piecesJointes = [piece];
    mocks.validerCorpsRequete.mockReturnValue(corps);
    mocks.recupererGroupeActif.mockResolvedValue({
      ...(await mocks.recupererGroupeActif()),
      parametres: {
        scanJustificatifsActif: false,
        convertirJustificatifsEnPdf: true,
      },
    });
    mocks.convertirPiecesJointesEnPdf.mockResolvedValue([
      {
        ...piece,
        typeMime: "application/pdf",
        nomFichierOriginal: "photo.pdf",
        nomFichierNormalise: "photo.pdf",
      },
    ]);

    const reponse = await POST(REQUETE_BASE() as never);

    expect(reponse.status).toBe(200);
    expect(mocks.convertirPiecesJointesEnPdf).toHaveBeenCalledWith([piece]);
    expect(
      mocks.envoyerEmailDepense.mock.calls[0][0].piecesJointes[0]
        .nomFichierNormalise,
    ).toBe("photo.pdf");
  });

  it("ne convertit pas les justificatifs par défaut", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("owner");

    await POST(REQUETE_BASE() as never);

    expect(mocks.convertirPiecesJointesEnPdf).not.toHaveBeenCalled();
  });

  describe("avec une nomenclature de groupe", () => {
    const groupeAvecFormat = (format: string) => ({
      organisation: { id: "org_1", name: "Groupe test" },
      unites: [{ id: "farfadets", label: "Farfadets", color: "#6CC24A" }],
      emailTresorerie: "tresorerie@example.test",
      validation: { status: "verified" },
      nomenclature: {
        format,
        anneeComptable: { mois: 9, jour: 1, format: "debut-fin" },
      },
      parametres: {
        scanJustificatifsActif: false,
        convertirJustificatifsEnPdf: false,
      },
    });

    beforeEach(() => {
      mocks.recupererRoleMembre.mockResolvedValue("owner");
      mocks.validerCorpsRequete.mockReturnValue({
        donneesEmail: {
          emailUtilisateur: "membre@example.test",
          date: "2026-03-05",
          branche: "farfadets",
          montant: 12,
          description: "",
          detailsDepenses: [
            {
              modePaiement: "Carte bancaire",
              lignes: [{ categorie: "Carburant", montant: 12 }],
            },
          ],
          piecesJointes: [
            {
              nomAffiche: "a.pdf",
              typeMime: "application/pdf",
              donneesBase64: "QQ==",
              nomFichierOriginal: "a.pdf",
              nomFichierNormalise: "nom-du-client.pdf",
            },
          ],
        },
      });
      mocks.reserverNumeros.mockResolvedValue({
        premierGlobal: 42,
        premierComptable: 13,
      });
    });

    it("génère le nom côté serveur et valide la transaction", async () => {
      mocks.recupererGroupeActif.mockResolvedValue(
        groupeAvecFormat("{AnneeComptable} - {GlobalNumeroComptable}"),
      );

      const reponse = await POST(REQUETE_BASE() as never);

      expect(reponse.status).toBe(200);
      const envoye = mocks.envoyerEmailDepense.mock.calls[0][0];
      expect(envoye.piecesJointes[0].nomFichierNormalise).toBe(
        "2025-2026 - 013.pdf",
      );
      expect(mocks.reserverNumeros).toHaveBeenCalledWith(
        expect.anything(),
        "org_1",
        { global: 0, comptable: { annee: 2025, nombre: 1 } },
      );
      expect(mocks.requeteClient).toHaveBeenCalledWith("COMMIT");
      expect(mocks.liberer).toHaveBeenCalled();
    });

    it("n'utilise aucun compteur sans numéro global dans le format", async () => {
      mocks.recupererGroupeActif.mockResolvedValue(
        groupeAvecFormat("{YYYY}-{MM}-{DD} - {Branche} - {Numero}"),
      );

      await POST(REQUETE_BASE() as never);

      expect(mocks.reserverNumeros).not.toHaveBeenCalled();
      const envoye = mocks.envoyerEmailDepense.mock.calls[0][0];
      expect(envoye.piecesJointes[0].nomFichierNormalise).toBe(
        "2026-03-05 - Farfadets - 01.pdf",
      );
    });

    it("annule la réservation si l'envoi échoue", async () => {
      mocks.recupererGroupeActif.mockResolvedValue(
        groupeAvecFormat("{GlobalNumero}"),
      );
      mocks.envoyerEmailDepense.mockRejectedValue(new Error("SMTP_KO"));

      const reponse = await POST(REQUETE_BASE() as never);

      expect(reponse.status).toBeGreaterThanOrEqual(400);
      expect(mocks.requeteClient).toHaveBeenCalledWith("ROLLBACK");
      expect(mocks.requeteClient).not.toHaveBeenCalledWith("COMMIT");
      expect(mocks.liberer).toHaveBeenCalled();
    });

    it("refuse une date invalide quand un format est défini", async () => {
      mocks.recupererGroupeActif.mockResolvedValue(groupeAvecFormat("{YYYY}"));
      const corps = mocks.validerCorpsRequete();
      corps.donneesEmail.date = "pas-une-date";
      mocks.validerCorpsRequete.mockReturnValue(corps);

      const reponse = await POST(REQUETE_BASE() as never);

      expect(reponse.status).toBe(400);
      expect(mocks.envoyerEmailDepense).not.toHaveBeenCalled();
    });
  });
});
