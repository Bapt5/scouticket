import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FormulaireDepense } from "@/components/FormulaireDepense";
import type { UniteGroupe } from "@/lib/group";

const UNITES_TEST: UniteGroupe[] = [
  { id: "farfadets", label: "Farfadets", color: "#6CC24A" },
  {
    id: "pionniers-caravelles",
    label: "Pionniers-Caravelles",
    color: "#E30613",
  },
  { id: "groupe", label: "Groupe", color: "#1E3A8A" },
];

const pieceJointe = {
  nomAffiche: "ticket.jpg",
  typeMime: "image/jpeg",
  donneesBase64: "aGVsbG8=",
  nomFichierOriginal: "ticket.jpg",
  nomFichierNormalise: "ticket.jpg",
};

describe("FormulaireDepense", () => {
  it("met à jour l’unité immédiatement avant sa mémorisation", async () => {
    const utilisateur = userEvent.setup();
    const onChangementUnite = vi.fn();

    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[]}
        emailUtilisateur="test@example.test"
        units={UNITES_TEST}
        treasuryVerified
        onChangementUnite={onChangementUnite}
      />,
    );

    const select = screen.getByLabelText("Unité *");
    await utilisateur.selectOptions(select, "pionniers-caravelles");

    expect(select).toHaveValue("pionniers-caravelles");
    expect(onChangementUnite).toHaveBeenCalledWith("pionniers-caravelles");
  });

  it("rejette une option ajoutée dans le HTML", () => {
    const onChangementUnite = vi.fn();
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[]}
        emailUtilisateur="test@example.test"
        units={UNITES_TEST}
        uniteInitiale="groupe"
        treasuryVerified
        onChangementUnite={onChangementUnite}
      />,
    );

    const select = screen.getByLabelText("Unité *") as HTMLSelectElement;
    const optionFalsifiee = document.createElement("option");
    optionFalsifiee.value = "aeioaifoaieoifa";
    optionFalsifiee.text = "aoaeifoaieeof";
    select.append(optionFalsifiee);

    fireEvent.change(select, { target: { value: optionFalsifiee.value } });

    expect(select).toHaveValue("groupe");
    expect(onChangementUnite).not.toHaveBeenCalled();
    expect(
      screen.getByText("Cette unité n’est pas autorisée pour ce groupe."),
    ).toBeInTheDocument();
  });

  it("signale les champs obligatoires au clic sur envoyer", async () => {
    const utilisateur = userEvent.setup();
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[]}
        emailUtilisateur="test@example.test"
        units={UNITES_TEST}
        treasuryVerified
      />,
    );

    const envoyer = screen.getByRole("button", {
      name: "Envoyer la facture",
    });
    expect(envoyer).toBeEnabled();

    await utilisateur.click(envoyer);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Il manque des informations pour envoyer la facture",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("un justificatif");
    expect(screen.getByText("Sélectionnez une unité.")).toBeInTheDocument();
  });

  it("retire l’erreur d’un champ dès qu’il est corrigé", async () => {
    const utilisateur = userEvent.setup();
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[pieceJointe]}
        emailUtilisateur="test@example.test"
        units={UNITES_TEST}
        uniteInitiale="groupe"
        treasuryVerified
      />,
    );

    await utilisateur.click(
      screen.getByRole("button", { name: "Envoyer la facture" }),
    );
    expect(
      screen.getByText("Sélectionnez un moyen de paiement."),
    ).toBeInTheDocument();

    await utilisateur.selectOptions(
      screen.getByLabelText("Moyen de paiement *"),
      "Carte de procurement",
    );

    expect(
      screen.queryByText("Sélectionnez un moyen de paiement."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Saisissez un montant supérieur à 0 €."),
    ).toBeInTheDocument();
    expect(screen.getByText("Sélectionnez une catégorie.")).toBeInTheDocument();
  });

  it("détaille les erreurs de chaque justificatif et ouvre le premier incomplet", async () => {
    const utilisateur = userEvent.setup();
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[
          pieceJointe,
          { ...pieceJointe, nomAffiche: "ticket-2.jpg" },
        ]}
        emailUtilisateur="test@example.test"
        units={UNITES_TEST}
        uniteInitiale="groupe"
        treasuryVerified
      />,
    );

    await utilisateur.click(
      screen.getByRole("button", { name: "Envoyer la facture" }),
    );

    const alerte = screen.getByRole("alert");
    expect(alerte).toHaveTextContent("le moyen de paiement du justificatif 1");
    expect(alerte).toHaveTextContent(
      "la catégorie de la ligne 1 du justificatif 2",
    );
    expect(alerte).toHaveTextContent(
      "le montant de la ligne 1 du justificatif 2",
    );
  });

  it("n’ouvre qu’un justificatif à la fois", async () => {
    const utilisateur = userEvent.setup();
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[
          pieceJointe,
          { ...pieceJointe, nomAffiche: "ticket-2.jpg" },
        ]}
        emailUtilisateur="test@example.test"
        units={UNITES_TEST}
        treasuryVerified
      />,
    );

    const premier = screen.getByRole("button", { name: /ticket\.jpg/ });
    const second = screen.getByRole("button", { name: /ticket-2\.jpg/ });
    expect(premier).toHaveAttribute("aria-expanded", "true");
    expect(second).toHaveAttribute("aria-expanded", "false");

    await utilisateur.click(second);

    expect(premier).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "true");
  });

  it("ajoute et retire des lignes de catégorie en calculant le total", async () => {
    const utilisateur = userEvent.setup();
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[pieceJointe]}
        emailUtilisateur="test@example.test"
        units={UNITES_TEST}
        uniteInitiale="groupe"
        treasuryVerified
      />,
    );

    // Une seule ligne par défaut, non supprimable
    expect(screen.getAllByLabelText("Montant (€) *")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /Supprimer la ligne/ }),
    ).not.toBeInTheDocument();

    await utilisateur.click(
      screen.getByRole("button", { name: "Ajouter une catégorie" }),
    );
    const montants = screen.getAllByLabelText("Montant (€) *");
    expect(montants).toHaveLength(2);

    await utilisateur.type(montants[0], "12.5");
    await utilisateur.type(montants[1], "7.25");
    expect(screen.getByText("Total du justificatif :")).toHaveTextContent(
      "19.75 €",
    );

    await utilisateur.click(
      screen.getByRole("button", { name: "Supprimer la ligne 2" }),
    );
    expect(screen.getAllByLabelText("Montant (€) *")).toHaveLength(1);
    expect(screen.getByText("Total du justificatif :")).toHaveTextContent(
      "12.50 €",
    );
  });

  it("choisit une catégorie par recherche et affiche sa description", async () => {
    const utilisateur = userEvent.setup();
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[pieceJointe]}
        emailUtilisateur="test@example.test"
        units={UNITES_TEST}
        uniteInitiale="groupe"
        treasuryVerified
      />,
    );

    const categorie = screen.getByRole("combobox", {
      name: "Catégorie comptable *",
    });
    await utilisateur.click(categorie);
    await utilisateur.type(categorie, "bouteille");
    await utilisateur.click(
      screen.getByRole("option", { name: /^Gaz : achat de bouteille/ }),
    );

    expect(categorie).toHaveValue("Gaz : achat de bouteille");
    expect(screen.getByText(/Uniquement bouteilles de gaz/)).toBeVisible();
  });

  it("propose activité liée et RIB, sans moyen de paiement, pour une note de frais", async () => {
    const utilisateur = userEvent.setup();
    render(
      <FormulaireDepense
        typeEnvoi="note-de-frais"
        piecesJointes={[pieceJointe]}
        emailUtilisateur="test@example.test"
        units={UNITES_TEST}
        uniteInitiale="groupe"
        treasuryVerified
      />,
    );

    expect(screen.getByLabelText("Date de la dépense *")).toBeInTheDocument();
    expect(screen.getByLabelText("Activité liée *")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Description (optionnel)"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/RIB pour le remboursement/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Moyen de paiement *")).toBeNull();

    await utilisateur.click(
      screen.getByRole("button", { name: "Envoyer la facture" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "l’activité liée du justificatif 1",
    );
  });

  it("propose moyen de paiement du groupe, sans activité ni RIB, pour une dépense du groupe", () => {
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[pieceJointe]}
        emailUtilisateur="test@example.test"
        units={UNITES_TEST}
        uniteInitiale="groupe"
        treasuryVerified
      />,
    );

    expect(screen.getByLabelText("Date du justificatif *")).toBeInTheDocument();
    const moyen = screen.getByLabelText("Moyen de paiement *");
    expect(moyen).toHaveTextContent("Chèque du groupe");
    expect(screen.queryByLabelText("Activité liée *")).toBeNull();
    expect(screen.queryByLabelText(/RIB/)).toBeNull();
  });
});
