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
  verifierPostesEnvoi: vi.fn(),
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
vi.mock("@/lib/budgetServer", () => ({
  verifierPostesEnvoi: mocks.verifierPostesEnvoi,
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
      session: { user: { email: "membre@example.test", name: "Jean Dupont" } },
      identifiantUtilisateur: "user_1",
      identifiantOrganisation: "org_1",
    });
    mocks.recupererSession.mockResolvedValue({
      user: {
        id: "user_1",
        email: "membre@example.test",
        name: "Jean Dupont",
      },
    });
    mocks.requeteClient.mockResolvedValue({
      rows: [{ historique_actif: false }],
    });
    mocks.verifierOrigineRequete.mockReturnValue(null);
    mocks.verifierRateLimit.mockReturnValue({ autorise: true });
    mocks.validerCorpsRequete.mockReturnValue({
      donneesEmail: {
        typeEnvoi: "depense-groupe",
        emailUtilisateur: "membre@example.test",
        date: "2026-01-01",
        branche: "farfadets",
        montant: 12,
        piecesJointes: [],
        detailsDepenses: [],
      },
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
    mocks.envoyerEmailDepense.mockResolvedValue({ messageId: "abc" });
    mocks.verifierPostesEnvoi.mockResolvedValue(null);
  });

  it("refuse l'envoi si le groupe n'a aucun trésorier", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("owner");
    mocks.recupererGroupeActif.mockResolvedValue({
      ...(await mocks.recupererGroupeActif()),
      emailsTresoriers: [],
    });

    const reponse = await POST(REQUETE_BASE() as never);

    expect(reponse.status).toBe(403);
    expect(mocks.envoyerEmailDepense).not.toHaveBeenCalled();
  });

  it("refuse un membre sans accès à l’unité soumise", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");
    mocks.recupererUnitesAutoriseesMembre.mockResolvedValue(new Set());

    const reponse = await POST(REQUETE_BASE() as never);

    expect(reponse.status).toBe(403);
    expect(mocks.envoyerEmailDepense).not.toHaveBeenCalled();
  });

  it("valide le corps avec les moyens de paiement du groupe actif", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("owner");

    await POST(REQUETE_BASE() as never);

    expect(mocks.validerCorpsRequete).toHaveBeenCalledWith(
      expect.anything(),
      ["Carte de procurement"],
      undefined,
    );
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

  it("refuse un membre déclarant une dépense sans justificatif", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");
    mocks.recupererUnitesAutoriseesMembre.mockResolvedValue(
      new Set(["farfadets"]),
    );
    const corps = mocks.validerCorpsRequete();
    corps.donneesEmail.sansJustificatifAttesteParResponsable = true;
    mocks.validerCorpsRequete.mockReturnValue(corps);

    const reponse = await POST(REQUETE_BASE() as never);

    expect(reponse.status).toBe(403);
    expect(mocks.envoyerEmailDepense).not.toHaveBeenCalled();
  });

  it.each(["admin", "owner"])(
    "laisse un responsable (%s) déclarer une dépense sans justificatif",
    async (role) => {
      mocks.recupererRoleMembre.mockResolvedValue(role);
      const corps = mocks.validerCorpsRequete();
      corps.donneesEmail.sansJustificatifAttesteParResponsable = true;
      mocks.validerCorpsRequete.mockReturnValue(corps);

      const reponse = await POST(REQUETE_BASE() as never);

      expect(reponse.status).toBe(200);
      expect(mocks.envoyerEmailDepense).toHaveBeenCalled();
      expect(
        mocks.envoyerEmailDepense.mock.calls[0][0]
          .sansJustificatifAttesteParResponsable,
      ).toBe(true);
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
    // Transaction de l'historique (sans détail ici) : aucune réservation de numéro.
    expect(mocks.requeteClient.mock.calls.map(([texte]) => texte)).toEqual([
      "BEGIN",
      "COMMIT",
    ]);
  });

  it("sans format, enregistre l'historique de l'envoi (unité, auteur, lignes) avant l'e-mail", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("owner");
    mocks.requeteClient.mockImplementation(async (texte: string) =>
      texte.includes("historique_actif")
        ? { rows: [{ historique_actif: true }] }
        : { rows: [] },
    );
    const corps = mocks.validerCorpsRequete();
    corps.donneesEmail.detailsDepenses = [
      {
        date: "2026-01-01",
        modePaiement: "Carte de procurement",
        activite: "",
        description: "Courses",
        lignes: [{ categorie: "Formation", montant: 12 }],
      },
    ];
    mocks.validerCorpsRequete.mockReturnValue(corps);

    const reponse = await POST(REQUETE_BASE() as never);

    expect(reponse.status).toBe(200);
    const insertion = mocks.requeteClient.mock.calls.find(([texte]) =>
      String(texte).includes("INSERT INTO scouticket_historique"),
    );
    expect(insertion?.[1]).toEqual(
      expect.arrayContaining([
        "org_1",
        "depense",
        "farfadets",
        "Farfadets",
        "#6CC24A",
        null,
        12,
        "user_1",
      ]),
    );
    expect(
      mocks.requeteClient.mock.invocationCallOrder[
        mocks.requeteClient.mock.calls.findIndex(([texte]) =>
          String(texte).includes("INSERT INTO"),
        )
      ],
    ).toBeLessThan(mocks.envoyerEmailDepense.mock.invocationCallOrder[0]);
  });

  it("n'envoie pas l'e-mail et répond en erreur si l'historique ne peut pas être écrit", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("owner");
    mocks.requeteClient.mockImplementation(async (texte: string) => {
      if (texte.includes("historique_actif"))
        return { rows: [{ historique_actif: true }] };
      if (texte.includes("INSERT INTO")) throw new Error("INSERTION_ECHOUEE");
      return { rows: [] };
    });
    const corps = mocks.validerCorpsRequete();
    corps.donneesEmail.detailsDepenses = [
      {
        date: "2026-01-01",
        modePaiement: "Carte de procurement",
        activite: "",
        description: "",
        lignes: [{ categorie: "Formation", montant: 12 }],
      },
    ];
    mocks.validerCorpsRequete.mockReturnValue(corps);

    const reponse = await POST(REQUETE_BASE() as never);

    expect(reponse.status).toBe(500);
    expect(mocks.envoyerEmailDepense).not.toHaveBeenCalled();
    expect(mocks.requeteClient).toHaveBeenCalledWith("ROLLBACK");
    expect(mocks.requeteClient).not.toHaveBeenCalledWith("COMMIT");
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
        moyensPaiement: ["Carte de procurement"],
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

  it("ne convertit ni ne renomme le RIB selon la nomenclature, il porte le nom du demandeur", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("owner");
    const piece = {
      nomAffiche: "photo.jpg",
      typeMime: "image/jpeg",
      donneesBase64: "QQ==",
      nomFichierOriginal: "photo.jpg",
      nomFichierNormalise: "photo.jpg",
    };
    const rib = {
      nomAffiche: "mon:rib.jpg",
      typeMime: "image/jpeg",
      donneesBase64: "QQ==",
      nomFichierOriginal: "mon:rib.jpg",
      nomFichierNormalise: "mon:rib.jpg",
    };
    const corps = mocks.validerCorpsRequete();
    corps.donneesEmail.typeEnvoi = "note-de-frais";
    corps.donneesEmail.piecesJointes = [piece];
    corps.donneesEmail.rib = rib;
    mocks.validerCorpsRequete.mockReturnValue(corps);
    mocks.recupererGroupeActif.mockResolvedValue({
      ...(await mocks.recupererGroupeActif()),
      parametres: {
        scanJustificatifsActif: false,
        convertirJustificatifsEnPdf: true,
        moyensPaiement: ["Carte de procurement"],
      },
    });
    mocks.convertirPiecesJointesEnPdf.mockResolvedValue([piece]);

    const reponse = await POST(REQUETE_BASE() as never);

    expect(reponse.status).toBe(200);
    expect(mocks.convertirPiecesJointesEnPdf).toHaveBeenCalledWith([piece]);
    const envoye = mocks.envoyerEmailDepense.mock.calls[0][0];
    expect(envoye.rib.typeMime).toBe("image/jpeg");
    expect(envoye.rib.nomFichierNormalise).toBe("RIB - Jean Dupont.jpg");
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
      emailsTresoriers: ["tresorerie@example.test"],
      nomenclature: {
        anneeComptable: { mois: 9, jour: 1, format: "debut-fin" },
        depense: { format },
        recette: { format: null },
      },
      parametres: {
        scanJustificatifsActif: false,
        convertirJustificatifsEnPdf: false,
        moyensPaiement: ["Carte de procurement"],
      },
    });

    beforeEach(() => {
      mocks.recupererRoleMembre.mockResolvedValue("owner");
      mocks.validerCorpsRequete.mockReturnValue({
        donneesEmail: {
          typeEnvoi: "depense-groupe",
          emailUtilisateur: "membre@example.test",
          date: "2026-03-05",
          branche: "farfadets",
          montant: 12,
          detailsDepenses: [
            {
              date: "2026-03-05",
              description: "",
              activite: "",
              modePaiement: "Carte de procurement",
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
      expect(envoye.detailsDepenses[0].reference).toBe("2025-2026 - 013");
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

  describe("suivi budgétaire", () => {
    const detailAvecPoste = (posteBudgetaireId: string | null) => ({
      date: "2026-01-01",
      modePaiement: "Carte de procurement",
      activite: "",
      description: "Courses",
      lignes: [{ categorie: "Formation", montant: 12 }],
      posteBudgetaireId,
    });
    const preparer = (
      budgetActif: boolean,
      details: ReturnType<typeof detailAvecPoste>[],
    ) => {
      mocks.recupererRoleMembre.mockResolvedValue("owner");
      mocks.recupererGroupeActif.mockResolvedValue({
        ...mocks.recupererGroupeActif.mock.results[0]?.value,
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
          budgetActif,
        },
      });
      mocks.requeteClient.mockImplementation(async (texte: string) => {
        if (texte.includes("SELECT historique_actif"))
          return {
            rows: [{ historique_actif: true, budget_actif: budgetActif }],
          };
        if (texte.includes("scouticket_postes_budgetaires"))
          return {
            rows: [{ id: "poste-camp", label: "Camp", domaine: "depense" }],
          };
        return { rows: [] };
      });
      const corps = mocks.validerCorpsRequete();
      corps.donneesEmail.detailsDepenses = details;
      mocks.validerCorpsRequete.mockReturnValue(corps);
    };
    const insertion = () =>
      mocks.requeteClient.mock.calls.find(([texte]) =>
        String(texte).includes("INSERT INTO scouticket_historique"),
      );

    it("vérifie les postes de chaque pièce et les enregistre dans l'historique", async () => {
      preparer(true, [
        detailAvecPoste("poste-camp"),
        detailAvecPoste("poste-camp"),
      ]);

      const reponse = await POST(REQUETE_BASE() as never);

      expect(reponse.status).toBe(200);
      expect(mocks.verifierPostesEnvoi).toHaveBeenCalledWith(
        "org_1",
        true,
        "depense",
        ["poste-camp", "poste-camp"],
      );
      expect(insertion()?.[1].slice(-2)).toEqual(["poste-camp", "Camp"]);
    });

    it("refuse l'envoi (400) sans e-mail quand un poste est manquant ou invalide", async () => {
      preparer(true, [detailAvecPoste(null)]);
      mocks.verifierPostesEnvoi.mockResolvedValue("Poste budgétaire manquant");

      const reponse = await POST(REQUETE_BASE() as never);

      expect(reponse.status).toBe(400);
      await expect(reponse.json()).resolves.toMatchObject({
        error: "Poste budgétaire manquant",
      });
      expect(mocks.envoyerEmailDepense).not.toHaveBeenCalled();
      expect(insertion()).toBeUndefined();
    });

    it("ignore les postes envoyés quand le suivi est désactivé", async () => {
      preparer(false, [detailAvecPoste("poste-camp")]);

      const reponse = await POST(REQUETE_BASE() as never);

      expect(reponse.status).toBe(200);
      expect(mocks.verifierPostesEnvoi).toHaveBeenCalledWith(
        "org_1",
        false,
        "depense",
        ["poste-camp"],
      );
      expect(insertion()?.[1].slice(-2)).toEqual([null, null]);
    });
  });
});
