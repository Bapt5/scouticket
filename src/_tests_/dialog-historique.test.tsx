import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DialogHistorique } from "@/components/DialogHistorique";
import type { LigneHistoriqueApi } from "@/lib/historique";

const entree: LigneHistoriqueApi = {
  id: "h-1",
  envoiId: "e-1",
  type: "depense",
  date: "2026-03-10",
  uniteId: "unite-1",
  uniteLabel: "Louveteaux",
  uniteCouleur: "#112233",
  reference: "2026-001",
  modePaiement: "Carte du groupe",
  activite: "",
  description: "Courses du camp",
  montantTotal: 20,
  lignes: [{ categorie: "Formation", montant: 20 }],
  auteurNom: null,
  creeLe: "2026-03-10T10:00:00.000Z",
  modifieLe: null,
  modifieParNom: null,
};

const unites = [{ id: "unite-1", label: "Louveteaux", color: "#112233" }];

const afficher = (responsable: boolean) => {
  const surChangement = vi.fn();
  const surFermeture = vi.fn();
  render(
    <DialogHistorique
      entree={entree}
      responsable={responsable}
      unites={unites}
      moyensPaiement={["Carte du groupe"]}
      onFermer={surFermeture}
      onChange={surChangement}
    />,
  );
  return { surChangement, surFermeture };
};

describe("DialogHistorique", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("affiche le détail par catégorie et un auteur anonymisé", () => {
    afficher(false);

    expect(screen.getByText("Courses du camp")).toBeTruthy();
    expect(screen.getByText("Formation")).toBeTruthy();
    expect(screen.getByText("Ancien membre")).toBeTruthy();
    expect(screen.getByText("2026-001")).toBeTruthy();
  });

  it("est en lecture seule pour un membre simple", () => {
    afficher(false);

    expect(screen.queryByRole("button", { name: "Modifier" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Supprimer" })).toBeNull();
  });

  it("modifie les lignes comptables et envoie le détail au serveur", async () => {
    const utilisateur = userEvent.setup();
    const { surChangement } = afficher(true);

    await utilisateur.click(screen.getByRole("button", { name: "Modifier" }));
    const montant = screen.getByLabelText(/Montant/);
    await utilisateur.clear(montant);
    await utilisateur.type(montant, "25.5");
    await utilisateur.click(
      screen.getByRole("button", { name: "Ajouter une catégorie" }),
    );
    await utilisateur.click(
      screen.getByRole("button", { name: "Enregistrer" }),
    );

    // La deuxième ligne est incomplète : rien n'est envoyé.
    expect(fetchMock).not.toHaveBeenCalled();
    await utilisateur.click(
      screen.getByRole("button", { name: "Supprimer la ligne 2" }),
    );
    await utilisateur.click(
      screen.getByRole("button", { name: "Enregistrer" }),
    );

    await waitFor(() => expect(surChangement).toHaveBeenCalled());
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/historique/h-1");
    expect(options.method).toBe("PATCH");
    const corps = JSON.parse(options.body);
    expect(corps.lignes).toEqual([{ categorie: "Formation", montant: 25.5 }]);
    expect(corps).not.toHaveProperty("reference");
    expect(corps).not.toHaveProperty("montantTotal");
  });

  it("demande une confirmation avant de supprimer", async () => {
    const utilisateur = userEvent.setup();
    const { surChangement } = afficher(true);

    await utilisateur.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(fetchMock).not.toHaveBeenCalled();
    await utilisateur.click(
      screen.getByRole("button", { name: "Supprimer définitivement" }),
    );

    await waitFor(() => expect(surChangement).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/historique/h-1", {
      method: "DELETE",
    });
  });

  it("affiche l'erreur du serveur sans fermer le dialog", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Catégorie comptable invalide" }),
    });
    const utilisateur = userEvent.setup();
    const { surChangement } = afficher(true);

    await utilisateur.click(screen.getByRole("button", { name: "Modifier" }));
    await utilisateur.click(
      screen.getByRole("button", { name: "Enregistrer" }),
    );

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(surChangement).not.toHaveBeenCalled();
  });
});
