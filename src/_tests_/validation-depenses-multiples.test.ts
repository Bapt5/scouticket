import { describe, expect, it } from "vitest";
import { validerCorpsRequete } from "@/lib/api/validateBody";

const attachment = (name: string) => ({
  displayName: name,
  mimeType: "image/jpeg",
  base64Data: "aGVsbG8=",
  originalFileName: name,
  normalizedFileName: name,
});

const baseBody = {
  userEmail: "utilisateur@example.com",
  date: "2026-08-16",
  unitId: "groupe",
};

describe("validerCorpsRequete avec plusieurs catégories par justificatif", () => {
  it("calcule le total à partir des lignes de chaque justificatif", () => {
    const resultat = validerCorpsRequete({
      ...baseBody,
      attachments: [attachment("ticket-1.jpg"), attachment("ticket-2.jpg")],
      expenses: [
        {
          paymentMethod: "Carte bancaire",
          lines: [
            { category: "Alimentation, Intendance", amount: "12.50" },
            { category: "Achat Petit Matériel", amount: 3.1 },
          ],
        },
        {
          paymentMethod: "Espèces",
          lines: [{ category: "Carburant", amount: 30 }],
        },
      ],
    });

    expect(resultat.error).toBeUndefined();
    expect(resultat.donneesEmail).toMatchObject({
      montant: 45.6,
      detailsDepenses: [
        {
          modePaiement: "Carte bancaire",
          lignes: [
            { categorie: "Alimentation, Intendance", montant: 12.5 },
            { categorie: "Achat Petit Matériel", montant: 3.1 },
          ],
        },
        {
          modePaiement: "Espèces",
          lignes: [{ categorie: "Carburant", montant: 30 }],
        },
      ],
    });
  });

  it("accepte un justificatif unique avec une seule ligne", () => {
    const resultat = validerCorpsRequete({
      ...baseBody,
      attachments: [attachment("ticket.jpg")],
      expenses: [
        {
          paymentMethod: "Carte bancaire",
          lines: [{ category: "Carburant", amount: "18.40" }],
        },
      ],
    });

    expect(resultat.donneesEmail).toMatchObject({
      montant: 18.4,
      detailsDepenses: [
        {
          modePaiement: "Carte bancaire",
          lignes: [{ categorie: "Carburant", montant: 18.4 }],
        },
      ],
    });
  });

  it("refuse un nombre de dépenses différent du nombre de justificatifs", () => {
    const resultat = validerCorpsRequete({
      ...baseBody,
      attachments: [attachment("ticket-1.jpg"), attachment("ticket-2.jpg")],
      expenses: [
        {
          paymentMethod: "Espèces",
          lines: [{ category: "Carburant", amount: 20 }],
        },
      ],
    });

    expect(resultat.error?.status).toBe(400);
  });

  it("refuse une catégorie inconnue, un montant nul ou une liste de lignes vide", () => {
    const requete = (lines: unknown[]) =>
      validerCorpsRequete({
        ...baseBody,
        attachments: [attachment("ticket.jpg")],
        expenses: [{ paymentMethod: "Espèces", lines }],
      });

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

  it("refuse un mode de paiement absent ou inconnu", () => {
    const absent = validerCorpsRequete({
      ...baseBody,
      attachments: [attachment("ticket.jpg")],
      expenses: [{ lines: [{ category: "Carburant", amount: 18 }] }],
    });
    const inconnu = validerCorpsRequete({
      ...baseBody,
      attachments: [attachment("ticket.jpg")],
      expenses: [
        {
          paymentMethod: "Crypto-monnaie",
          lines: [{ category: "Carburant", amount: 18 }],
        },
      ],
    });

    expect(absent.error?.status).toBe(400);
    expect(inconnu.error?.status).toBe(400);
  });
});
