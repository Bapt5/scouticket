import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FormulaireConnexionEmail } from "@/components/FormulairesAuthentification";

const mocks = vi.hoisted(() => ({
  connecterEmail: vi.fn(),
  inscrireEmail: vi.fn(),
  envoyerVerification: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(
      "?callbackURL=%2Finvitation%3Fid%3Dinvitation-test&invitation=1",
    ),
}));

vi.mock("@/lib/auth-client", () => ({
  clientAuth: {
    signIn: { email: mocks.connecterEmail },
    signUp: { email: mocks.inscrireEmail },
    sendVerificationEmail: mocks.envoyerVerification,
  },
}));

function reponseJson(corps: unknown, ok = true) {
  return { ok, json: async () => corps } as Response;
}

describe("Inscription par invitation", () => {
  beforeEach(() => {
    mocks.connecterEmail.mockReset();
    mocks.inscrireEmail.mockReset();
    mocks.envoyerVerification.mockReset();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("préremplit et verrouille l’adresse e-mail invitée", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.startsWith("/api/invitation/email"))
          return Promise.resolve(reponseJson({ email: "invite@example.test" }));
        return Promise.resolve(reponseJson({ success: true }));
      }),
    );
    render(<FormulaireConnexionEmail />);

    const champEmail = (await screen.findByLabelText(
      "Adresse e-mail",
    )) as HTMLInputElement;
    await waitFor(() => expect(champEmail.value).toBe("invite@example.test"));
    expect(champEmail).toHaveAttribute("readonly");
  });

  it("appelle l’inscription par invitation plutôt que l’inscription classique", async () => {
    const requetesFetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("/api/invitation/email"))
        return Promise.resolve(reponseJson({ email: "invite@example.test" }));
      if (url.startsWith("/api/invitation/inscription"))
        return Promise.resolve(reponseJson({ success: true }));
      return Promise.resolve(reponseJson({}));
    });
    vi.stubGlobal("fetch", requetesFetch);
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign },
      writable: true,
    });
    const utilisateur = userEvent.setup();
    render(<FormulaireConnexionEmail />);

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Adresse e-mail") as HTMLInputElement).value,
      ).toBe("invite@example.test"),
    );
    await utilisateur.type(
      screen.getByLabelText("Mot de passe"),
      "motdepasse-test",
    );
    await utilisateur.click(screen.getByRole("button", { name: "S’inscrire" }));

    await waitFor(() => {
      expect(requetesFetch).toHaveBeenCalledWith(
        "/api/invitation/inscription",
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(mocks.inscrireEmail).not.toHaveBeenCalled();
  });

  it("affiche l’erreur de compte existant sans proposer d’alternative de repli", async () => {
    const requetesFetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("/api/invitation/email"))
        return Promise.resolve(reponseJson({ email: "invite@example.test" }));
      if (url.startsWith("/api/invitation/inscription"))
        return Promise.resolve(
          reponseJson(
            {
              error:
                "Un compte existe déjà avec cette adresse. Connectez-vous plutôt avec ce compte pour rejoindre ce groupe.",
              code: "COMPTE_EXISTANT",
            },
            false,
          ),
        );
      return Promise.resolve(reponseJson({}));
    });
    vi.stubGlobal("fetch", requetesFetch);
    const utilisateur = userEvent.setup();
    render(<FormulaireConnexionEmail />);

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Adresse e-mail") as HTMLInputElement).value,
      ).toBe("invite@example.test"),
    );
    await utilisateur.type(
      screen.getByLabelText("Mot de passe"),
      "motdepasse-test",
    );
    await utilisateur.click(screen.getByRole("button", { name: "S’inscrire" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Un compte existe déjà avec cette adresse.",
    );
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeEnabled();
  });
});
