import { describe, expect, it } from "vitest";
import {
  totalLignes,
  versDepenseNomenclature,
  versDetailDepense,
  ventilerParCategorie,
  detailSaisiComplet,
  type DetailSaisie,
} from "@/lib/depenses";
import type { DetailDepense } from "@/constants/piecesJointes";

const detailDepense = (
  modification: Partial<DetailDepense>,
): DetailDepense => ({
  date: "2026-08-16",
  modePaiement: "",
  activite: "",
  description: "",
  lignes: [],
  ...modification,
});

const detailSaisi = (modification: Partial<DetailSaisie>): DetailSaisie => ({
  date: "2026-08-16",
  modePaiement: "",
  activite: "",
  description: "",
  lignes: [{ categorie: "Eau", montant: "12,5" }],
  ...modification,
});

describe("depenses", () => {
  it("additionne les lignes au centime près", () => {
    expect(
      totalLignes([
        { montant: 0.1 },
        { montant: 0.2 },
        { montant: Number.NaN },
      ]),
    ).toBe(0.3);
  });

  it("utilise la catégorie unique et le total pour la nomenclature", () => {
    expect(
      versDepenseNomenclature(
        detailDepense({
          modePaiement: "Espèces du groupe",
          lignes: [
            { categorie: "Carburant", montant: 10 },
            { categorie: "Carburant", montant: 5.5 },
          ],
        }),
      ),
    ).toEqual({
      typeDepense: "Carburant",
      modePaiement: "Espèces du groupe",
      montant: 15.5,
    });
  });

  it("utilise « NDF » comme mode de paiement d'une note de frais", () => {
    expect(
      versDepenseNomenclature(
        detailDepense({ lignes: [{ categorie: "Carburant", montant: 10 }] }),
      ).modePaiement,
    ).toBe("NDF");
  });

  it("ventile le total par catégorie sur tous les justificatifs", () => {
    expect(
      ventilerParCategorie([
        detailDepense({
          lignes: [
            { categorie: "Carburant", montant: 10.1 },
            { categorie: "Péage-Parking", montant: 5 },
          ],
        }),
        detailDepense({
          lignes: [{ categorie: "Carburant", montant: 0.2 }],
        }),
      ]),
    ).toEqual([
      { categorie: "Carburant", montant: 10.3 },
      { categorie: "Péage-Parking", montant: 5 },
    ]);
  });

  it("utilise « Multiples » quand plusieurs catégories sont utilisées", () => {
    expect(
      versDepenseNomenclature(
        detailDepense({
          lignes: [
            { categorie: "Carburant", montant: 10 },
            { categorie: "Péage-Parking", montant: 5 },
          ],
        }),
      ).typeDepense,
    ).toBe("Multiples");
  });

  it("exige moyen de paiement, date, catégorie et montant pour une dépense du groupe", () => {
    const complet = detailSaisi({ modePaiement: "Espèces du groupe" });
    expect(detailSaisiComplet(complet, "depense-groupe")).toBe(true);
    expect(
      detailSaisiComplet({ ...complet, modePaiement: "" }, "depense-groupe"),
    ).toBe(false);
    expect(detailSaisiComplet({ ...complet, date: "" }, "depense-groupe")).toBe(
      false,
    );
    expect(
      detailSaisiComplet(
        {
          ...complet,
          lignes: [...complet.lignes, { categorie: "", montant: "3" }],
        },
        "depense-groupe",
      ),
    ).toBe(false);
  });

  it("exige date et activité liée, mais pas de moyen de paiement, pour une note de frais", () => {
    const complet = detailSaisi({ activite: "Camp d'été" });
    expect(detailSaisiComplet(complet, "note-de-frais")).toBe(true);
    expect(
      detailSaisiComplet({ ...complet, activite: "  " }, "note-de-frais"),
    ).toBe(false);
  });

  it("ignore les champs de l'autre type d'envoi à la conversion", () => {
    const saisie = detailSaisi({
      modePaiement: "Espèces du groupe",
      activite: "Camp",
    });
    expect(versDetailDepense(saisie, "note-de-frais")).toMatchObject({
      modePaiement: "",
      activite: "Camp",
    });
    expect(versDetailDepense(saisie, "depense-groupe")).toMatchObject({
      modePaiement: "Espèces du groupe",
      activite: "",
    });
  });
});
