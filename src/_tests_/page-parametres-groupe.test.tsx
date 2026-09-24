import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PageParametresGroupe from "../app/(main)/parametres-groupe/page";

vi.mock("@/lib/auth-client", () => ({
  clientAuth: {
    useActiveOrganization: () => ({
      data: { id: "org_1", name: "Groupe test" },
    }),
  },
}));

const reponse = (corps: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(corps) });

const groupeAdmin = (scanJustificatifsActif: boolean) =>
  reponse({ isAdmin: true, parametres: { scanJustificatifsActif } });

describe("Page Paramètres du groupe", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("refuse l'accès à un membre simple", async () => {
    fetchMock.mockReturnValue(reponse({ isAdmin: false }));

    render(<PageParametresGroupe />);

    expect(
      await screen.findByText("Accès réservé aux responsables du groupe."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("affiche un seul paramètre : le scan automatique, sans jargon ML", async () => {
    fetchMock.mockReturnValue(groupeAdmin(false));

    render(<PageParametresGroupe />);

    const scan = await screen.findByRole("switch", {
      name: "Scan automatique des justificatifs",
    });
    expect(scan).toHaveAttribute("aria-checked", "false");
    expect(screen.getAllByRole("switch")).toHaveLength(1);
    expect(screen.queryByText(/ML/)).not.toBeInTheDocument();
  });

  it("enregistre l'activation du scan", async () => {
    fetchMock.mockImplementation(
      (_url: string, options?: { method?: string }) =>
        options?.method === "PATCH"
          ? reponse({
              success: true,
              parametres: { scanJustificatifsActif: true },
            })
          : groupeAdmin(false),
    );

    render(<PageParametresGroupe />);
    const scan = await screen.findByRole("switch", {
      name: "Scan automatique des justificatifs",
    });
    await userEvent.click(scan);

    expect(await screen.findByText("Paramètres enregistrés.")).toBeVisible();
    expect(scan).toHaveAttribute("aria-checked", "true");
    const appel = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "PATCH",
    );
    expect(appel?.[0]).toBe("/api/group/parametres");
    expect(JSON.parse(appel?.[1].body)).toEqual({
      scanJustificatifsActif: true,
    });
  });

  it("rétablit l'interrupteur si l'enregistrement échoue", async () => {
    fetchMock.mockImplementation(
      (_url: string, options?: { method?: string }) =>
        options?.method === "PATCH" ? reponse({}, false) : groupeAdmin(false),
    );

    render(<PageParametresGroupe />);
    const scan = await screen.findByRole("switch", {
      name: "Scan automatique des justificatifs",
    });
    await userEvent.click(scan);

    expect(
      await screen.findByText(
        "Impossible d’enregistrer le paramètre. Réessayez.",
      ),
    ).toBeInTheDocument();
    expect(scan).toHaveAttribute("aria-checked", "false");
  });
});
