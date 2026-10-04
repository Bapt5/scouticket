import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PageSuiviBudgetaire from "../app/(main)/suivi-budgetaire/page";

vi.mock("@/lib/auth-client", () => ({
  clientAuth: {
    useActiveOrganization: () => ({
      data: { id: "org_1", name: "Groupe test" },
    }),
  },
}));
// Recharts mesure le DOM : le rendu des graphiques est testé à part.
vi.mock("@/components/GraphiquesBudget", () => ({
  GraphiquesBudget: ({ lignes }: { lignes: { label: string }[] }) => (
    <div data-testid="graphiques">
      {lignes.map((ligne) => ligne.label).join(",")}
    </div>
  ),
}));

const reponse = (corps: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(corps) });

const configAdmin = (surcharges: Record<string, unknown> = {}) => ({
  isAdmin: true,
  nomenclature: { anneeComptable: { mois: 9, jour: 1, format: "debut-fin" } },
  parametres: {
    historiqueActif: true,
    budgetActif: true,
    anneeComptableDebut: { mois: 9, jour: 1 },
  },
  ...surcharges,
});

const POSTES = [
  { id: "p1", domaine: "depense", label: "Camp" },
  { id: "p2", domaine: "depense", label: "Matériel" },
  { id: "p3", domaine: "recette", label: "Calendrier" },
];

const suivi = (surcharges: Record<string, unknown> = {}) => ({
  anneeDebut: 2025,
  du: "2025-09-01",
  au: "2026-08-31",
  debut: { mois: 9, jour: 1 },
  postes: POSTES,
  depense: [
    { id: "p1", label: "Camp", budget: 1000, realise: 400 },
    { id: "p2", label: "Matériel", budget: 200, realise: 250 },
    { id: null, label: "Non affecté", budget: null, realise: 35 },
  ],
  recette: [{ id: "p3", label: "Calendrier", budget: 300, realise: 150 }],
  ...surcharges,
});

describe("Page Suivi budgétaire", () => {
  const fetchMock = vi.fn();

  const brancher = (
    config: unknown = configAdmin(),
    donnees: unknown = suivi(),
  ) =>
    fetchMock.mockImplementation(
      (url: string, options?: { method?: string }) => {
        if (url === "/api/group/config") return reponse(config);
        if (options?.method === "PUT") return reponse({ success: true });
        return reponse(donnees);
      },
    );
  const appelsBudget = () =>
    fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.startsWith("/api/budget?"));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 2, 15, 12));
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("refuse l'accès à un membre simple", async () => {
    brancher({ isAdmin: false });

    render(<PageSuiviBudgetaire />);

    expect(
      await screen.findByText("Accès réservé aux responsables du groupe."),
    ).toBeInTheDocument();
    expect(appelsBudget()).toHaveLength(0);
  });

  it("explique que le suivi n'est pas activé et renvoie vers les paramètres", async () => {
    brancher(
      configAdmin({
        parametres: {
          historiqueActif: true,
          budgetActif: false,
          anneeComptableDebut: { mois: 9, jour: 1 },
        },
      }),
    );

    render(<PageSuiviBudgetaire />);

    expect(
      await screen.findByText(/Le suivi budgétaire n’est pas activé/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "paramètres du groupe" }),
    ).toHaveAttribute("href", "/parametres-groupe");
    expect(appelsBudget()).toHaveLength(0);
  });

  it("charge l'année comptable courante et affiche budget, réalisé, solde et total des dépenses", async () => {
    brancher();

    render(<PageSuiviBudgetaire />);

    // 15 mars 2026 avec un début au 1er septembre : exercice 2025-2026.
    expect(await screen.findByText("Camp")).toBeInTheDocument();
    expect(appelsBudget()).toEqual(["/api/budget?anneeComptable=2025"]);
    expect(screen.getByLabelText(/Année comptable/)).toHaveValue("2025");
    expect(screen.getByLabelText("Budget prévu pour Camp")).toHaveValue("1000");
    const camp = screen.getByRole("row", { name: /Camp/ });
    expect(camp).toHaveTextContent("400,00");
    expect(camp).toHaveTextContent("600,00");
    expect(camp).toHaveTextContent("40 %");
    const total = screen.getByRole("row", { name: /Total/ });
    expect(total).toHaveTextContent("1 200,00");
    expect(total).toHaveTextContent("685,00");
    expect(total).toHaveTextContent("515,00");
  });

  it("alerte quand le réalisé dépasse le budget d'une dépense", async () => {
    brancher();

    render(<PageSuiviBudgetaire />);

    const materiel = await screen.findByRole("row", { name: /Matériel/ });
    expect(materiel).toHaveTextContent("125 % : budget dépassé");
    expect(materiel).toHaveTextContent("-50,00");
    expect(screen.getByRole("row", { name: /Camp/ })).not.toHaveTextContent(
      "dépassé",
    );
  });

  it("n'attribue pas de budget à la ligne « Non affecté »", async () => {
    brancher();

    render(<PageSuiviBudgetaire />);

    const ligne = await screen.findByRole("row", { name: /Non affecté/ });
    expect(within(ligne).queryByRole("textbox")).not.toBeInTheDocument();
    expect(ligne).toHaveTextContent("35,00");
  });

  it("passe aux recettes avec « objectif dépassé » et un écart positif", async () => {
    brancher(
      configAdmin(),
      suivi({
        recette: [{ id: "p3", label: "Calendrier", budget: 100, realise: 150 }],
      }),
    );
    const utilisateur = userEvent.setup();

    render(<PageSuiviBudgetaire />);
    await utilisateur.click(
      await screen.findByRole("tab", { name: "Recettes" }),
    );

    const ligne = screen.getByRole("row", { name: /Calendrier/ });
    expect(ligne).toHaveTextContent("150 % : objectif dépassé");
    expect(ligne).toHaveTextContent("50,00");
    expect(screen.queryByText("Camp")).not.toBeInTheDocument();
  });

  it("recharge le suivi quand on change d'année comptable", async () => {
    brancher();
    const utilisateur = userEvent.setup();

    render(<PageSuiviBudgetaire />);
    await utilisateur.selectOptions(
      await screen.findByLabelText(/Année comptable/),
      "2024",
    );

    await waitFor(() =>
      expect(appelsBudget()).toContain("/api/budget?anneeComptable=2024"),
    );
  });

  it("enregistre les budgets saisis (un champ vidé supprime le budget)", async () => {
    brancher();
    const utilisateur = userEvent.setup();

    render(<PageSuiviBudgetaire />);
    const bouton = await screen.findByRole("button", {
      name: "Enregistrer les budgets",
    });
    expect(bouton).toBeDisabled();
    const camp = await screen.findByLabelText("Budget prévu pour Camp");
    await utilisateur.clear(camp);
    await utilisateur.type(camp, "1500,5");
    await utilisateur.clear(
      screen.getByLabelText("Budget prévu pour Matériel"),
    );
    expect(bouton).toBeEnabled();
    await utilisateur.click(bouton);

    expect(await screen.findByText("Budgets enregistrés.")).toBeVisible();
    const appel = fetchMock.mock.calls.find(
      ([url, options]) =>
        url === "/api/budget/montants" && options?.method === "PUT",
    )!;
    const corps = JSON.parse(appel[1].body);
    expect(corps.anneeComptable).toBe(2025);
    expect(corps.budgets).toEqual(
      expect.arrayContaining([
        { posteId: "p1", montant: 1500.5 },
        { posteId: "p2", montant: null },
      ]),
    );
  });

  it("refuse un montant négatif ou illisible", async () => {
    brancher();
    const utilisateur = userEvent.setup();

    render(<PageSuiviBudgetaire />);
    const camp = await screen.findByLabelText("Budget prévu pour Camp");
    await utilisateur.clear(camp);
    await utilisateur.type(camp, "-5");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Saisissez des montants positifs.",
    );
    expect(
      screen.getByRole("button", { name: "Enregistrer les budgets" }),
    ).toBeDisabled();
  });

  it("répercute le budget saisi dans le tableau avant l'enregistrement", async () => {
    brancher();
    const utilisateur = userEvent.setup();

    render(<PageSuiviBudgetaire />);
    const camp = await screen.findByLabelText("Budget prévu pour Camp");
    await utilisateur.clear(camp);
    await utilisateur.type(camp, "500");

    expect(screen.getByRole("row", { name: /Camp/ })).toHaveTextContent("80 %");
  });

  it("propose l'export CSV de l'année affichée", async () => {
    brancher();

    render(<PageSuiviBudgetaire />);

    expect(
      await screen.findByRole("link", { name: "Exporter en CSV" }),
    ).toHaveAttribute("href", "/api/budget/export?anneeComptable=2025");
  });

  it("affiche l'erreur de chargement", async () => {
    fetchMock.mockImplementation((url: string) =>
      url === "/api/group/config"
        ? reponse(configAdmin())
        : reponse({ error: "x" }, false),
    );

    render(<PageSuiviBudgetaire />);

    expect(
      await screen.findByText("Impossible de charger le suivi budgétaire."),
    ).toBeInTheDocument();
  });

  describe("gestion des postes", () => {
    it("ajoute, renomme et enregistre les postes (liste complète, ids conservés)", async () => {
      brancher();
      const utilisateur = userEvent.setup();

      render(<PageSuiviBudgetaire />);
      await utilisateur.click(
        await screen.findByRole("button", { name: "Gérer les postes" }),
      );
      const nom = screen.getAllByLabelText("Nom du poste 1")[0];
      await utilisateur.clear(nom);
      await utilisateur.type(nom, "Camp d'été");
      await utilisateur.click(
        screen.getAllByRole("button", { name: "Ajouter un poste" })[0],
      );
      await utilisateur.type(
        screen.getByLabelText("Nom du poste 3"),
        "Formation",
      );
      await utilisateur.click(
        screen.getByRole("button", { name: "Enregistrer les postes" }),
      );

      expect(await screen.findByText("Postes enregistrés.")).toBeVisible();
      const appel = fetchMock.mock.calls.find(
        ([url, options]) =>
          url === "/api/budget/postes" && options?.method === "PUT",
      )!;
      const { postes } = JSON.parse(appel[1].body);
      expect(postes).toHaveLength(4);
      expect(postes).toEqual(
        expect.arrayContaining([
          { id: "p1", domaine: "depense", label: "Camp d'été" },
          { id: null, domaine: "depense", label: "Formation" },
          { id: "p3", domaine: "recette", label: "Calendrier" },
        ]),
      );
    });

    it("empêche d'enregistrer un nom vide ou en double", async () => {
      brancher();
      const utilisateur = userEvent.setup();

      render(<PageSuiviBudgetaire />);
      await utilisateur.click(
        await screen.findByRole("button", { name: "Gérer les postes" }),
      );
      await utilisateur.click(
        screen.getAllByRole("button", { name: "Ajouter un poste" })[0],
      );

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Chaque poste doit avoir un nom unique",
      );
      expect(
        screen.getByRole("button", { name: "Enregistrer les postes" }),
      ).toBeDisabled();
    });

    it("avertit que supprimer un poste conserve ses écritures", async () => {
      brancher();
      const utilisateur = userEvent.setup();

      render(<PageSuiviBudgetaire />);
      await utilisateur.click(
        await screen.findByRole("button", { name: "Gérer les postes" }),
      );

      expect(
        screen.getByText(/passent en « Non affecté »/),
      ).toBeInTheDocument();
    });
  });
});
