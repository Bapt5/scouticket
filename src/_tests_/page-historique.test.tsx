import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PageHistorique from "../app/(main)/historique/page";

vi.mock("@/lib/auth-client", () => ({
  clientAuth: {
    useActiveOrganization: () => ({
      data: { id: "org_1", name: "Groupe test" },
    }),
  },
}));

const CLE = "scouticket:historique:anneeComptable:org_1";

const reponse = (corps: unknown) =>
  Promise.resolve({ ok: true, json: () => Promise.resolve(corps) });

const config = {
  units: [{ id: "u1", label: "Louveteaux", color: "#111111" }],
  nomenclature: { anneeComptable: { mois: 9, jour: 1, format: "debut-fin" } },
  parametres: { historiqueActif: true, moyensPaiement: [] },
};

const historique = {
  lignes: [],
  total: 0,
  totaux: { depenses: 0, recettes: 0, solde: 0 },
  responsable: true,
  plageDates: { min: "2024-10-01", max: "2025-11-01" },
};

describe("Page Historique : année comptable mémorisée", () => {
  const fetchMock = vi.fn();

  const dernierAppel = () => appelsHistorique().slice(-1)[0];

  const appelsHistorique = () =>
    fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.startsWith("/api/historique?"));

  beforeEach(() => {
    // Stockage en mémoire : le localStorage de l'environnement de test est incomplet.
    const donnees = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (cle: string) => donnees.get(cle) ?? null,
      setItem: (cle: string, valeur: string) => donnees.set(cle, valeur),
      removeItem: (cle: string) => donnees.delete(cle),
      clear: () => donnees.clear(),
    });
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) =>
      url === "/api/group/config" ? reponse(config) : reponse(historique),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  it("restaure la dernière année dès la première requête, même sans entrée dans cette année", async () => {
    localStorage.setItem(CLE, "2022");

    render(<PageHistorique />);

    await waitFor(() => expect(appelsHistorique().length).toBeGreaterThan(0));
    // Jamais de requête « Toutes » avant la restauration.
    expect(
      appelsHistorique().every((url) => url.includes("anneeComptable=2022")),
    ).toBe(true);
    const selecteur = (await screen.findByLabelText(
      "Année comptable",
    )) as HTMLSelectElement;
    expect(selecteur.value).toBe("2022");
  });

  it("sans année mémorisée, ne filtre pas", async () => {
    render(<PageHistorique />);

    await waitFor(() => expect(appelsHistorique().length).toBeGreaterThan(0));
    expect(
      appelsHistorique().some((url) => url.includes("anneeComptable")),
    ).toBe(false);
  });

  it("ignore une valeur mémorisée invalide", async () => {
    localStorage.setItem(CLE, "n'importe quoi");

    render(<PageHistorique />);

    await waitFor(() => expect(appelsHistorique().length).toBeGreaterThan(0));
    expect(
      appelsHistorique().some((url) => url.includes("anneeComptable")),
    ).toBe(false);
  });

  it("mémorise l'année choisie, « Toutes » l'efface, « Réinitialiser » la conserve", async () => {
    render(<PageHistorique />);
    const selecteur = await screen.findByLabelText("Année comptable");
    await waitFor(() =>
      expect(
        (selecteur as HTMLSelectElement).querySelectorAll("option").length,
      ).toBeGreaterThan(1),
    );

    await userEvent.selectOptions(selecteur, "2024");
    expect(localStorage.getItem(CLE)).toBe("2024");
    await waitFor(() =>
      expect(
        appelsHistorique().some((url) => url.includes("anneeComptable=2024")),
      ).toBe(true),
    );

    await userEvent.selectOptions(selecteur, "");
    expect(localStorage.getItem(CLE)).toBe("");

    await userEvent.selectOptions(selecteur, "2025");
    await userEvent.type(
      screen.getByLabelText("Rechercher dans l’historique"),
      "camp",
    );
    await waitFor(() => expect(dernierAppel()).toContain("q=camp"));

    await userEvent.click(
      screen.getByRole("button", { name: /^R.initialiser$/ }),
    );

    // Les autres filtres sont réinitialisés, pas l'année comptable.
    await waitFor(() => expect(dernierAppel()).not.toContain("q=camp"));
    expect(dernierAppel()).toContain("anneeComptable=2025");
    expect((selecteur as HTMLSelectElement).value).toBe("2025");
    expect(localStorage.getItem(CLE)).toBe("2025");
  });

  describe("ouverture depuis un lien d'e-mail", () => {
    const entree = {
      id: "h-1",
      envoiId: "e-1",
      type: "depense",
      date: "2026-03-10",
      uniteId: "u1",
      uniteLabel: "Louveteaux",
      uniteCouleur: "#111111",
      reference: "2026-001",
      modePaiement: "Carte du groupe",
      activite: "",
      description: "Courses du camp",
      montantTotal: 20,
      lignes: [{ categorie: "Formation", montant: 20 }],
      auteurNom: "Camille",
      creeLe: "2026-03-10T10:00:00.000Z",
      modifieLe: null,
      modifieParNom: null,
    };

    const ouvrirAvec = (recherche: string) =>
      window.history.replaceState(null, "", `/historique${recherche}`);

    afterEach(() => ouvrirAvec(""));

    it("ouvre le dialog de l'entrée, avec les droits renvoyés, et nettoie l'URL", async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url === "/api/group/config") return reponse(config);
        if (url === "/api/historique/h-1")
          return reponse({ entree, responsable: true });
        return reponse(historique);
      });
      ouvrirAvec("?entree=h-1");

      render(<PageHistorique />);

      const dialog = await screen.findByRole("dialog");
      expect(dialog).toHaveTextContent("Courses du camp");
      // Droits connus avant la fin du chargement de la liste.
      expect(
        await screen.findByRole("button", { name: "Modifier" }),
      ).toBeVisible();
      expect(window.location.search).toBe("");
    });

    it("avertit si l'entrée est introuvable ou hors des droits", async () => {
      fetchMock.mockImplementation((url: string) => {
        if (url === "/api/group/config") return reponse(config);
        if (url.startsWith("/api/historique/"))
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({}),
          });
        return reponse(historique);
      });
      ouvrirAvec("?entree=inconnue");

      render(<PageHistorique />);

      expect(
        await screen.findByText(/n’existe plus ou n’est pas accessible/),
      ).toBeVisible();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("n'appelle pas l'entrée sans paramètre", async () => {
      render(<PageHistorique />);

      await waitFor(() => expect(appelsHistorique().length).toBeGreaterThan(0));
      expect(
        fetchMock.mock.calls.some(([url]) =>
          String(url).startsWith("/api/historique/"),
        ),
      ).toBe(false);
    });
  });
});
