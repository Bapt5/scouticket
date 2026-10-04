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
  historiqueActif = false,
) =>
  reponse({
    isAdmin: true,
    parametres: {
      scanJustificatifsActif,
      convertirJustificatifsEnPdf,
      moyensPaiement,
      ndfSigneeActif,
      logoPersonnalise,
      historiqueActif,
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
    expect(screen.getAllByRole("switch")).toHaveLength(6);
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

  describe("année comptable", () => {
    const chargerGroupe = (anneeComptableDebut = { mois: 9, jour: 1 }) =>
      fetchMock.mockImplementation(
        (_url: string, options?: { method?: string }) =>
          options?.method === "PATCH"
            ? reponse({
                success: true,
                parametres: {
                  scanJustificatifsActif: false,
                  convertirJustificatifsEnPdf: false,
                  moyensPaiement: ["Espèces du groupe"],
                  anneeComptableDebut: { mois: 1, jour: 1 },
                },
              })
            : reponse({
                isAdmin: true,
                parametres: {
                  scanJustificatifsActif: false,
                  convertirJustificatifsEnPdf: false,
                  moyensPaiement: ["Espèces du groupe"],
                  anneeComptableDebut,
                },
              }),
      );

    it("affiche le début de l'année comptable du groupe, sans nomenclature personnalisée", async () => {
      chargerGroupe({ mois: 10, jour: 15 });

      render(<PageParametresGroupe />);

      expect(
        await screen.findByLabelText("Jour de début de l'année comptable"),
      ).toHaveValue(15);
      expect(
        screen.getByLabelText("Mois de début de l'année comptable"),
      ).toHaveValue("10");
      expect(
        screen.getByRole("button", {
          name: "Enregistrer le début de l’année comptable",
        }),
      ).toBeDisabled();
    });

    it("enregistre le nouveau début de l'année comptable", async () => {
      chargerGroupe();

      render(<PageParametresGroupe />);
      await userEvent.selectOptions(
        await screen.findByLabelText("Mois de début de l'année comptable"),
        "janvier",
      );
      await userEvent.click(
        screen.getByRole("button", {
          name: "Enregistrer le début de l’année comptable",
        }),
      );

      expect(await screen.findByText("Paramètres enregistrés.")).toBeVisible();
      const appel = fetchMock.mock.calls.find(
        ([, options]) => options?.method === "PATCH",
      );
      expect(JSON.parse(appel?.[1].body)).toEqual({
        anneeComptableDebut: { mois: 1, jour: 1 },
      });
    });

    it("refuse d'enregistrer un début invalide (29 février)", async () => {
      chargerGroupe();

      render(<PageParametresGroupe />);
      await userEvent.selectOptions(
        await screen.findByLabelText("Mois de début de l'année comptable"),
        "février",
      );
      const jour = screen.getByLabelText("Jour de début de l'année comptable");
      await userEvent.clear(jour);
      await userEvent.type(jour, "29");

      expect(
        screen.getByRole("button", {
          name: "Enregistrer le début de l’année comptable",
        }),
      ).toBeDisabled();
    });
  });

  describe("suivi budgétaire", () => {
    const interrupteur = () =>
      screen.findByRole("switch", { name: "Suivi budgétaire par poste" });

    const groupe = (historiqueActif: boolean, budgetActif: boolean) =>
      reponse({
        isAdmin: true,
        parametres: {
          scanJustificatifsActif: false,
          convertirJustificatifsEnPdf: false,
          moyensPaiement: ["Espèces du groupe"],
          historiqueActif,
          budgetActif,
          anneeComptableDebut: { mois: 9, jour: 1 },
        },
      });

    it("est désactivé tant que l'historique n'est pas actif", async () => {
      fetchMock.mockReturnValue(groupe(false, false));

      render(<PageParametresGroupe />);

      expect(await interrupteur()).toBeDisabled();
      expect(
        screen.queryByRole("link", { name: /Consulter le suivi budgétaire/ }),
      ).not.toBeInTheDocument();
    });

    it("active le suivi sans confirmation", async () => {
      fetchMock.mockImplementation(
        (_url: string, options?: { method?: string }) =>
          options?.method === "PATCH"
            ? reponse({
                success: true,
                parametres: {
                  scanJustificatifsActif: false,
                  convertirJustificatifsEnPdf: false,
                  moyensPaiement: ["Espèces du groupe"],
                  historiqueActif: true,
                  budgetActif: true,
                },
              })
            : groupe(true, false),
      );

      render(<PageParametresGroupe />);
      await userEvent.click(await interrupteur());

      expect(await screen.findByText("Paramètres enregistrés.")).toBeVisible();
      const appel = fetchMock.mock.calls.find(
        ([, options]) => options?.method === "PATCH",
      );
      expect(JSON.parse(appel?.[1].body)).toEqual({ budgetActif: true });
      expect(
        screen.getByRole("link", { name: /Consulter le suivi budgétaire/ }),
      ).toBeVisible();
    });

    it("empêche de désactiver l'historique tant que le suivi est actif", async () => {
      fetchMock.mockReturnValue(groupe(true, true));

      render(<PageParametresGroupe />);

      expect(
        await screen.findByRole("switch", {
          name: "Historique des dépenses, recettes et notes de frais",
        }),
      ).toBeDisabled();
      expect(
        screen.getByText(/Désactivez d’abord le suivi budgétaire/),
      ).toBeVisible();
    });

    it("exige la saisie de SUPPRIMER et affiche le nombre de postes et d'écritures", async () => {
      fetchMock.mockImplementation(
        (url: string, options?: { method?: string }) => {
          if (options?.method === "PATCH")
            return reponse({
              success: true,
              parametres: {
                scanJustificatifsActif: false,
                convertirJustificatifsEnPdf: false,
                moyensPaiement: ["Espèces du groupe"],
                historiqueActif: true,
                budgetActif: false,
              },
            });
          if (url === "/api/budget/donnees")
            return reponse({ postes: 14, ecritures: 6 });
          return groupe(true, true);
        },
      );

      render(<PageParametresGroupe />);
      await userEvent.click(await interrupteur());

      expect(await screen.findByText(/14 postes/)).toBeVisible();
      expect(screen.getByText(/6 écritures/)).toBeVisible();
      // Aucune désactivation tant que le mot n'est pas saisi.
      expect(
        fetchMock.mock.calls.some(([, options]) => options?.method === "PATCH"),
      ).toBe(false);
      const confirmer = screen.getByRole("button", {
        name: "Supprimer définitivement",
      });
      expect(confirmer).toBeDisabled();
      await userEvent.type(
        screen.getByLabelText(/Saisissez SUPPRIMER/),
        "SUPPRIMER",
      );
      await userEvent.click(confirmer);

      expect(
        await screen.findByText("Suivi budgétaire désactivé et supprimé."),
      ).toBeVisible();
      const appel = fetchMock.mock.calls.find(
        ([, options]) => options?.method === "PATCH",
      );
      expect(JSON.parse(appel?.[1].body)).toEqual({
        budgetActif: false,
        confirmationSuppressionBudget: true,
      });
    });

    it("propose l'export CSV du suivi avant la suppression", async () => {
      URL.createObjectURL = vi.fn(() => "blob:budget");
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        () => {},
      );
      fetchMock.mockImplementation((url: string) => {
        if (url === "/api/budget/export")
          return Promise.resolve({
            ok: true,
            blob: () => Promise.resolve(new Blob(["Type;Poste"])),
          });
        if (url === "/api/budget/donnees")
          return reponse({ postes: 14, ecritures: 0 });
        return groupe(true, true);
      });

      render(<PageParametresGroupe />);
      await userEvent.click(await interrupteur());
      await userEvent.click(
        await screen.findByRole("button", { name: "Exporter en CSV" }),
      );

      expect(await screen.findByText("Export téléchargé.")).toBeVisible();
      expect(fetchMock).toHaveBeenCalledWith("/api/budget/export");
      expect(
        fetchMock.mock.calls.some(([, options]) => options?.method === "PATCH"),
      ).toBe(false);
    });
  });

  describe("historique", () => {
    const interrupteur = () =>
      screen.findByRole("switch", {
        name: "Historique des dépenses, recettes et notes de frais",
      });

    it("active l'historique sans confirmation", async () => {
      fetchMock.mockImplementation(
        (_url: string, options?: { method?: string }) =>
          options?.method === "PATCH"
            ? reponse({
                success: true,
                parametres: {
                  scanJustificatifsActif: false,
                  convertirJustificatifsEnPdf: false,
                  moyensPaiement: ["Espèces du groupe"],
                  historiqueActif: true,
                },
              })
            : groupeAdmin(false),
      );

      render(<PageParametresGroupe />);
      await userEvent.click(await interrupteur());

      expect(await screen.findByText("Paramètres enregistrés.")).toBeVisible();
      const appel = fetchMock.mock.calls.find(
        ([, options]) => options?.method === "PATCH",
      );
      expect(JSON.parse(appel?.[1].body)).toEqual({ historiqueActif: true });
      expect(
        screen.getByRole("link", { name: /Consulter l’historique/ }),
      ).toBeVisible();
    });

    it("exige la saisie de SUPPRIMER et affiche le nombre d'entrées avant de désactiver", async () => {
      fetchMock.mockImplementation(
        (url: string, options?: { method?: string }) => {
          if (options?.method === "PATCH")
            return reponse({
              success: true,
              parametres: {
                scanJustificatifsActif: false,
                convertirJustificatifsEnPdf: false,
                moyensPaiement: ["Espèces du groupe"],
                historiqueActif: false,
              },
            });
          if (url.startsWith("/api/historique")) return reponse({ total: 3 });
          return groupeAdmin(
            false,
            false,
            ["Espèces du groupe"],
            false,
            false,
            true,
          );
        },
      );

      render(<PageParametresGroupe />);
      await userEvent.click(await interrupteur());

      expect(await screen.findByText(/3 entrées/)).toBeVisible();
      // Aucune désactivation tant que le mot n'est pas saisi.
      expect(
        fetchMock.mock.calls.some(([, options]) => options?.method === "PATCH"),
      ).toBe(false);
      const confirmer = screen.getByRole("button", {
        name: "Supprimer définitivement",
      });
      expect(confirmer).toBeDisabled();
      await userEvent.type(
        screen.getByLabelText(/Saisissez SUPPRIMER/),
        "SUPPRIMER",
      );
      await userEvent.click(confirmer);

      expect(
        await screen.findByText("Historique désactivé et supprimé."),
      ).toBeVisible();
      const appel = fetchMock.mock.calls.find(
        ([, options]) => options?.method === "PATCH",
      );
      expect(JSON.parse(appel?.[1].body)).toEqual({
        historiqueActif: false,
        confirmationSuppressionHistorique: true,
      });
    });

    describe("export avant désactivation", () => {
      const avecHistorique = (total: number, exportOk = true) =>
        fetchMock.mockImplementation((url: string) => {
          if (url === "/api/historique/export")
            return exportOk
              ? Promise.resolve({
                  ok: true,
                  blob: () => Promise.resolve(new Blob(["Date;Montant"])),
                })
              : reponse({ error: "Trop de lignes" }, false);
          if (url.startsWith("/api/historique")) return reponse({ total });
          return groupeAdmin(
            false,
            false,
            ["Espèces du groupe"],
            false,
            false,
            true,
          );
        });

      beforeEach(() => {
        URL.createObjectURL = vi.fn(() => "blob:historique");
        URL.revokeObjectURL = vi.fn();
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
          () => {},
        );
      });

      it("propose l'export et télécharge le fichier sans rien supprimer", async () => {
        avecHistorique(3);
        render(<PageParametresGroupe />);
        await userEvent.click(await interrupteur());

        await userEvent.click(
          await screen.findByRole("button", { name: "Exporter en CSV" }),
        );

        expect(await screen.findByText("Export téléchargé.")).toBeVisible();
        expect(fetchMock).toHaveBeenCalledWith("/api/historique/export");
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
        expect(
          fetchMock.mock.calls.some(
            ([, options]) => options?.method === "PATCH",
          ),
        ).toBe(false);
        // La suppression reste soumise à la saisie de SUPPRIMER.
        expect(
          screen.getByRole("button", { name: "Supprimer définitivement" }),
        ).toBeDisabled();
      });

      it("affiche une erreur si l'export échoue", async () => {
        avecHistorique(3, false);
        render(<PageParametresGroupe />);
        await userEvent.click(await interrupteur());

        await userEvent.click(
          await screen.findByRole("button", { name: "Exporter en CSV" }),
        );

        expect(
          await screen.findByText(
            "Impossible d’exporter l’historique. Réessayez.",
          ),
        ).toBeVisible();
        expect(screen.queryByText("Export téléchargé.")).toBeNull();
      });

      it("ne propose pas l'export quand l'historique est vide", async () => {
        avecHistorique(0);
        render(<PageParametresGroupe />);
        await userEvent.click(await interrupteur());

        await screen.findByRole("dialog");
        expect(
          screen.queryByRole("button", { name: "Exporter en CSV" }),
        ).toBeNull();
      });
    });

    it("annuler le dialog n'envoie rien", async () => {
      fetchMock.mockImplementation((url: string) =>
        url.startsWith("/api/historique")
          ? reponse({ total: 1 })
          : groupeAdmin(
              false,
              false,
              ["Espèces du groupe"],
              false,
              false,
              true,
            ),
      );

      render(<PageParametresGroupe />);
      await userEvent.click(await interrupteur());
      await userEvent.click(
        await screen.findByRole("button", { name: "Annuler" }),
      );

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        fetchMock.mock.calls.some(([, options]) => options?.method === "PATCH"),
      ).toBe(false);
    });
  });
});
