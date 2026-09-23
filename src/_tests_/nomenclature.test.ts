import { describe, expect, it } from "vitest";
import {
  anneeComptableDebut,
  calculerReservation,
  genererNomsNomenclature,
  libelleAnneeComptable,
  validerFormatNomenclature,
  validerParametresAnneeComptable,
  type ParametresAnneeComptable,
} from "@/lib/nomenclature";

const septembre: ParametresAnneeComptable = {
  mois: 9,
  jour: 1,
  format: "debut-fin",
};

const depense = {
  typeDepense: "Carburants",
  modePaiement: "Carte bancaire",
  montant: 28.5,
};

function generer(
  format: string,
  surcharge: Partial<Parameters<typeof genererNomsNomenclature>[0]> = {},
) {
  return genererNomsNomenclature({
    format,
    parametresAnnee: septembre,
    date: "2026-03-05",
    branche: "Louveteaux",
    depenses: [depense],
    extensions: ["pdf"],
    ...surcharge,
  });
}

describe("validerFormatNomenclature", () => {
  it("accepte un format valide", () => {
    expect(
      validerFormatNomenclature("{YYYY}-{MM}-{DD} - {Branche} - {Numero}"),
    ).toBeNull();
  });

  it("refuse une variable inconnue", () => {
    expect(validerFormatNomenclature("{Inconnue}")).toMatch(/inconnue/i);
  });

  it("refuse un format sans variable, vide ou trop long", () => {
    expect(validerFormatNomenclature("texte seul")).not.toBeNull();
    expect(validerFormatNomenclature("   ")).not.toBeNull();
    expect(
      validerFormatNomenclature("{Type}" + "a".repeat(120)),
    ).not.toBeNull();
  });

  it("refuse les caractères interdits et les accolades non appariées", () => {
    expect(
      validerFormatNomenclature("{AnneeComptable}/{GlobalNumero}"),
    ).not.toBeNull();
    expect(validerFormatNomenclature("{Type")).not.toBeNull();
  });
});

describe("validerParametresAnneeComptable", () => {
  it("valide les paramètres par défaut", () => {
    expect(validerParametresAnneeComptable(septembre)).toBe(true);
  });

  it("refuse le 29 février, un mois invalide ou un format inconnu", () => {
    expect(
      validerParametresAnneeComptable({ ...septembre, mois: 2, jour: 29 }),
    ).toBe(false);
    expect(validerParametresAnneeComptable({ ...septembre, mois: 13 })).toBe(
      false,
    );
    expect(
      validerParametresAnneeComptable({ ...septembre, format: "autre" }),
    ).toBe(false);
  });
});

describe("année comptable", () => {
  it("rattache les dates aux bornes du 1er septembre", () => {
    expect(anneeComptableDebut("2025-08-31", septembre)).toBe(2024);
    expect(anneeComptableDebut("2025-09-01", septembre)).toBe(2025);
    expect(anneeComptableDebut("2026-01-15", septembre)).toBe(2025);
  });

  it("rend les trois formats d'affichage", () => {
    expect(libelleAnneeComptable(2023, { ...septembre, format: "debut" })).toBe(
      "2023",
    );
    expect(libelleAnneeComptable(2023, { ...septembre, format: "fin" })).toBe(
      "2024",
    );
    expect(libelleAnneeComptable(2023, septembre)).toBe("2023-2024");
  });

  it("n'affiche qu'une année quand l'année comptable commence le 1er janvier", () => {
    const janvier: ParametresAnneeComptable = {
      mois: 1,
      jour: 1,
      format: "debut-fin",
    };
    expect(libelleAnneeComptable(2026, janvier)).toBe("2026");
    expect(libelleAnneeComptable(2026, { ...janvier, format: "fin" })).toBe(
      "2026",
    );
  });
});

describe("genererNomsNomenclature", () => {
  it("remplace les variables et conserve l'extension", () => {
    expect(
      generer("{YYYY}-{MM}-{DD} - {Branche} - {Type} - {Montant} - {Numero}"),
    ).toEqual(["2026-03-05 - Louveteaux - Carburants - 28.50 - 01.pdf"]);
  });

  it("gère l'année comptable et les numéros globaux", () => {
    expect(
      generer("{AnneeComptable} - {GlobalNumeroComptable} - {GlobalNumero}", {
        premierComptable: 13,
        premierGlobal: 42,
      }),
    ).toEqual(["2025-2026 - 013 - 042.pdf"]);
  });

  it("attribue des numéros consécutifs aux pièces d'un envoi", () => {
    const noms = generer("{GlobalNumero} - {Numero}", {
      depenses: [depense, depense],
      extensions: ["pdf", "jpg"],
      premierGlobal: 999,
    });
    expect(noms).toEqual(["999 - 01.pdf", "1000 - 02.jpg"]);
  });

  it("retire un séparateur quand une variable est vide", () => {
    expect(
      generer("{Branche} - {Type} - {Montant}", {
        depenses: [{ ...depense, typeDepense: "" }],
      }),
    ).toEqual(["Louveteaux - 28.50.pdf"]);
    expect(
      generer("{Type} - {Montant}", {
        depenses: [{ ...depense, typeDepense: "" }],
      }),
    ).toEqual(["28.50.pdf"]);
  });

  it("ajoute un suffixe quand deux pièces auraient le même nom", () => {
    expect(
      generer("{YYYY}{MM} - {Type}", {
        depenses: [depense, depense],
        extensions: ["pdf", "pdf"],
      }),
    ).toEqual(["202603 - Carburants - 01.pdf", "202603 - Carburants - 02.pdf"]);
  });

  it("assainit les valeurs et ignore une extension saisie dans le format", () => {
    expect(generer("{Branche}.pdf", { branche: "A/B" })).toEqual(["A-B.pdf"]);
  });

  it("tronque le nom en préservant l'extension", () => {
    const [nom] = generer("{Branche}", { branche: "x".repeat(300) });
    expect(nom.length).toBe(150);
    expect(nom.endsWith(".pdf")).toBe(true);
  });

  it("rejette une date invalide", () => {
    expect(() => generer("{YYYY}", { date: "2026-02-30" })).toThrow(
      "DATE_INVALIDE",
    );
  });
});

describe("calculerReservation", () => {
  it("ne réserve rien sans numéro global", () => {
    expect(calculerReservation("{Numero}", "2026-03-05", 2, septembre)).toEqual(
      { global: 0, comptable: null },
    );
  });

  it("réserve selon l'année comptable de la date du justificatif", () => {
    expect(
      calculerReservation(
        "{GlobalNumero}{GlobalNumeroComptable}",
        "2025-08-31",
        2,
        septembre,
      ),
    ).toEqual({ global: 2, comptable: { annee: 2024, nombre: 2 } });
  });
});
