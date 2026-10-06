import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormulaireDepense } from "@/components/FormulaireDepense";
import { FormulaireRecette } from "@/components/FormulaireRecette";
import { SelecteurPosteBudgetaire } from "@/components/SelecteurPosteBudgetaire";
import type { PosteBudgetaire } from "@/lib/budget";
import type { UniteGroupe } from "@/lib/group";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const UNITES: UniteGroupe[] = [
  { id: "groupe", label: "Groupe", color: "#1E3A8A" },
];

const POSTES_DEPENSES: PosteBudgetaire[] = [
  { id: "p-camp", domaine: "depense", label: "Camp" },
  { id: "p-materiel", domaine: "depense", label: "Matériel" },
];
const POSTES_RECETTES: PosteBudgetaire[] = [
  { id: "p-calendrier", domaine: "recette", label: "Calendrier" },
];

const pieceJointe = {
  nomAffiche: "ticket.jpg",
  typeMime: "image/jpeg",
  donneesBase64: "aGVsbG8=",
  nomFichierOriginal: "ticket.jpg",
  nomFichierNormalise: "ticket.jpg",
};

afterEach(() => vi.unstubAllGlobals());

const reponseOk = () =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));

/** Renseigne les champs d'une pièce (hors poste), pour pouvoir envoyer. */
async function remplirPiece(
  utilisateur: ReturnType<typeof userEvent.setup>,
  conteneur: HTMLElement | Document = document,
  options: { moyenPaiement?: boolean; activite?: boolean } = {},
) {
  const portee = within(conteneur as HTMLElement);
  if (options.moyenPaiement)
    await utilisateur.selectOptions(
      portee.getByLabelText("Moyen de paiement *"),
      "Chèque du groupe",
    );
  if (options.activite)
    await utilisateur.type(portee.getByLabelText("Activité liée *"), "Camp");
  await utilisateur.type(portee.getByLabelText("Montant (€) *"), "10");
  const categorie = portee.getByRole("combobox", {
    name: "Catégorie comptable *",
  });
  await utilisateur.click(categorie);
  await utilisateur.type(categorie, "bouteille");
  await utilisateur.click(
    screen.getByRole("option", { name: /^Gaz : achat de bouteille/ }),
  );
}

describe("SelecteurPosteBudgetaire", () => {
  it("liste les postes et transmet le choix", async () => {
    const onChange = vi.fn();
    render(
      <SelecteurPosteBudgetaire
        id="poste"
        postes={POSTES_DEPENSES}
        valeur=""
        onChange={onChange}
      />,
    );

    const select = screen.getByLabelText("Poste budgétaire *");
    expect(
      Array.from((select as HTMLSelectElement).options).map(
        (option) => option.textContent,
      ),
    ).toEqual(["Sélectionner un poste", "Camp", "Matériel"]);
    await userEvent.setup().selectOptions(select, "p-materiel");

    expect(onChange).toHaveBeenCalledWith("p-materiel");
  });

  it("signale l'erreur « poste obligatoire » de façon accessible", () => {
    render(
      <SelecteurPosteBudgetaire
        id="poste"
        postes={POSTES_DEPENSES}
        valeur=""
        onChange={vi.fn()}
        erreur
      />,
    );

    const select = screen.getByLabelText("Poste budgétaire *");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAccessibleDescription(
      "Sélectionnez un poste budgétaire.",
    );
  });
});

describe("FormulaireDepense : poste budgétaire", () => {
  it("n'affiche aucun sélecteur quand le suivi est désactivé", () => {
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[pieceJointe]}
        emailUtilisateur="test@example.test"
        units={UNITES}
        aTresorier
      />,
    );

    expect(screen.queryByLabelText(/Poste budgétaire/)).toBeNull();
  });

  it("propose un poste par justificatif d'une note de frais non signée", () => {
    render(
      <FormulaireDepense
        typeEnvoi="note-de-frais"
        piecesJointes={[
          pieceJointe,
          { ...pieceJointe, nomAffiche: "ticket-2.jpg" },
        ]}
        emailUtilisateur="test@example.test"
        units={UNITES}
        postesBudgetaires={POSTES_DEPENSES}
        aTresorier
      />,
    );

    expect(screen.getAllByLabelText("Poste budgétaire *")).toHaveLength(2);
    expect(document.querySelector("#poste-budgetaire-global")).toBeNull();
  });

  it("liste les postes du domaine dépense dans le sélecteur", () => {
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[pieceJointe]}
        emailUtilisateur="test@example.test"
        units={UNITES}
        postesBudgetaires={POSTES_DEPENSES}
        aTresorier
      />,
    );

    const select = screen.getByLabelText("Poste budgétaire *");
    expect(
      Array.from((select as HTMLSelectElement).options).map(
        (option) => option.textContent,
      ),
    ).toEqual(["Sélectionner un poste", "Camp", "Matériel"]);
  });

  it("exige un poste par justificatif et le signale dans la liste des champs manquants", async () => {
    const utilisateur = userEvent.setup();
    const fetchSimule = reponseOk();
    vi.stubGlobal("fetch", fetchSimule);
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[pieceJointe]}
        emailUtilisateur="test@example.test"
        units={UNITES}
        uniteInitiale="groupe"
        postesBudgetaires={POSTES_DEPENSES}
        aTresorier
      />,
    );
    await remplirPiece(utilisateur, document, { moyenPaiement: true });

    await utilisateur.click(
      screen.getByRole("button", { name: "Déclarer la dépense" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "le poste budgétaire du justificatif 1",
    );
    expect(
      screen.getByText("Sélectionnez un poste budgétaire."),
    ).toBeInTheDocument();
    expect(fetchSimule).not.toHaveBeenCalled();
  });

  it("envoie le poste de chaque justificatif dans expenses[]", async () => {
    const utilisateur = userEvent.setup();
    const fetchSimule = reponseOk();
    vi.stubGlobal("fetch", fetchSimule);
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[pieceJointe]}
        emailUtilisateur="test@example.test"
        units={UNITES}
        uniteInitiale="groupe"
        postesBudgetaires={POSTES_DEPENSES}
        aTresorier
      />,
    );
    await remplirPiece(utilisateur, document, { moyenPaiement: true });
    await utilisateur.selectOptions(
      screen.getByLabelText("Poste budgétaire *"),
      "p-materiel",
    );

    await utilisateur.click(
      screen.getByRole("button", { name: "Déclarer la dépense" }),
    );

    const corps = JSON.parse(fetchSimule.mock.calls[0][1].body as string);
    expect(corps.expenses[0].budgetPostId).toBe("p-materiel");
    expect(corps).not.toHaveProperty("budgetPostId");
  });

  it("envoie un seul poste global pour une note de frais signée", async () => {
    const utilisateur = userEvent.setup();
    const fetchSimule = reponseOk();
    vi.stubGlobal("fetch", fetchSimule);
    render(
      <FormulaireDepense
        typeEnvoi="note-de-frais"
        ndfSigneeActif
        piecesJointes={[pieceJointe]}
        emailUtilisateur="test@example.test"
        units={UNITES}
        uniteInitiale="groupe"
        postesBudgetaires={POSTES_DEPENSES}
        aTresorier
      />,
    );

    // Un seul sélecteur (global), pas un par justificatif.
    expect(screen.getAllByLabelText("Poste budgétaire *")).toHaveLength(1);
    await remplirPiece(utilisateur, document, { activite: true });
    await utilisateur.click(
      screen.getByRole("button", {
        name: "Envoyer la note de frais pour signature",
      }),
    );
    expect(fetchSimule).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("le poste budgétaire");

    await utilisateur.selectOptions(
      screen.getByLabelText("Poste budgétaire *"),
      "p-camp",
    );
    await utilisateur.click(
      screen.getByRole("button", {
        name: "Envoyer la note de frais pour signature",
      }),
    );

    const corps = JSON.parse(fetchSimule.mock.calls[0][1].body as string);
    expect(corps.budgetPostId).toBe("p-camp");
    expect(corps.expenses[0]).not.toHaveProperty("budgetPostId");
  });

  it("n'envoie aucun poste quand le suivi est désactivé", async () => {
    const utilisateur = userEvent.setup();
    const fetchSimule = reponseOk();
    vi.stubGlobal("fetch", fetchSimule);
    render(
      <FormulaireDepense
        typeEnvoi="depense-groupe"
        piecesJointes={[pieceJointe]}
        emailUtilisateur="test@example.test"
        units={UNITES}
        uniteInitiale="groupe"
        aTresorier
      />,
    );
    await remplirPiece(utilisateur, document, { moyenPaiement: true });

    await utilisateur.click(
      screen.getByRole("button", { name: "Déclarer la dépense" }),
    );

    const corps = JSON.parse(fetchSimule.mock.calls[0][1].body as string);
    expect(corps).not.toHaveProperty("budgetPostId");
    expect(corps.expenses[0]).not.toHaveProperty("budgetPostId");
  });
});

describe("FormulaireRecette : poste budgétaire", () => {
  const remplirRecette = async (
    utilisateur: ReturnType<typeof userEvent.setup>,
  ) => {
    await utilisateur.click(screen.getByLabelText("Virement"));
    await utilisateur.type(screen.getByLabelText("Montant (€) *"), "45");
    const categorie = screen.getByRole("combobox", {
      name: "Catégorie comptable *",
    });
    await utilisateur.click(categorie);
    await utilisateur.type(categorie, "Cotisations");
    await utilisateur.click(
      screen.getByRole("option", { name: /^Cotisations SGDF/ }),
    );
  };

  const afficher = (postes?: PosteBudgetaire[]) =>
    render(
      <FormulaireRecette
        emailUtilisateur="test@example.test"
        units={UNITES}
        uniteInitiale="groupe"
        postesBudgetaires={postes}
        aTresorier
        estEnLigne
      />,
    );

  it("n'affiche aucun sélecteur quand le suivi est désactivé", () => {
    afficher();

    expect(screen.queryByLabelText(/Poste budgétaire/)).toBeNull();
  });

  it("liste les postes de recettes et exige un choix", async () => {
    const utilisateur = userEvent.setup();
    const fetchSimule = reponseOk();
    vi.stubGlobal("fetch", fetchSimule);
    afficher(POSTES_RECETTES);
    const select = screen.getByLabelText("Poste budgétaire *");
    expect(
      Array.from((select as HTMLSelectElement).options).map(
        (option) => option.textContent,
      ),
    ).toEqual(["Sélectionner un poste", "Calendrier"]);
    await remplirRecette(utilisateur);

    await utilisateur.click(
      screen.getByRole("button", { name: "Envoyer la recette" }),
    );

    expect(fetchSimule).not.toHaveBeenCalled();
    expect(
      screen.getByText("Sélectionnez un poste budgétaire."),
    ).toBeInTheDocument();
  });

  it("envoie le poste choisi avec la recette", async () => {
    const utilisateur = userEvent.setup();
    const fetchSimule = reponseOk();
    vi.stubGlobal("fetch", fetchSimule);
    afficher(POSTES_RECETTES);
    await remplirRecette(utilisateur);
    await utilisateur.selectOptions(
      screen.getByLabelText("Poste budgétaire *"),
      "p-calendrier",
    );

    await utilisateur.click(
      screen.getByRole("button", { name: "Envoyer la recette" }),
    );

    expect(fetchSimule).toHaveBeenCalledWith(
      "/api/send-recette",
      expect.objectContaining({ method: "POST" }),
    );
    const corps = JSON.parse(fetchSimule.mock.calls[0][1].body as string);
    expect(corps.recette.budgetPostId).toBe("p-calendrier");
  });

  it("n'envoie aucun poste quand le suivi est désactivé", async () => {
    const utilisateur = userEvent.setup();
    const fetchSimule = reponseOk();
    vi.stubGlobal("fetch", fetchSimule);
    afficher();
    await remplirRecette(utilisateur);

    await utilisateur.click(
      screen.getByRole("button", { name: "Envoyer la recette" }),
    );

    const corps = JSON.parse(fetchSimule.mock.calls[0][1].body as string);
    expect(corps.recette).not.toHaveProperty("budgetPostId");
  });
});
