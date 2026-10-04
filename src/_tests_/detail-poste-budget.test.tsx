import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DetailPosteBudget,
  ECRITURES_AFFICHEES,
} from "@/components/DetailPosteBudget";
import type { SelectionPoste } from "@/lib/budgetPilotage";
import type { LigneHistoriqueApi } from "@/lib/historique";

const reponse = (corps: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(corps) });

const ecriture = (
  surcharge: Partial<LigneHistoriqueApi> = {},
): LigneHistoriqueApi => ({
  id: "h-1",
  envoiId: "e-1",
  type: "depense",
  date: "2026-03-10",
  uniteId: "u1",
  uniteLabel: "Louveteaux",
  uniteCouleur: "#111111",
  posteId: "p-camp",
  posteLabel: "Camp",
  reference: null,
  modePaiement: "Carte du groupe",
  activite: "",
  description: "Courses du camp",
  montantTotal: 45.5,
  lignes: [{ categorie: "Formation", montant: 45.5 }],
  auteurNom: null,
  creeLe: "2026-03-10T10:00:00.000Z",
  modifieLe: null,
  modifieParNom: null,
  ...surcharge,
});

const POSTES = {
  depense: [
    { id: "p-camp", domaine: "depense" as const, label: "Camp" },
    { id: "p-materiel", domaine: "depense" as const, label: "Matériel" },
  ],
  recette: [
    { id: "p-calendrier", domaine: "recette" as const, label: "Calendrier" },
  ],
};

const CAMP: SelectionPoste = {
  id: "p-camp",
  label: "Camp",
  domaine: "depense",
};

describe("DetailPosteBudget", () => {
  const fetchMock = vi.fn();
  const onFermer = vi.fn();
  const onChange = vi.fn();

  const afficher = (poste: SelectionPoste = CAMP) =>
    render(
      <DetailPosteBudget
        poste={poste}
        annee={2025}
        libelleAnnee="2025-2026"
        unites={[{ id: "u1", label: "Louveteaux", color: "#111111" }]}
        postes={POSTES}
        moyensPaiement={["Carte du groupe"]}
        onFermer={onFermer}
        onChange={onChange}
      />,
    );
  const urlsListe = () =>
    fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.startsWith("/api/historique?"));
  const parametres = (indice = 0) =>
    new URL(`https://x.test${urlsListe()[indice]}`).searchParams;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockImplementation((url: string) =>
      reponse(
        url.startsWith("/api/historique?")
          ? { lignes: [ecriture()], total: 1 }
          : {},
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("charge les écritures du poste pour l'année, les plus importantes d'abord", async () => {
    afficher();

    await screen.findByText("Courses du camp");
    expect(urlsListe()).toHaveLength(1);
    const requete = parametres();
    expect(requete.get("poste")).toBe("p-camp");
    expect(requete.get("anneeComptable")).toBe("2025");
    expect(requete.get("type")).toBe("depense,note-de-frais");
    expect(requete.get("tri")).toBe("montant");
    expect(requete.get("sens")).toBe("desc");
    expect(requete.get("taille")).toBe(String(ECRITURES_AFFICHEES));
  });

  it("titre le dialog avec le poste, son domaine et l'année comptable", async () => {
    afficher();

    const dialog = await screen.findByRole("dialog", { name: "Camp" });
    expect(dialog).toHaveTextContent("Dépenses, année comptable 2025-2026");
  });

  it("affiche date, type, unité, description et montant signé de chaque écriture", async () => {
    fetchMock.mockImplementation((url: string) =>
      reponse(
        url.startsWith("/api/historique?")
          ? {
              lignes: [
                ecriture(),
                ecriture({
                  id: "h-2",
                  type: "note-de-frais",
                  date: "2026-04-02",
                  description: "Remboursement du camp",
                  montantTotal: 12,
                }),
              ],
              total: 2,
            }
          : {},
      ),
    );

    afficher();

    await screen.findByText("Courses du camp");
    expect(screen.getByText("10/03/2026")).toBeInTheDocument();
    expect(screen.getByText("Remboursement du camp")).toBeInTheDocument();
    expect(screen.getAllByText("Louveteaux")).toHaveLength(2);
    expect(
      screen.getByRole("row", { name: /Courses du camp/ }),
    ).toHaveTextContent(/- 45,50/);
    expect(screen.getByText(/2 écritures, total 57,50/)).toBeInTheDocument();
  });

  it("affiche les recettes en positif et demande uniquement les recettes", async () => {
    fetchMock.mockImplementation((url: string) =>
      reponse(
        url.startsWith("/api/historique?")
          ? {
              lignes: [ecriture({ type: "recette", montantTotal: 80 })],
              total: 1,
            }
          : {},
      ),
    );

    afficher({
      id: "p-calendrier",
      label: "Calendrier",
      domaine: "recette",
    });

    expect(
      await screen.findByRole("row", { name: /Courses du camp/ }),
    ).toHaveTextContent(/\+ 80,00/);
    expect(parametres().get("type")).toBe("recette");
  });

  it("interroge « non-affecte » pour les écritures sans poste, par domaine", async () => {
    afficher({ id: null, label: "Non affecté", domaine: "recette" });

    await screen.findByText("Courses du camp");
    expect(parametres().get("poste")).toBe("non-affecte");
    expect(parametres().get("type")).toBe("recette");
  });

  it("annonce un poste sans écriture", async () => {
    fetchMock.mockImplementation(() => reponse({ lignes: [], total: 0 }));

    afficher();

    expect(
      await screen.findByText(
        "Aucune écriture pour ce poste sur cette année comptable.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("précise que seules les plus importantes sont listées au-delà de la limite", async () => {
    fetchMock.mockImplementation(() =>
      reponse({ lignes: [ecriture()], total: 250 }),
    );

    afficher();

    expect(
      await screen.findByText(
        "250 écritures : les 100 plus importantes sont affichées.",
      ),
    ).toBeInTheDocument();
  });

  it("affiche l'erreur de chargement", async () => {
    fetchMock.mockImplementation(() => reponse({ error: "x" }, false));

    afficher();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossible de charger les écritures de ce poste.",
    );
  });

  it("ferme avec le bouton, ou en cliquant en dehors, mais pas dans le contenu", async () => {
    const utilisateur = userEvent.setup();
    afficher();
    await screen.findByText("Courses du camp");

    await utilisateur.click(screen.getByRole("heading", { name: "Camp" }));
    expect(onFermer).not.toHaveBeenCalled();
    await utilisateur.click(screen.getByRole("button", { name: "Fermer" }));
    expect(onFermer).toHaveBeenCalledTimes(1);
    await utilisateur.click(screen.getByRole("dialog", { name: "Camp" }));
    expect(onFermer).toHaveBeenCalledTimes(2);
  });

  it("rend chaque ligne cliquable (souris et clavier) plutôt que d'y mettre un lien", async () => {
    const utilisateur = userEvent.setup();
    afficher();

    const ligne = await screen.findByRole("row", { name: /Courses du camp/ });
    expect(ligne).toHaveAttribute("tabindex", "0");
    expect(within(ligne).queryByRole("button")).not.toBeInTheDocument();
    expect(within(ligne).queryByRole("link")).not.toBeInTheDocument();

    await utilisateur.click(ligne);
    expect(
      await screen.findByRole("dialog", { name: /Dépense du 10\/03\/2026/ }),
    ).toBeInTheDocument();
  });

  it("ouvre l'écriture au clavier avec Entrée ou Espace", async () => {
    const utilisateur = userEvent.setup();
    afficher();

    const ligne = await screen.findByRole("row", { name: /Courses du camp/ });
    ligne.focus();
    await utilisateur.keyboard("{Enter}");

    expect(
      await screen.findByRole("dialog", { name: /Dépense du 10\/03\/2026/ }),
    ).toBeInTheDocument();
    await utilisateur.click(
      within(
        screen.getByRole("dialog", { name: /Dépense du 10\/03\/2026/ }),
      ).getByRole("button", { name: "Fermer" }),
    );
    ligne.focus();
    await utilisateur.keyboard(" ");
    expect(
      await screen.findByRole("dialog", { name: /Dépense du 10\/03\/2026/ }),
    ).toBeInTheDocument();
  });

  it("ouvre une écriture, la reclasse dans un autre poste et recharge la liste", async () => {
    const utilisateur = userEvent.setup();
    afficher();

    await utilisateur.click(
      await screen.findByRole("row", { name: /Courses du camp/ }),
    );
    expect(
      await screen.findByRole("dialog", { name: /Dépense du 10\/03\/2026/ }),
    ).toBeInTheDocument();
    await utilisateur.click(screen.getByRole("button", { name: "Modifier" }));
    await utilisateur.selectOptions(
      screen.getByLabelText("Poste budgétaire"),
      "p-materiel",
    );
    await utilisateur.click(
      screen.getByRole("button", { name: "Enregistrer" }),
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    const patch = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "PATCH",
    )!;
    expect(patch[0]).toBe("/api/historique/h-1");
    expect(JSON.parse(patch[1].body).posteBudgetaireId).toBe("p-materiel");
    // Le dialog d'écriture se ferme et la liste du poste est rechargée.
    await waitFor(() => expect(urlsListe()).toHaveLength(2));
    expect(
      screen.queryByRole("dialog", { name: /Dépense du 10\/03\/2026/ }),
    ).not.toBeInTheDocument();
  });

  it("ne recharge rien quand on referme l'écriture sans la modifier", async () => {
    const utilisateur = userEvent.setup();
    afficher();

    await utilisateur.click(
      await screen.findByRole("row", { name: /Courses du camp/ }),
    );
    await screen.findByRole("dialog", { name: /Dépense du 10\/03\/2026/ });
    await utilisateur.click(
      within(
        screen.getByRole("dialog", { name: /Dépense du 10\/03\/2026/ }),
      ).getByRole("button", { name: "Fermer" }),
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(urlsListe()).toHaveLength(1);
  });
});
