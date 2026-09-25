import { describe, expect, it } from "vitest";
import { validerCorpsRequete } from "@/lib/api/validateBody";

const attachment = (name: string) => ({
  displayName: name,
  mimeType: "image/jpeg",
  base64Data: "aGVsbG8=",
  originalFileName: name,
});

const baseBody = {
  userEmail: "utilisateur@example.com",
  unitId: "groupe",
};

const ligne = { category: "Carburant", amount: 18 };

const noteDeFrais = (extra: Record<string, unknown> = {}) => ({
  ...baseBody,
  envoiType: "note-de-frais",
  attachments: [attachment("ticket.jpg")],
  expenses: [{ date: "2026-08-16", activity: "Camp d'été", lines: [ligne] }],
  ...extra,
});

const depenseGroupe = (extra: Record<string, unknown> = {}) => ({
  ...baseBody,
  envoiType: "depense-groupe",
  attachments: [attachment("ticket.jpg")],
  expenses: [
    {
      date: "2026-08-16",
      paymentMethod: "Carte de procurement",
      lines: [ligne],
    },
  ],
  ...extra,
});

describe("validerCorpsRequete : note de frais", () => {
  it("calcule le total et garde les champs de chaque justificatif", () => {
    const resultat = validerCorpsRequete(
      noteDeFrais({
        attachments: [attachment("ticket-1.jpg"), attachment("ticket-2.jpg")],
        expenses: [
          {
            date: "2026-08-20",
            activity: "Camp",
            description: "Courses",
            lines: [
              { category: "Alimentation, Intendance", amount: "12.50" },
              { category: "Achat Petit Matériel", amount: 3.1 },
            ],
          },
          {
            date: "2026-08-16",
            activity: "Week-end",
            lines: [{ category: "Carburant", amount: 30 }],
          },
        ],
      }),
    );

    expect(resultat.error).toBeUndefined();
    expect(resultat.donneesEmail).toMatchObject({
      typeEnvoi: "note-de-frais",
      montant: 45.6,
      date: "2026-08-16",
      detailsDepenses: [
        {
          date: "2026-08-20",
          activite: "Camp",
          description: "Courses",
          modePaiement: "",
          lignes: [
            { categorie: "Alimentation, Intendance", montant: 12.5 },
            { categorie: "Achat Petit Matériel", montant: 3.1 },
          ],
        },
        { date: "2026-08-16", activite: "Week-end", description: "" },
      ],
    });
  });

  it("refuse une activité liée manquante ou une date invalide", () => {
    const sansActivite = noteDeFrais({
      expenses: [{ date: "2026-08-16", lines: [ligne] }],
    });
    const dateInvalide = noteDeFrais({
      expenses: [{ date: "16/08/2026", activity: "Camp", lines: [ligne] }],
    });
    expect(validerCorpsRequete(sansActivite).error?.status).toBe(400);
    expect(validerCorpsRequete(dateInvalide).error?.status).toBe(400);
  });

  it("refuse un moyen de paiement du groupe sur une note de frais", () => {
    const resultat = validerCorpsRequete(
      noteDeFrais({
        expenses: [
          {
            date: "2026-08-16",
            activity: "Camp",
            paymentMethod: "Espèces du groupe",
            lines: [ligne],
          },
        ],
      }),
    );
    expect(resultat.error?.status).toBe(400);
  });

  it("accepte un RIB facultatif et le refuse s'il est invalide", () => {
    const avecRib = validerCorpsRequete(
      noteDeFrais({ rib: attachment("rib.pdf") }),
    );
    expect(avecRib.error).toBeUndefined();
    expect(avecRib.donneesEmail?.rib?.nomFichierOriginal).toBe("rib.pdf");

    const ribInvalide = validerCorpsRequete(
      noteDeFrais({ rib: { ...attachment("rib.exe"), mimeType: "text/x" } }),
    );
    expect(ribInvalide.error?.status).toBe(400);
  });

  it("refuse un nombre de dépenses différent du nombre de justificatifs", () => {
    const resultat = validerCorpsRequete(
      noteDeFrais({
        attachments: [attachment("ticket-1.jpg"), attachment("ticket-2.jpg")],
      }),
    );
    expect(resultat.error?.status).toBe(400);
  });

  it("refuse une catégorie inconnue, un montant nul ou une liste de lignes vide", () => {
    const requete = (lines: unknown[]) =>
      validerCorpsRequete(
        noteDeFrais({
          expenses: [{ date: "2026-08-16", activity: "Camp", lines }],
        }),
      );

    expect(
      requete([{ category: "Catégorie inconnue", amount: 20 }]).error?.status,
    ).toBe(400);
    expect(requete([{ category: "Carburant", amount: 0 }]).error?.status).toBe(
      400,
    );
    expect(
      requete([{ category: "Carburant", amount: "abc" }]).error?.status,
    ).toBe(400);
    expect(requete([]).error?.status).toBe(400);
  });
});

describe("validerCorpsRequete : dépense avec moyen de paiement du groupe", () => {
  it("accepte un justificatif avec un moyen de paiement du groupe", () => {
    const resultat = validerCorpsRequete(depenseGroupe());
    expect(resultat.error).toBeUndefined();
    expect(resultat.donneesEmail).toMatchObject({
      typeEnvoi: "depense-groupe",
      montant: 18,
      detailsDepenses: [{ modePaiement: "Carte de procurement", activite: "" }],
    });
  });

  it("refuse un moyen de paiement absent, inconnu ou personnel", () => {
    const requete = (paymentMethod?: string) =>
      validerCorpsRequete(
        depenseGroupe({
          expenses: [{ date: "2026-08-16", paymentMethod, lines: [ligne] }],
        }),
      );
    expect(requete().error?.status).toBe(400);
    expect(requete("Crypto-monnaie").error?.status).toBe(400);
    expect(requete("Espèces").error?.status).toBe(400);
  });

  it("refuse plusieurs justificatifs", () => {
    const resultat = validerCorpsRequete(
      depenseGroupe({
        attachments: [attachment("a.jpg"), attachment("b.jpg")],
        expenses: [
          {
            date: "2026-08-16",
            paymentMethod: "Espèces du groupe",
            lines: [ligne],
          },
          {
            date: "2026-08-16",
            paymentMethod: "Espèces du groupe",
            lines: [ligne],
          },
        ],
      }),
    );
    expect(resultat.error?.status).toBe(400);
  });

  it("refuse un RIB", () => {
    const resultat = validerCorpsRequete(
      depenseGroupe({ rib: attachment("rib.pdf") }),
    );
    expect(resultat.error?.status).toBe(400);
  });

  it("refuse un type d'envoi absent ou inconnu", () => {
    expect(
      validerCorpsRequete({ ...depenseGroupe(), envoiType: undefined }).error
        ?.status,
    ).toBe(400);
    expect(
      validerCorpsRequete(depenseGroupe({ envoiType: "autre" })).error?.status,
    ).toBe(400);
  });
});
