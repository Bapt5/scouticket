import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SuppressionCompte from "@/components/SuppressionCompte";

const mocks = vi.hoisted(() => ({
  listerGroupes: vi.fn(),
  supprimerUtilisateur: vi.fn(),
  remplacer: vi.fn(),
  deconnecter: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.remplacer }),
}));

vi.mock("@/lib/auth-client", () => ({
  clientAuth: {
    organization: { list: mocks.listerGroupes },
    deleteUser: mocks.supprimerUtilisateur,
    signOut: mocks.deconnecter,
  },
}));

describe("SuppressionCompte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listerGroupes.mockResolvedValue({ data: [] });
    mocks.supprimerUtilisateur.mockResolvedValue({ error: null });
  });

  it("désactive la suppression tant qu'il reste des groupes", async () => {
    mocks.listerGroupes.mockResolvedValue({
      data: [{ id: "org_1", name: "Groupe Test" }],
    });

    render(<SuppressionCompte />);

    expect(await screen.findByText(/Groupe Test/)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Supprimer mon compte",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("exige la saisie exacte de SUPPRIMER avant de valider", async () => {
    const utilisateur = userEvent.setup();
    render(<SuppressionCompte />);

    const declencheur = await screen.findByRole("button", {
      name: "Supprimer mon compte",
    });
    await vi.waitFor(() =>
      expect((declencheur as HTMLButtonElement).disabled).toBe(false),
    );
    await utilisateur.click(declencheur);

    const confirmer = screen.getByRole("button", {
      name: "Supprimer définitivement",
    }) as HTMLButtonElement;
    const champ = screen.getByLabelText(/Saisissez SUPPRIMER/);

    await utilisateur.type(champ, "supprimer");
    expect(confirmer.disabled).toBe(true);

    await utilisateur.clear(champ);
    await utilisateur.type(champ, "SUPPRIMER");
    expect(confirmer.disabled).toBe(false);

    await utilisateur.click(confirmer);
    expect(mocks.supprimerUtilisateur).toHaveBeenCalledWith({});
    expect(mocks.remplacer).toHaveBeenCalledWith("/sign-in");
  });

  it("affiche l'erreur renvoyée par le serveur", async () => {
    mocks.supprimerUtilisateur.mockResolvedValue({
      error: { message: "Quittez d’abord tous vos groupes." },
    });
    const utilisateur = userEvent.setup();
    render(<SuppressionCompte />);

    const declencheur = await screen.findByRole("button", {
      name: "Supprimer mon compte",
    });
    await vi.waitFor(() =>
      expect((declencheur as HTMLButtonElement).disabled).toBe(false),
    );
    await utilisateur.click(declencheur);
    await utilisateur.type(
      screen.getByLabelText(/Saisissez SUPPRIMER/),
      "SUPPRIMER",
    );
    await utilisateur.click(
      screen.getByRole("button", { name: "Supprimer définitivement" }),
    );

    expect(await screen.findByText(/Quittez d’abord/)).toBeTruthy();
  });

  it("propose de se reconnecter quand la session est expirée", async () => {
    mocks.supprimerUtilisateur.mockResolvedValue({
      error: { code: "SESSION_EXPIRED", message: "Session expirée." },
    });
    mocks.deconnecter.mockResolvedValue({});
    const utilisateur = userEvent.setup();
    render(<SuppressionCompte />);

    const declencheur = await screen.findByRole("button", {
      name: "Supprimer mon compte",
    });
    await vi.waitFor(() =>
      expect((declencheur as HTMLButtonElement).disabled).toBe(false),
    );
    await utilisateur.click(declencheur);
    await utilisateur.type(
      screen.getByLabelText(/Saisissez SUPPRIMER/),
      "SUPPRIMER",
    );
    await utilisateur.click(
      screen.getByRole("button", { name: "Supprimer définitivement" }),
    );
    await utilisateur.click(
      await screen.findByRole("button", { name: "Se reconnecter" }),
    );

    expect(mocks.deconnecter).toHaveBeenCalled();
    expect(mocks.remplacer).toHaveBeenCalledWith(
      "/sign-in?callbackURL=%2Fcompte",
    );
  });
});
