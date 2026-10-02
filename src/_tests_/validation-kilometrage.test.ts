import { describe, expect, it } from "vitest";
import { validerCorpsRequete } from "@/lib/api/validateBody";

const parametresKm = { taux: 0.354, tauxMajLe: "2025-11-05" };
const valider = (
  body: unknown,
  km: typeof parametresKm | null = parametresKm,
) => validerCorpsRequete(body, ["Espèces du groupe"], km ?? undefined);

const attachment = {
  displayName: "ticket.jpg",
  mimeType: "image/jpeg",
  base64Data: "aGVsbG8=",
  originalFileName: "ticket.jpg",
};

const ligneKm = (extra: Record<string, unknown> = {}) => ({
  date: "2026-09-04",
  distanceKm: 100,
  activite: "Camp",
  objet: "Paris - Rambouillet aller-retour",
  ...extra,
});

const noteDeFrais = (extra: Record<string, unknown> = {}) => ({
  userEmail: "utilisateur@example.com",
  unitId: "groupe",
  envoiType: "note-de-frais",
  attachments: [attachment],
  expenses: [
    {
      date: "2026-08-16",
      activity: "Camp",
      lines: [{ category: "Formation", amount: 10 }],
    },
  ],
  ...extra,
});

describe("validerCorpsRequete : kilomètres", () => {
  it("fige le taux, calcule le montant km et l'ajoute au total", () => {
    const { donneesEmail, error } = valider(
      noteDeFrais({ kilometrages: [ligneKm(), ligneKm({ distanceKm: 42.5 })] }),
    );

    expect(error).toBeUndefined();
    expect(donneesEmail?.kilometrage).toMatchObject({
      taux: 0.354,
      tauxMajLe: "2025-11-05",
      montant: 50.45,
    });
    expect(donneesEmail?.montant).toBe(60.45);
  });

  it("accepte une note composée uniquement de kilomètres", () => {
    const { donneesEmail, error } = valider(
      noteDeFrais({ attachments: [], expenses: [], kilometrages: [ligneKm()] }),
    );

    expect(error).toBeUndefined();
    expect(donneesEmail?.piecesJointes).toEqual([]);
    expect(donneesEmail?.montant).toBe(35.4);
    expect(donneesEmail?.date).toBe("2026-09-04");
  });

  it("refuse les kilomètres si le groupe ne les active pas", async () => {
    const { error } = valider(noteDeFrais({ kilometrages: [ligneKm()] }), null);

    expect(error?.status).toBe(403);
  });

  it("refuse les kilomètres sur une dépense avec moyen de paiement du groupe", () => {
    const { error } = valider({
      ...noteDeFrais({ kilometrages: [ligneKm()] }),
      envoiType: "depense-groupe",
      expenses: [
        {
          date: "2026-08-16",
          paymentMethod: "Espèces du groupe",
          lines: [{ category: "Formation", amount: 10 }],
        },
      ],
    });

    expect(error?.status).toBe(403);
  });

  it.each([
    ["distance nulle", { distanceKm: 0 }],
    ["distance trop grande", { distanceKm: 2001 }],
    ["trop de décimales", { distanceKm: 1.234 }],
    ["objet trop court", { objet: "court" }],
    ["activité vide", { activite: " " }],
    ["date invalide", { date: "n'importe quoi" }],
  ])("refuse une ligne invalide (%s)", (_nom, extra) => {
    const { error } = valider(noteDeFrais({ kilometrages: [ligneKm(extra)] }));

    expect(error?.status).toBe(400);
  });

  it("partage la limite de 12 lignes avec les justificatifs", () => {
    const { error } = valider(
      noteDeFrais({
        kilometrages: Array.from({ length: 12 }, () => ligneKm()),
      }),
    );

    expect(error?.status).toBe(400);
  });
});
