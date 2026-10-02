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

const groupeAdmin = (
  scanJustificatifsActif: boolean,
  convertirJustificatifsEnPdf = false,
  moyensPaiement = ["Espèces du groupe"],
  ndfSigneeActif = false,
  logoPersonnalise = false,
) =>
  reponse({
    isAdmin: true,
    parametres: {
      scanJustificatifsActif,
      convertirJustificatifsEnPdf,
      moyensPaiement,
      ndfSigneeActif,
      logoPersonnalise,
    },
  });

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
    expect(screen.getAllByRole("switch")).toHaveLength(4);
    expect(screen.queryByText(/ML/)).not.toBeInTheDocument();
  });

  it("enregistre l'activation du scan", async () => {
    fetchMock.mockImplementation(
      (_url: string, options?: { method?: string }) =>
        options?.method === "PATCH"
          ? reponse({
              success: true,
              parametres: {
                scanJustificatifsActif: true,
                convertirJustificatifsEnPdf: false,
                moyensPaiement: ["Espèces du groupe"],
              },
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

  it("enregistre l'activation de la conversion en PDF", async () => {
    fetchMock.mockImplementation(
      (_url: string, options?: { method?: string }) =>
        options?.method === "PATCH"
          ? reponse({
              success: true,
              parametres: {
                scanJustificatifsActif: false,
                convertirJustificatifsEnPdf: true,
                moyensPaiement: ["Espèces du groupe"],
              },
            })
          : groupeAdmin(false),
    );

    render(<PageParametresGroupe />);
    const conversion = await screen.findByRole("switch", {
      name: "Conversion des justificatifs en PDF",
    });
    await userEvent.click(conversion);

    expect(await screen.findByText("Paramètres enregistrés.")).toBeVisible();
    expect(conversion).toHaveAttribute("aria-checked", "true");
    const appel = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "PATCH",
    );
    expect(JSON.parse(appel?.[1].body)).toEqual({
      convertirJustificatifsEnPdf: true,
    });
  });

  it("enregistre l'activation des notes de frais signées", async () => {
    fetchMock.mockImplementation(
      (_url: string, options?: { method?: string }) =>
        options?.method === "PATCH"
          ? reponse({
              success: true,
              parametres: {
                scanJustificatifsActif: false,
                convertirJustificatifsEnPdf: false,
                moyensPaiement: ["Espèces du groupe"],
                ndfSigneeActif: true,
              },
            })
          : groupeAdmin(false),
    );

    render(<PageParametresGroupe />);
    const ndfSignee = await screen.findByRole("switch", {
      name: "Notes de frais signées",
    });
    await userEvent.click(ndfSignee);

    expect(await screen.findByText("Paramètres enregistrés.")).toBeVisible();
    expect(ndfSignee).toHaveAttribute("aria-checked", "true");
    const appel = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "PATCH",
    );
    expect(appel?.[0]).toBe("/api/group/parametres");
    expect(JSON.parse(appel?.[1].body)).toEqual({
      ndfSigneeActif: true,
    });
  });

  it("active les km uniquement avec les notes signées et permet de régler le taux", async () => {
    fetchMock.mockImplementation(
      (_url: string, options?: { method?: string }) =>
        options?.method === "PATCH"
          ? reponse({
              success: true,
              parametres: {
                scanJustificatifsActif: false,
                convertirJustificatifsEnPdf: false,
                moyensPaiement: ["Espèces du groupe"],
                ndfSigneeActif: true,
                kmActif: true,
                kmTaux: 0.4,
                kmTauxMajLe: "2026-10-02",
              },
            })
          : groupeAdmin(false),
    );

    render(<PageParametresGroupe />);
    const km = await screen.findByRole("switch", {
      name: "Notes de frais kilométriques",
    });
    expect(km).toBeDisabled();
    await userEvent.click(
      screen.getByRole("switch", { name: "Notes de frais signées" }),
    );
    await screen.findByText("Paramètres enregistrés.");
    expect(
      await screen.findByLabelText("Taux du kilomètre (€ / km)"),
    ).toHaveValue("0,4");
    expect(screen.getByText("Mis à jour le 02/10/26.")).toBeVisible();
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

  it("ajoute un moyen de paiement via le champ texte", async () => {
    fetchMock.mockImplementation(
      (_url: string, options?: { method?: string }) =>
        options?.method === "PATCH"
          ? reponse({
              success: true,
              parametres: {
                scanJustificatifsActif: false,
                convertirJustificatifsEnPdf: false,
                moyensPaiement: ["Espèces du groupe", "Virement du groupe"],
              },
            })
          : groupeAdmin(false),
    );

    render(<PageParametresGroupe />);
    const champ = await screen.findByLabelText("Moyens de paiement du groupe");
    await userEvent.type(champ, "Virement du groupe");
    await userEvent.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(await screen.findByText("Paramètres enregistrés.")).toBeVisible();
    expect(screen.getByText("Virement du groupe")).toBeInTheDocument();
    const appel = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "PATCH",
    );
    expect(JSON.parse(appel?.[1].body)).toEqual({
      moyensPaiement: ["Espèces du groupe", "Virement du groupe"],
    });
  });

  it("retire un moyen de paiement via la poubelle", async () => {
    fetchMock.mockImplementation(
      (_url: string, options?: { method?: string }) =>
        options?.method === "PATCH"
          ? reponse({
              success: true,
              parametres: {
                scanJustificatifsActif: false,
                convertirJustificatifsEnPdf: false,
                moyensPaiement: [],
              },
            })
          : groupeAdmin(false, false, [
              "Espèces du groupe",
              "Virement du groupe",
            ]),
    );

    render(<PageParametresGroupe />);
    await screen.findByText("Espèces du groupe");
    await userEvent.click(
      screen.getByRole("button", { name: "Retirer Virement du groupe" }),
    );

    expect(await screen.findByText("Paramètres enregistrés.")).toBeVisible();
    const appel = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "PATCH",
    );
    expect(JSON.parse(appel?.[1].body)).toEqual({
      moyensPaiement: ["Espèces du groupe"],
    });
  });

  it("n'affiche le logo du document que si les notes de frais signées sont activées", async () => {
    fetchMock.mockReturnValue(groupeAdmin(false));
    const { unmount } = render(<PageParametresGroupe />);
    await screen.findByRole("switch", { name: "Notes de frais signées" });
    expect(
      screen.queryByText("Logo de la note de frais"),
    ).not.toBeInTheDocument();
    unmount();

    fetchMock.mockReturnValue(groupeAdmin(false, false, ["Espèces"], true));
    render(<PageParametresGroupe />);
    expect(
      await screen.findByText("Logo de la note de frais"),
    ).toBeInTheDocument();
    expect(screen.getByText("Logo SGDF par défaut")).toBeInTheDocument();
  });

  it("importe puis rétablit le logo", async () => {
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/group/parametres/logo")
        return reponse({ success: true });
      void options;
      return groupeAdmin(false, false, ["Espèces"], true);
    });
    render(<PageParametresGroupe />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Modifier le logo" }),
    );
    const champ = await screen.findByLabelText("Importer un logo");
    await userEvent.upload(
      champ,
      new File(["x"], "logo.png", { type: "image/png" }),
    );

    expect(await screen.findByAltText("Logo du groupe")).toBeInTheDocument();
    const envoi = fetchMock.mock.calls.find(
      ([url, options]) =>
        url === "/api/group/parametres/logo" && options?.method === "PUT",
    );
    expect(envoi).toBeDefined();

    await userEvent.click(
      screen.getByRole("button", { name: "Rétablir le logo SGDF" }),
    );
    expect(
      await screen.findByAltText("Logo SGDF par défaut"),
    ).toBeInTheDocument();
  });
});
