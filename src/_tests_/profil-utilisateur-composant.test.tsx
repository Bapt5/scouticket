import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfilUtilisateur from "@/components/ProfilUtilisateur";

const mocks = vi.hoisted(() => ({
  modifierUtilisateur: vi.fn(),
  modifierEmail: vi.fn(),
  modifierMotDePasse: vi.fn(),
  listerComptes: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  clientAuth: {
    useSession: () => ({
      data: { user: { name: "Jean Dupont", email: "jean@example.com" } },
    }),
    updateUser: mocks.modifierUtilisateur,
    changeEmail: mocks.modifierEmail,
    changePassword: mocks.modifierMotDePasse,
    listAccounts: mocks.listerComptes,
  },
}));

describe("ProfilUtilisateur", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.modifierUtilisateur.mockResolvedValue({ error: null });
    mocks.modifierEmail.mockResolvedValue({ error: null });
    mocks.modifierMotDePasse.mockResolvedValue({ error: null });
    mocks.listerComptes.mockResolvedValue({
      data: [{ providerId: "credential" }],
    });
  });

  it("pré-remplit le nom et l'adresse e-mail", async () => {
    render(<ProfilUtilisateur />);
    await screen.findByLabelText("Nom");

    expect((screen.getByLabelText("Nom") as HTMLInputElement).value).toBe(
      "Jean Dupont",
    );
    expect(
      (screen.getByLabelText("Adresse e-mail") as HTMLInputElement).value,
    ).toBe("jean@example.com");
  });

  it("met à jour le nom seul", async () => {
    const utilisateur = userEvent.setup();
    render(<ProfilUtilisateur />);
    await screen.findByLabelText("Nom");

    const champ = screen.getByLabelText("Nom");
    await utilisateur.clear(champ);
    await utilisateur.type(champ, "Jeanne Martin");
    await utilisateur.click(
      screen.getByRole("button", { name: "Enregistrer" }),
    );

    expect(mocks.modifierUtilisateur).toHaveBeenCalledWith({
      name: "Jeanne Martin",
    });
    expect(mocks.modifierEmail).not.toHaveBeenCalled();
    expect(await screen.findByText("Votre nom a été mis à jour.")).toBeTruthy();
  });

  it("demande la confirmation d'un changement d'adresse e-mail", async () => {
    const utilisateur = userEvent.setup();
    render(<ProfilUtilisateur />);
    await screen.findByLabelText("Nom");

    const champ = screen.getByLabelText("Adresse e-mail");
    await utilisateur.clear(champ);
    await utilisateur.type(champ, "nouvelle@example.com");
    await utilisateur.click(
      screen.getByRole("button", { name: "Enregistrer" }),
    );

    expect(mocks.modifierEmail).toHaveBeenCalledWith({
      newEmail: "nouvelle@example.com",
      callbackURL: "/compte",
    });
    expect(mocks.modifierUtilisateur).not.toHaveBeenCalled();
    expect(await screen.findByText(/lien de confirmation/)).toBeTruthy();
  });

  it("n'appelle rien quand aucune information n'a changé", async () => {
    const utilisateur = userEvent.setup();
    render(<ProfilUtilisateur />);
    await screen.findByLabelText("Nom");

    await utilisateur.click(
      screen.getByRole("button", { name: "Enregistrer" }),
    );

    expect(mocks.modifierUtilisateur).not.toHaveBeenCalled();
    expect(mocks.modifierEmail).not.toHaveBeenCalled();
    expect(await screen.findByText(/Aucune modification/)).toBeTruthy();
  });

  it("affiche l'erreur renvoyée lors du changement d'e-mail", async () => {
    mocks.modifierEmail.mockResolvedValue({
      error: { message: "Adresse invalide" },
    });
    const utilisateur = userEvent.setup();
    render(<ProfilUtilisateur />);
    await screen.findByLabelText("Nom");

    const champ = screen.getByLabelText("Adresse e-mail");
    await utilisateur.clear(champ);
    await utilisateur.type(champ, "autre@example.com");
    await utilisateur.click(
      screen.getByRole("button", { name: "Enregistrer" }),
    );

    expect(await screen.findByText("Adresse invalide")).toBeTruthy();
  });

  it("refuse des mots de passe qui ne correspondent pas", async () => {
    const utilisateur = userEvent.setup();
    render(<ProfilUtilisateur />);
    await screen.findByLabelText("Nom");

    await utilisateur.type(
      screen.getByLabelText("Ancien mot de passe"),
      "ancienmotdepasse",
    );
    await utilisateur.type(
      screen.getByLabelText("Nouveau mot de passe"),
      "nouveaumotdepasse",
    );
    await utilisateur.type(
      screen.getByLabelText("Confirmer le nouveau mot de passe"),
      "autremotdepasse",
    );
    await utilisateur.click(
      screen.getByRole("button", { name: "Modifier le mot de passe" }),
    );

    expect(mocks.modifierMotDePasse).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Les mots de passe ne correspondent pas."),
    ).toBeTruthy();
  });

  it("modifie le mot de passe et vide le formulaire", async () => {
    const utilisateur = userEvent.setup();
    render(<ProfilUtilisateur />);
    await screen.findByLabelText("Nom");

    await utilisateur.type(
      screen.getByLabelText("Ancien mot de passe"),
      "ancienmotdepasse",
    );
    await utilisateur.type(
      screen.getByLabelText("Nouveau mot de passe"),
      "nouveaumotdepasse",
    );
    await utilisateur.type(
      screen.getByLabelText("Confirmer le nouveau mot de passe"),
      "nouveaumotdepasse",
    );
    await utilisateur.click(
      screen.getByRole("button", { name: "Modifier le mot de passe" }),
    );

    expect(mocks.modifierMotDePasse).toHaveBeenCalledWith({
      currentPassword: "ancienmotdepasse",
      newPassword: "nouveaumotdepasse",
      revokeOtherSessions: true,
    });
    expect(
      await screen.findByText("Votre mot de passe a été modifié."),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Ancien mot de passe") as HTMLInputElement).value,
    ).toBe("");
  });

  it("affiche l'erreur quand l'ancien mot de passe est incorrect", async () => {
    mocks.modifierMotDePasse.mockResolvedValue({
      error: { message: "Mot de passe incorrect" },
    });
    const utilisateur = userEvent.setup();
    render(<ProfilUtilisateur />);
    await screen.findByLabelText("Nom");

    await utilisateur.type(
      screen.getByLabelText("Ancien mot de passe"),
      "mauvaismotdepasse",
    );
    await utilisateur.type(
      screen.getByLabelText("Nouveau mot de passe"),
      "nouveaumotdepasse",
    );
    await utilisateur.type(
      screen.getByLabelText("Confirmer le nouveau mot de passe"),
      "nouveaumotdepasse",
    );
    await utilisateur.click(
      screen.getByRole("button", { name: "Modifier le mot de passe" }),
    );

    expect(await screen.findByText("Mot de passe incorrect")).toBeTruthy();
  });

  it("n'affiche pas le profil pour un compte Google sans mot de passe", async () => {
    mocks.listerComptes.mockResolvedValue({
      data: [{ providerId: "google" }],
    });
    render(<ProfilUtilisateur />);

    expect(await screen.findByText(/connecté avec Google/)).toBeTruthy();
    expect(screen.queryByLabelText("Nom")).toBeNull();
    expect(screen.queryByLabelText("Ancien mot de passe")).toBeNull();
  });

  it("affiche le profil si le compte a Google et un mot de passe", async () => {
    mocks.listerComptes.mockResolvedValue({
      data: [{ providerId: "google" }, { providerId: "credential" }],
    });
    render(<ProfilUtilisateur />);

    expect(await screen.findByLabelText("Nom")).toBeTruthy();
  });
});
