// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requetes: [] as string[],
  historiqueActif: true,
  echecInsertion: false,
  query: vi.fn(),
  release: vi.fn(),
  reserverNumeros: vi.fn(),
  envoyerEmailDepense: vi.fn(),
}));

vi.mock("@/lib/baseDeDonnees", () => ({
  pool: {
    connect: async () => ({ query: mocks.query, release: mocks.release }),
  },
}));
vi.mock("@/lib/groupServer", () => ({
  reserverNumeros: mocks.reserverNumeros,
}));
vi.mock("@/lib/email", () => ({
  envoyerEmailDepense: mocks.envoyerEmailDepense,
}));

import { envoyerAvecNomenclature } from "@/lib/envoiNomenclature";
import { envoyerAvecHistorique } from "@/lib/historiqueServer";
import type { DonneesEmailDepense } from "@/lib/email";

const contexte = {
  auteurUserId: "user-1",
  uniteId: "unite-1",
  uniteLabel: "Louveteaux",
  uniteCouleur: "#112233",
};

const donnees = (): DonneesEmailDepense => ({
  typeEnvoi: "note-de-frais",
  emailUtilisateur: "a@example.test",
  date: "2026-03-10",
  branche: "Louveteaux",
  montant: 20,
  piecesJointes: [],
  detailsDepenses: [
    {
      date: "2026-03-10",
      modePaiement: "",
      activite: "Camp",
      description: "",
      lignes: [{ categorie: "Formation", montant: 12 }],
    },
    {
      date: "2026-03-11",
      modePaiement: "",
      activite: "Camp",
      description: "",
      lignes: [{ categorie: "Formation", montant: 8 }],
    },
  ],
  emailsTresoriers: ["t@example.test"],
});

const anneeComptable = { mois: 1, jour: 1, format: "debut" as const };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = "https://app.test/";
  mocks.requetes = [];
  mocks.historiqueActif = true;
  mocks.echecInsertion = false;
  mocks.query.mockImplementation(async (texte: string) => {
    const instruction = texte.trim().split(/\s+/)[0];
    mocks.requetes.push(
      texte.includes("INSERT INTO scouticket_historique")
        ? "INSERT_HISTORIQUE"
        : instruction,
    );
    if (texte.includes("SELECT historique_actif"))
      return { rows: [{ historique_actif: mocks.historiqueActif }] };
    if (texte.includes("INSERT INTO scouticket_historique")) {
      if (mocks.echecInsertion) throw new Error("INSERTION_ECHOUEE");
    }
    return { rows: [] };
  });
  mocks.reserverNumeros.mockImplementation(async () => {
    mocks.requetes.push("RESERVER_NUMEROS");
    return { premierGlobal: 5 };
  });
  mocks.envoyerEmailDepense.mockImplementation(async () => {
    mocks.requetes.push("ENVOI_EMAIL");
    return { messageId: "m1" };
  });
});

describe("envoyerAvecNomenclature avec historique", () => {
  it("écrit une entrée par justificatif avant l'envoi, dans la transaction", async () => {
    await envoyerAvecNomenclature(
      donnees(),
      "org-1",
      "{GlobalNumero}",
      anneeComptable,
      { contexte },
    );

    expect(mocks.requetes).toEqual([
      "BEGIN",
      "RESERVER_NUMEROS",
      "SELECT",
      "INSERT_HISTORIQUE",
      "INSERT_HISTORIQUE",
      "ENVOI_EMAIL",
      "COMMIT",
    ]);
    const insertions = mocks.query.mock.calls.filter(([texte]) =>
      String(texte).includes("INSERT INTO scouticket_historique"),
    );
    // Même envoi, références distinctes, montants par justificatif.
    expect(insertions[0][1][2]).toBe(insertions[1][1][2]);
    expect(insertions.map(([, valeurs]) => valeurs[8])).toEqual(["005", "006"]);
    expect(insertions.map(([, valeurs]) => valeurs[12])).toEqual([12, 8]);
  });

  it("n'écrit rien quand l'historique est désactivé", async () => {
    mocks.historiqueActif = false;

    await envoyerAvecNomenclature(
      donnees(),
      "org-1",
      "{GlobalNumero}",
      anneeComptable,
      { contexte },
    );

    expect(mocks.requetes).not.toContain("INSERT_HISTORIQUE");
    expect(mocks.requetes[mocks.requetes.length - 1]).toBe("COMMIT");
  });

  it("annule tout, sans envoi ni numéro consommé, si l'insertion échoue", async () => {
    mocks.echecInsertion = true;

    await expect(
      envoyerAvecNomenclature(
        donnees(),
        "org-1",
        "{GlobalNumero}",
        anneeComptable,
        {
          contexte,
        },
      ),
    ).rejects.toThrow("INSERTION_ECHOUEE");

    expect(mocks.envoyerEmailDepense).not.toHaveBeenCalled();
    expect(mocks.requetes).toContain("ROLLBACK");
    expect(mocks.requetes).not.toContain("COMMIT");
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });

  it("annule aussi l'historique si l'envoi de l'e-mail échoue", async () => {
    mocks.envoyerEmailDepense.mockRejectedValue(new Error("SMTP"));

    await expect(
      envoyerAvecNomenclature(
        donnees(),
        "org-1",
        "{GlobalNumero}",
        anneeComptable,
        {
          contexte,
        },
      ),
    ).rejects.toThrow("SMTP");

    expect(mocks.requetes).toContain("ROLLBACK");
    expect(mocks.requetes).not.toContain("COMMIT");
  });

  it("fonctionne sans historique demandé (aucune lecture du paramètre)", async () => {
    await envoyerAvecNomenclature(
      donnees(),
      "org-1",
      "{GlobalNumero}",
      anneeComptable,
    );

    expect(mocks.requetes).toEqual([
      "BEGIN",
      "RESERVER_NUMEROS",
      "ENVOI_EMAIL",
      "COMMIT",
    ]);
  });
});

describe("lien vers l'historique dans l'e-mail", () => {
  const insertions = () =>
    mocks.query.mock.calls.filter(([texte]) =>
      String(texte).includes("INSERT INTO scouticket_historique"),
    );

  it("pointe vers l'entrée quand l'envoi n'en produit qu'une", async () => {
    const unSeulJustificatif = donnees();
    unSeulJustificatif.detailsDepenses = [
      unSeulJustificatif.detailsDepenses[0],
    ];

    await envoyerAvecNomenclature(
      unSeulJustificatif,
      "org-1",
      "{GlobalNumero}",
      anneeComptable,
      { contexte },
    );

    const identifiant = insertions()[0][1][0];
    expect(mocks.envoyerEmailDepense.mock.calls[0][0].lienHistorique).toBe(
      `https://app.test/historique?entree=${identifiant}`,
    );
  });

  it("pointe vers la page quand l'envoi produit plusieurs entrées", async () => {
    await envoyerAvecNomenclature(
      donnees(),
      "org-1",
      "{GlobalNumero}",
      anneeComptable,
      { contexte },
    );

    expect(insertions()).toHaveLength(2);
    expect(mocks.envoyerEmailDepense.mock.calls[0][0].lienHistorique).toBe(
      "https://app.test/historique",
    );
  });

  it("n'ajoute aucun lien quand l'historique est désactivé", async () => {
    mocks.historiqueActif = false;

    await envoyerAvecNomenclature(
      donnees(),
      "org-1",
      "{GlobalNumero}",
      anneeComptable,
      { contexte },
    );

    expect(
      mocks.envoyerEmailDepense.mock.calls[0][0].lienHistorique,
    ).toBeUndefined();
  });

  it("sans APP_URL, n'échoue pas et n'ajoute aucun lien", async () => {
    delete process.env.APP_URL;

    await envoyerAvecNomenclature(
      donnees(),
      "org-1",
      "{GlobalNumero}",
      anneeComptable,
      { contexte },
    );

    expect(
      mocks.envoyerEmailDepense.mock.calls[0][0].lienHistorique,
    ).toBeUndefined();
  });

  it("transmet le lien à l'envoi sans nomenclature", async () => {
    const envoyer = vi.fn().mockResolvedValue("ok");

    await envoyerAvecHistorique(
      "org-1",
      {
        contexte,
        entrees: [
          {
            type: "recette",
            date: "2026-03-10",
            reference: null,
            modePaiement: "Virement",
            activite: "",
            description: "",
            lignes: [{ categorie: "Cotisations SGDF", montant: 5 }],
          },
        ],
      },
      envoyer,
    );

    expect(envoyer).toHaveBeenCalledWith(
      `https://app.test/historique?entree=${insertions()[0][1][0]}`,
    );
  });
});

describe("envoyerAvecHistorique (sans nomenclature)", () => {
  const entrees = [
    {
      type: "depense" as const,
      date: "2026-03-10",
      reference: null,
      modePaiement: "Carte",
      activite: "",
      description: "",
      lignes: [{ categorie: "Formation", montant: 5 }],
    },
  ];

  it("insère puis envoie, puis valide", async () => {
    const resultat = await envoyerAvecHistorique(
      "org-1",
      { contexte, entrees },
      async () => {
        mocks.requetes.push("ENVOI_EMAIL");
        return "ok";
      },
    );

    expect(resultat).toBe("ok");
    expect(mocks.requetes).toEqual([
      "BEGIN",
      "SELECT",
      "INSERT_HISTORIQUE",
      "ENVOI_EMAIL",
      "COMMIT",
    ]);
  });

  it("n'envoie rien si l'insertion échoue", async () => {
    mocks.echecInsertion = true;
    const envoyer = vi.fn();

    await expect(
      envoyerAvecHistorique("org-1", { contexte, entrees }, envoyer),
    ).rejects.toThrow("INSERTION_ECHOUEE");

    expect(envoyer).not.toHaveBeenCalled();
    expect(mocks.requetes).toContain("ROLLBACK");
  });
});
