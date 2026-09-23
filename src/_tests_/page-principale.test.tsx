import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../app/(main)/page";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  organisation: vi.fn(),
  organisations: vi.fn(),
  listerInvitations: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  clientAuth: {
    useSession: () => ({ data: mocks.session(), isPending: false }),
    useActiveOrganization: () => ({ data: mocks.organisation() }),
    useListOrganizations: () => ({ data: mocks.organisations() }),
    organization: {
      setActive: vi.fn(),
      create: vi.fn(),
      listUserInvitations: mocks.listerInvitations,
    },
    signOut: vi.fn(),
  },
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

vi.mock("@/components/FeatureNotice", () => ({
  AvertissementNouveaute: () => <div>Information fonctionnalite</div>,
}));

vi.mock("@/components/PhotoCapture", () => ({
  CapturePhoto: () => <div>Ajout piece jointe</div>,
}));

vi.mock("@/components/FormulaireDepense", () => ({
  FormulaireDepense: ({ emailUtilisateur }: { emailUtilisateur: string }) => (
    <form aria-label="Formulaire depense">{emailUtilisateur}</form>
  ),
}));

vi.mock("@/components/InstallPrompt", () => ({
  InviteInstallation: () => null,
}));

vi.mock("@/lib/useOnlineStatus", () => ({
  useStatutEnLigne: () => true,
}));

describe("Page principale", () => {
  beforeEach(() => {
    mocks.session.mockReturnValue({
      user: {
        id: "user_test",
        email: "test@example.test",
        emailVerified: true,
      },
    });
    mocks.organisation.mockReturnValue({ id: "org_test", name: "Test" });
    mocks.organisations.mockReturnValue([]);
    mocks.listerInvitations.mockReset();
    mocks.listerInvitations.mockResolvedValue({ data: [], error: null });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            units: [{ id: "groupe", label: "Groupe", color: "#1E3A8A" }],
            configured: true,
            treasuryVerified: true,
            isAdmin: true,
          }),
      }),
    );
  });

  it("affiche les actions d'administration pour un responsable", async () => {
    render(<Home />);

    expect(
      await screen.findByRole("heading", {
        name: "Scouticket",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByLabelText("Formulaire depense"),
    ).toHaveTextContent("test@example.test");
    await userEvent.click(
      screen.getByRole("button", { name: "Administration" }),
    );
    expect(
      screen.getByRole("link", { name: "Gérer les membres" }),
    ).toHaveAttribute("href", "/gestion-membres");
  });

  it("masque les actions d'administration pour un membre", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            units: [{ id: "groupe", label: "Groupe", color: "#1E3A8A" }],
            configured: true,
            treasuryVerified: true,
            isAdmin: false,
          }),
      }),
    );

    render(<Home />);

    await screen.findByLabelText("Formulaire depense");
    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
  });

  it("montre les invitations sur l’écran Bienvenue sans les confondre avec les groupes rejoints", async () => {
    mocks.organisation.mockReturnValue(null);
    mocks.listerInvitations.mockResolvedValue({
      data: [
        {
          id: "invit_1",
          organizationName: "Groupe des Éclaireurs",
          status: "pending",
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
      error: null,
    });

    render(<Home />);

    expect(
      await screen.findByRole("heading", { name: "Bienvenue" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Groupe des Éclaireurs"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voir l’invitation" }),
    ).toHaveAttribute("href", "/invitation?id=invit_1");
    expect(
      screen.queryByRole("button", { name: "Groupe des Éclaireurs" }),
    ).not.toBeInTheDocument();
  });

  it("affiche le groupe établi avant la réponse de recherche d’invitations", async () => {
    mocks.listerInvitations.mockReturnValue(new Promise(() => {}));

    render(<Home />);

    expect(
      await screen.findByLabelText("Formulaire depense"),
    ).toBeInTheDocument();
    expect(mocks.listerInvitations).toHaveBeenCalledOnce();
  });

  it("masque les invitations expirées et affiche les autres dans un groupe actif", async () => {
    mocks.listerInvitations.mockResolvedValue({
      data: [
        {
          id: "expiree",
          organizationName: "Ancien groupe",
          status: "pending",
          expiresAt: new Date(Date.now() - 60_000),
        },
        {
          id: "valide",
          organizationName: "Nouveau groupe",
          status: "pending",
          expiresAt: new Date(Date.now() + 60_000),
        },
      ],
      error: null,
    });

    render(<Home />);

    expect(await screen.findByText("Nouveau groupe")).toBeInTheDocument();
    expect(screen.queryByText("Ancien groupe")).not.toBeInTheDocument();
  });

  describe("Quitter un groupe", () => {
    beforeEach(() => {
      mocks.organisation.mockReturnValue(null);
      mocks.organisations.mockReturnValue([
        { id: "org_1", name: "Groupe des Éclaireurs" },
      ]);
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
          if (url === "/api/user/default-group")
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ organizationId: null }),
            });
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }),
      );
    });

    it("affiche une confirmation avant de quitter un groupe", async () => {
      render(<Home />);

      await userEvent.click(
        await screen.findByRole("button", { name: "Quitter" }),
      );

      expect(
        screen.getByText("Quitter le groupe « Groupe des Éclaireurs » ?"),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Annuler" }));

      expect(
        screen.queryByText("Quitter le groupe « Groupe des Éclaireurs » ?"),
      ).not.toBeInTheDocument();
    });

    it("retire le groupe de la liste après confirmation", async () => {
      const fetchMock = vi.fn((url: string) => {
        if (url === "/api/group/leave")
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          });
        if (url === "/api/user/default-group")
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ organizationId: null }),
          });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<Home />);

      await userEvent.click(
        await screen.findByRole("button", { name: "Quitter" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Confirmer" }));

      await screen.findByRole("heading", { name: "Bienvenue" });
      expect(
        screen.queryByText("Groupe des Éclaireurs"),
      ).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/group/leave",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ organizationId: "org_1" }),
        }),
      );
    });

    it("affiche l’erreur renvoyée par l’API sans fermer la confirmation", async () => {
      const fetchMock = vi.fn((url: string) => {
        if (url === "/api/group/leave")
          return Promise.resolve({
            ok: false,
            json: () =>
              Promise.resolve({
                error:
                  "Impossible de quitter le groupe : vous êtes le seul responsable.",
              }),
          });
        if (url === "/api/user/default-group")
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ organizationId: null }),
          });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<Home />);

      await userEvent.click(
        await screen.findByRole("button", { name: "Quitter" }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Confirmer" }));

      expect(
        await screen.findByText(
          "Impossible de quitter le groupe : vous êtes le seul responsable.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Quitter le groupe « Groupe des Éclaireurs » ?"),
      ).toBeInTheDocument();
    });
  });
});
