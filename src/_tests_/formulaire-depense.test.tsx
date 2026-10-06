import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { FormulaireDepense } from "@/components/FormulaireDepense";
import type { UniteGroupe } from "@/lib/group";
import type { LigneKilometriqueSaisie } from "@/lib/depenses";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

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
        aTresorier
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
        aTresorier
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
        aTresorier
      />,
    );

    const envoyer = screen.getByRole("button", {
      name: "Déclarer la dépense",
    });
    expect(envoyer).toBeEnabled();

    await utilisateur.click(envoyer);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Il manque des informations pour déclarer la dépense",
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
        aTresorier
      />,
    );

    await utilisateur.click(
      screen.getByRole("button", { name: "Déclarer la dépense" }),
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
      screen.getByText("Saisissez un montant non nul (négatif accepté)."),
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
        aTresorier
      />,
    );

    await utilisateur.click(
      screen.getByRole("button", { name: "Déclarer la dépense" }),
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
        aTresorier
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
        aTresorier
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
        aTresorier
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
        aTresorier
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
      screen.getByRole("button", { name: "Envoyer la note de frais" }),
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
        aTresorier
      />,
    );

    expect(screen.getByLabelText("Date du justificatif *")).toBeInTheDocument();
    const moyen = screen.getByLabelText("Moyen de paiement *");
    expect(moyen).toHaveTextContent("Chèque du groupe");
    expect(screen.queryByLabelText("Activité liée *")).toBeNull();
    expect(screen.queryByLabelText(/RIB/)).toBeNull();
  });

  it("propose les moyens de paiement personnalisés du groupe", () => {
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[pieceJointe]}
        emailUtilisateur="test@example.test"
        units={UNITES_TEST}
        moyensPaiement={["Cagnotte en ligne"]}
        uniteInitiale="groupe"
        aTresorier
      />,
    );

    const moyen = screen.getByLabelText("Moyen de paiement *");
    expect(moyen).toHaveTextContent("Cagnotte en ligne");
    expect(moyen).not.toHaveTextContent("Chèque du groupe");
  });

  it("propose la déclaration sans justificatif à un responsable, sans pièce jointe, pour une dépense du groupe", () => {
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[]}
        emailUtilisateur="test@example.test"
        units={UNITES_TEST}
        uniteInitiale="groupe"
        aTresorier
        estAdmin
      />,
    );

    expect(
      screen.getByText(/Je déclare cette dépense sans justificatif/),
    ).toBeInTheDocument();
  });

  it("ne propose pas la déclaration sans justificatif à un simple membre", () => {
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[]}
        emailUtilisateur="test@example.test"
        units={UNITES_TEST}
        uniteInitiale="groupe"
        aTresorier
        estAdmin={false}
      />,
    );

    expect(
      screen.queryByText(/Je déclare cette dépense sans justificatif/),
    ).toBeNull();
  });

  it("ne propose pas la déclaration sans justificatif pour une note de frais", () => {
    render(
      <FormulaireDepense
        typeEnvoi="note-de-frais"
        piecesJointes={[]}
        emailUtilisateur="test@example.test"
        units={UNITES_TEST}
        uniteInitiale="groupe"
        aTresorier
        estAdmin
      />,
    );

    expect(
      screen.queryByText(/Je déclare cette dépense sans justificatif/),
    ).toBeNull();
  });

  it("masque la case dès qu’un justificatif est joint et affiche les champs de la dépense une fois cochée", async () => {
    const utilisateur = userEvent.setup();
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[]}
        emailUtilisateur="test@example.test"
        units={UNITES_TEST}
        uniteInitiale="groupe"
        aTresorier
        estAdmin
      />,
    );

    const case_ = screen.getByRole("checkbox");
    await utilisateur.click(case_);

    expect(screen.getByText("Détails de la dépense")).toBeInTheDocument();
    expect(screen.getByLabelText("Date de la dépense *")).toBeInTheDocument();
    expect(screen.getByLabelText("Moyen de paiement *")).toBeInTheDocument();
  });

  it("envoie withoutReceipt lors de la soumission d’une dépense déclarée sans justificatif", async () => {
    const utilisateur = userEvent.setup();
    const fetchSimule = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: true })));
    vi.stubGlobal("fetch", fetchSimule);

    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[]}
        emailUtilisateur="test@example.test"
        units={UNITES_TEST}
        uniteInitiale="groupe"
        aTresorier
        estAdmin
      />,
    );

    await utilisateur.click(screen.getByRole("checkbox"));
    await utilisateur.selectOptions(
      screen.getByLabelText("Moyen de paiement *"),
      "Chèque du groupe",
    );
    await utilisateur.type(screen.getByLabelText("Montant (€) *"), "10");
    const categorie = screen.getByRole("combobox", {
      name: "Catégorie comptable *",
    });
    await utilisateur.click(categorie);
    await utilisateur.type(categorie, "bouteille");
    await utilisateur.click(
      screen.getByRole("option", { name: /^Gaz : achat de bouteille/ }),
    );
    await utilisateur.click(
      screen.getByRole("button", { name: "Déclarer la dépense" }),
    );

    expect(fetchSimule).toHaveBeenCalledWith(
      "/api/send-expense",
      expect.objectContaining({ method: "POST" }),
    );
    const corps = JSON.parse(fetchSimule.mock.calls[0][1].body as string);
    expect(corps.withoutReceipt).toBe(true);
    expect(corps.attachments).toEqual([]);
    expect(corps.expenses).toHaveLength(1);

    vi.unstubAllGlobals();
  });

  describe("kilomètres", () => {
    const ligneKm = (
      extra: Partial<LigneKilometriqueSaisie> = {},
    ): LigneKilometriqueSaisie => ({
      date: "2026-09-04",
      distanceKm: "100",
      activite: "Camp",
      objet: "Paris - Rambouillet aller-retour",
      ...extra,
    });

    const Hote = ({ initiales }: { initiales: LigneKilometriqueSaisie[] }) => {
      const [lignes, setLignes] = useState(initiales);
      return (
        <FormulaireDepense
          typeEnvoi="note-de-frais"
          piecesJointes={[]}
          emailUtilisateur="test@example.test"
          units={UNITES_TEST}
          uniteInitiale="groupe"
          aTresorier
          ndfSigneeActif
          kilometrages={lignes}
          onKilometragesChange={setLignes}
          kmTaux={0.354}
        />
      );
    };

    it("affiche une section repliable par ligne km avec le montant estimé", () => {
      render(<Hote initiales={[ligneKm()]} />);

      expect(screen.getByText("Kilomètres (1)")).toBeInTheDocument();
      expect(screen.getByText("Complet")).toBeInTheDocument();
      expect(
        screen.getByText(/Total : 100 km, soit 35.40 € au taux de 0.354/),
      ).toBeInTheDocument();
    });

    it("signale une ligne incomplète à l'envoi sans exiger de justificatif", async () => {
      const utilisateur = userEvent.setup();
      render(<Hote initiales={[ligneKm({ objet: "" })]} />);

      await utilisateur.click(
        screen.getByRole("button", {
          name: "Envoyer la note de frais pour signature",
        }),
      );

      const alerte = screen.getByRole("alert");
      expect(alerte).toHaveTextContent("les informations du déplacement 1");
      expect(alerte).not.toHaveTextContent("un justificatif");
    });

    it("envoie les kilomètres avec la note", async () => {
      const utilisateur = userEvent.setup();
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: "refus test" }),
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<Hote initiales={[ligneKm()]} />);

      await utilisateur.click(
        screen.getByRole("button", {
          name: "Envoyer la note de frais pour signature",
        }),
      );

      const corps = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(corps.kilometrages).toEqual([
        {
          date: "2026-09-04",
          distanceKm: 100,
          activite: "Camp",
          objet: "Paris - Rambouillet aller-retour",
        },
      ]);
      expect(corps.expenses).toEqual([]);
      vi.unstubAllGlobals();
    });

    it("supprime une ligne km", async () => {
      const utilisateur = userEvent.setup();
      render(<Hote initiales={[ligneKm()]} />);

      await utilisateur.click(
        screen.getByRole("button", { name: "Supprimer 100 km" }),
      );

      expect(screen.queryByText("Kilomètres (1)")).not.toBeInTheDocument();
    });
  });
});
