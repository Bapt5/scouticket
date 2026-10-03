// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acces: vi.fn(),
  query: vi.fn(),
  verifierOrigineRequete: vi.fn(),
  recupererSession: vi.fn(),
}));

vi.mock("@/lib/historiqueAcces", () => ({
  recupererAccesHistorique: mocks.acces,
}));
vi.mock("@/lib/baseDeDonnees", () => ({ pool: { query: mocks.query } }));
vi.mock("@/lib/sessionServeur", () => ({
  recupererSession: mocks.recupererSession,
}));
vi.mock("@/lib/api/securiteRequetes", () => ({
  verifierOrigineRequete: mocks.verifierOrigineRequete,
}));
vi.mock("@/lib/logger", () => ({
  journal: { erreur: vi.fn(), info: vi.fn(), avertissement: vi.fn() },
}));

import { GET } from "@/app/api/historique/route";
import { GET as EXPORT } from "@/app/api/historique/export/route";
import {
  DELETE,
  GET as GET_ENTREE,
  PATCH,
} from "@/app/api/historique/[id]/route";

const groupe = {
  unites: [
    { id: "unite-1", label: "Louveteaux", color: "#111111" },
    { id: "unite-2", label: "Éclaireurs", color: "#222222" },
  ],
  nomenclature: { anneeComptable: { mois: 9, jour: 1, format: "debut-fin" } },
  parametres: { moyensPaiement: ["Carte du groupe"], historiqueActif: true },
};

const accesResponsable = {
  identifiantUtilisateur: "user-1",
  identifiantOrganisation: "org-1",
  groupe,
  responsable: true,
  unitesAutorisees: null,
};
const accesMembre = {
  ...accesResponsable,
  responsable: false,
  unitesAutorisees: new Set(["unite-2"]),
};

const ligneSql = (surcharge: Record<string, unknown> = {}) => ({
  id: "h-1",
  envoi_id: "e-1",
  type: "depense",
  date: "2026-03-10",
  unite_id: "unite-1",
  unite_label: "Louveteaux",
  unite_couleur: "#111111",
  reference: "2026-001",
  mode_paiement: "Carte du groupe",
  activite: "",
  description: "Courses",
  montant_total: 20,
  lignes: [{ categorie: "Formation", montant: 20 }],
  auteur_nom: "Camille",
  cree_le: new Date("2026-03-10T10:00:00Z"),
  modifie_le: null,
  modifie_par_nom: null,
  ...surcharge,
});

const requete = (url: string, methode = "GET", corps?: unknown) =>
  new Request(`https://example.test${url}`, {
    method: methode,
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
const contexteId = { params: Promise.resolve({ id: "h-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acces.mockResolvedValue(accesResponsable);
  mocks.recupererSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.verifierOrigineRequete.mockReturnValue(null);
  mocks.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("GET /api/historique", () => {
  it("renvoie l'erreur d'accès (non connecté, option désactivée)", async () => {
    mocks.acces.mockResolvedValue({
      erreur: new Response(null, { status: 404 }),
    });
    expect((await GET(requete("/api/historique"))).status).toBe(404);
  });

  it("refuse des filtres invalides", async () => {
    expect((await GET(requete("/api/historique?tri=injection"))).status).toBe(
      400,
    );
    expect((await GET(requete("/api/historique?taille=1000"))).status).toBe(
      400,
    );
  });

  it("limite un membre simple à ses unités autorisées", async () => {
    mocks.acces.mockResolvedValue(accesMembre);
    mocks.query
      .mockResolvedValueOnce({ rows: [ligneSql()] })
      .mockResolvedValueOnce({
        rows: [{ total: "1", depenses: 20, recettes: 0 }],
      })
      .mockResolvedValueOnce({
        rows: [{ min: "2026-03-10", max: "2026-03-10" }],
      });

    const reponse = await GET(requete("/api/historique"));

    expect(reponse.status).toBe(200);
    const [texte, valeurs] = mocks.query.mock.calls[0];
    expect(texte).toContain("h.unite_id = ANY($2::text[])");
    expect(valeurs[1]).toEqual(["unite-2"]);
    const corps = await reponse.json();
    expect(corps).toMatchObject({
      total: 1,
      responsable: false,
      totaux: { depenses: 20, recettes: 0, solde: -20 },
    });
    expect(corps.lignes[0]).toMatchObject({
      id: "h-1",
      auteurNom: "Camille",
      montantTotal: 20,
    });
  });

  it("combine année comptable, dates et recherche en paramètres liés", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ total: "0", depenses: 0, recettes: 0 }],
      })
      .mockResolvedValueOnce({ rows: [{ min: null, max: null }] });

    await GET(
      requete(
        "/api/historique?anneeComptable=2025&du=2025-12-01&q=100%25&type=recette&tri=montant&sens=asc",
      ),
    );

    const [texte, valeurs] = mocks.query.mock.calls[0];
    expect(texte).toContain("ORDER BY h.montant_total ASC");
    // Intersection : le début de l'année comptable est repoussé par `du`.
    expect(valeurs).toEqual(
      expect.arrayContaining([
        ["recette"],
        "2025-12-01",
        "2026-08-31",
        "%100\\%%",
      ]),
    );
    expect(texte).not.toContain("100");
  });
});

describe("filtres multiples", () => {
  const reponsesVides = () =>
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ total: "0", depenses: 0, recettes: 0 }],
      })
      .mockResolvedValueOnce({ rows: [{ min: null, max: null }] });

  it("filtre sur plusieurs types et plusieurs unités", async () => {
    reponsesVides();

    const reponse = await GET(
      requete("/api/historique?type=recette,depense&unite=unite-1,unite-2"),
    );

    expect(reponse.status).toBe(200);
    const [texte, valeurs] = mocks.query.mock.calls[0];
    expect(texte).toContain("h.type = ANY(");
    expect(texte).toContain("h.unite_id = ANY(");
    expect(valeurs).toEqual(
      expect.arrayContaining([
        ["recette", "depense"],
        ["unite-1", "unite-2"],
      ]),
    );
  });

  it("un paramètre vide signifie aucune valeur retenue", async () => {
    reponsesVides();

    await GET(requete("/api/historique?type=&unite="));

    const [, valeurs] = mocks.query.mock.calls[0];
    expect(valeurs).toEqual(expect.arrayContaining([[], []]));
  });

  it("refuse un type inconnu", async () => {
    expect(
      (await GET(requete("/api/historique?type=recette,piratage"))).status,
    ).toBe(400);
  });
});

describe("GET /api/historique/export", () => {
  it("renvoie un CSV téléchargeable", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [ligneSql()] })
      .mockResolvedValueOnce({
        rows: [{ total: "1", depenses: 20, recettes: 0 }],
      });

    const reponse = await EXPORT(requete("/api/historique/export"));

    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("Content-Type")).toContain("text/csv");
    expect(reponse.headers.get("Content-Disposition")).toContain(
      "historique.csv",
    );
    expect(await reponse.text()).toContain("Courses");
  });
});

describe("/api/historique/[id]", () => {
  it("GET renvoie 404 pour une entrée hors périmètre", async () => {
    mocks.acces.mockResolvedValue(accesMembre);
    const reponse = await GET_ENTREE(
      requete("/api/historique/h-1"),
      contexteId,
    );
    expect(reponse.status).toBe(404);
    expect(mocks.query.mock.calls[0][0]).toContain("h.unite_id = ANY");
  });

  it("GET renvoie l'entrée et les droits de l'appelant (ouverture depuis un e-mail)", async () => {
    mocks.query.mockResolvedValue({ rows: [ligneSql()] });

    const responsable = await (
      await GET_ENTREE(requete("/api/historique/h-1"), contexteId)
    ).json();
    mocks.acces.mockResolvedValue({ ...accesMembre, unitesAutorisees: null });
    const membre = await (
      await GET_ENTREE(requete("/api/historique/h-1"), contexteId)
    ).json();

    expect(responsable).toMatchObject({
      entree: { id: "h-1" },
      responsable: true,
    });
    expect(membre.responsable).toBe(false);
  });

  it("PATCH et DELETE sont réservés aux responsables", async () => {
    mocks.acces.mockResolvedValue(accesMembre);

    expect(
      (
        await PATCH(
          requete("/api/historique/h-1", "PATCH", { description: "x" }),
          contexteId,
        )
      ).status,
    ).toBe(403);
    expect(
      (await DELETE(requete("/api/historique/h-1", "DELETE"), contexteId))
        .status,
    ).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it.each([
    ["corps vide", {}],
    ["référence", { reference: "X" }],
    ["total fourni", { montantTotal: 5 }],
    ["date invalide", { date: "2026-02-31" }],
    ["aucune ligne", { lignes: [] }],
    ["montant nul", { lignes: [{ categorie: "Formation", montant: 0 }] }],
    ["3 décimales", { lignes: [{ categorie: "Formation", montant: 1.234 }] }],
  ])("PATCH refuse un corps invalide (%s)", async (_nom, corps) => {
    const reponse = await PATCH(
      requete("/api/historique/h-1", "PATCH", corps),
      contexteId,
    );
    expect(reponse.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("PATCH refuse une catégorie inconnue ou une unité hors groupe", async () => {
    mocks.query.mockResolvedValue({ rows: [ligneSql()] });

    const categorie = await PATCH(
      requete("/api/historique/h-1", "PATCH", {
        lignes: [{ categorie: "Inconnue", montant: 5 }],
      }),
      contexteId,
    );
    const unite = await PATCH(
      requete("/api/historique/h-1", "PATCH", { uniteId: "autre" }),
      contexteId,
    );

    expect(categorie.status).toBe(400);
    expect(unite.status).toBe(400);
    expect(
      mocks.query.mock.calls.some(([texte]) =>
        String(texte).trim().startsWith("UPDATE"),
      ),
    ).toBe(false);
  });

  it("PATCH recalcule le total depuis les lignes et marque la modification", async () => {
    mocks.query.mockResolvedValue({ rows: [ligneSql()] });

    const reponse = await PATCH(
      requete("/api/historique/h-1", "PATCH", {
        uniteId: "unite-2",
        lignes: [
          { categorie: "Formation", montant: 10.1 },
          { categorie: "Alimentation, Intendance", montant: 0.2 },
        ],
      }),
      contexteId,
    );

    expect(reponse.status).toBe(200);
    const miseAJour = mocks.query.mock.calls.find(([texte]) =>
      String(texte).trim().startsWith("UPDATE"),
    )!;
    expect(miseAJour[0]).not.toContain("reference");
    expect(miseAJour[0]).toContain("modifie_par_user_id");
    // 10.1 + 0.2 arrondi au centime, sans dérive flottante.
    expect(miseAJour[1]).toEqual(
      expect.arrayContaining([
        "unite-2",
        "Éclaireurs",
        10.3,
        "user-1",
        "org-1",
        "h-1",
      ]),
    );
  });

  it("DELETE supprime définitivement l'entrée du groupe", async () => {
    mocks.query.mockResolvedValue({ rowCount: 1, rows: [] });

    const reponse = await DELETE(
      requete("/api/historique/h-1", "DELETE"),
      contexteId,
    );

    expect(reponse.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM scouticket_historique"),
      ["org-1", "h-1"],
    );
  });

  it("DELETE renvoie 404 si l'entrée n'existe pas", async () => {
    mocks.query.mockResolvedValue({ rowCount: 0, rows: [] });
    expect(
      (await DELETE(requete("/api/historique/h-1", "DELETE"), contexteId))
        .status,
    ).toBe(404);
  });
});
