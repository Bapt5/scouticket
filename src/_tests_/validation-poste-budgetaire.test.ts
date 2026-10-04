import { describe, expect, it } from "vitest";
import { validerCorpsRequete } from "@/lib/api/validateBody";
import { validerCorpsRequeteRecette } from "@/lib/api/validateBodyRecette";

const attachment = (name: string) => ({
  displayName: name,
  mimeType: "image/jpeg",
  base64Data: "aGVsbG8=",
  originalFileName: name,
});

const ligne = { category: "Formation", amount: 18 };

const noteDeFrais = (
  expenses: Record<string, unknown>[],
  extra: Record<string, unknown> = {},
) => ({
  userEmail: "utilisateur@example.com",
  unitId: "groupe",
  envoiType: "note-de-frais",
  attachments: expenses.map((_, index) => attachment(`ticket-${index}.jpg`)),
  expenses,
  ...extra,
});

const valider = (body: unknown) => validerCorpsRequete(body, ["Espèces"]);

describe("validerCorpsRequete : poste budgétaire", () => {
  it("garde le poste de chaque justificatif", () => {
    const resultat = valider(
      noteDeFrais([
        {
          date: "2026-08-16",
          activity: "Camp",
          lines: [ligne],
          budgetPostId: "p1",
        },
        {
          date: "2026-08-17",
          activity: "Camp",
          lines: [ligne],
          budgetPostId: "p2",
        },
      ]),
    );

    expect(resultat.error).toBeUndefined();
    expect(
      resultat.donneesEmail?.detailsDepenses.map(
        (detail) => detail.posteBudgetaireId,
      ),
    ).toEqual(["p1", "p2"]);
  });

  it("reporte le poste global (note de frais signée) sur chaque justificatif", () => {
    const resultat = valider(
      noteDeFrais(
        [
          { date: "2026-08-16", activity: "Camp", lines: [ligne] },
          { date: "2026-08-17", activity: "Camp", lines: [ligne] },
        ],
        { budgetPostId: "global" },
      ),
    );

    expect(
      resultat.donneesEmail?.detailsDepenses.map(
        (detail) => detail.posteBudgetaireId,
      ),
    ).toEqual(["global", "global"]);
  });

  it("préfère le poste de la pièce au poste global", () => {
    const resultat = valider(
      noteDeFrais(
        [
          {
            date: "2026-08-16",
            activity: "Camp",
            lines: [ligne],
            budgetPostId: "piece",
          },
        ],
        { budgetPostId: "global" },
      ),
    );

    expect(resultat.donneesEmail?.detailsDepenses[0].posteBudgetaireId).toBe(
      "piece",
    );
  });

  it("laisse le poste à null quand rien n'est fourni (suivi désactivé)", () => {
    const resultat = valider(
      noteDeFrais([{ date: "2026-08-16", activity: "Camp", lines: [ligne] }]),
    );

    expect(resultat.error).toBeUndefined();
    expect(
      resultat.donneesEmail?.detailsDepenses[0].posteBudgetaireId,
    ).toBeNull();
  });

  it("refuse un identifiant de poste vide ou trop long", () => {
    const vide = valider(
      noteDeFrais([
        {
          date: "2026-08-16",
          activity: "Camp",
          lines: [ligne],
          budgetPostId: "",
        },
      ]),
    );
    const trop = valider(
      noteDeFrais([
        {
          date: "2026-08-16",
          activity: "Camp",
          lines: [ligne],
          budgetPostId: "x".repeat(101),
        },
      ]),
    );

    expect(vide.error?.status).toBe(400);
    expect(trop.error?.status).toBe(400);
  });
});

describe("validerCorpsRequeteRecette : poste budgétaire", () => {
  const corps = (budgetPostId?: string) => ({
    userEmail: "utilisateur@example.com",
    unitId: "groupe",
    recette: {
      date: "2026-08-16",
      paymentMethod: "Virement",
      lines: [{ category: "Cotisations SGDF", amount: 45 }],
      ...(budgetPostId === undefined ? {} : { budgetPostId }),
    },
  });

  it("garde le poste de la recette", () => {
    const resultat = validerCorpsRequeteRecette(corps("poste-calendrier"));

    expect(resultat.error).toBeUndefined();
    expect(resultat.donneesEmail?.detailRecette.posteBudgetaireId).toBe(
      "poste-calendrier",
    );
  });

  it("laisse le poste à null sans poste fourni", () => {
    expect(
      validerCorpsRequeteRecette(corps()).donneesEmail?.detailRecette
        .posteBudgetaireId,
    ).toBeNull();
  });

  it("refuse un identifiant de poste vide", () => {
    expect(validerCorpsRequeteRecette(corps("")).error?.status).toBe(400);
  });
});
