import { beforeEach, describe, expect, it, vi } from "vitest";

const { envoyerMailSimule, verifierSimule } = vi.hoisted(() => ({
  envoyerMailSimule: vi.fn().mockResolvedValue({ messageId: "message-1" }),
  verifierSimule: vi.fn().mockResolvedValue(true),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: envoyerMailSimule,
      verify: verifierSimule,
    })),
  },
}));

import { envoyerEmailDepense, envoyerMail } from "@/lib/email";
import { envoyerEmailValidationTresorerie } from "@/lib/treasuryEmail";

const pieceJointe = (nom: string) => ({
  nomAffiche: nom,
  nomFichierOriginal: nom,
  nomFichierNormalise: nom,
  typeMime: nom.endsWith(".pdf") ? "application/pdf" : "image/png",
  donneesBase64: Buffer.from("image").toString("base64"),
});

const dernierMail = () =>
  envoyerMailSimule.mock.calls[envoyerMailSimule.mock.calls.length - 1][0];

const texteDangereux = `<img src=x onerror="alerte()"> & 'test'`;

describe("templates HTML des e-mails", () => {
  beforeEach(() => {
    envoyerMailSimule.mockClear();
    verifierSimule.mockClear();
    process.env.SMTP_FROM = "expediteur@example.test";
    process.env.SMTP_FROM_NAME = "Expéditeur Scouticket";
  });

  it("utilise toujours le nom d’expéditeur SMTP configuré", async () => {
    process.env.SMTP_FROM = "Ancien nom <expediteur@example.test>";

    await envoyerMail({
      to: "destinataire@example.test",
      subject: "Sujet de test",
      text: "Contenu de test",
    });

    expect(envoyerMailSimule).toHaveBeenCalledWith(
      expect.objectContaining({
        from: {
          name: "Expéditeur Scouticket",
          address: "expediteur@example.test",
        },
      }),
    );
  });

  it("échappe toutes les valeurs textuelles de l’e-mail de note de frais", async () => {
    await envoyerEmailDepense({
      typeEnvoi: "depense-groupe",
      emailUtilisateur: texteDangereux,
      date: texteDangereux,
      branche: texteDangereux,
      detailsDepenses: [
        {
          date: texteDangereux,
          description: texteDangereux,
          activite: "",
          modePaiement: texteDangereux,
          lignes: [
            { categorie: texteDangereux, montant: 7 },
            { categorie: "Carburant", montant: 5 },
          ],
        },
      ],
      groupe: texteDangereux,
      couleur: `#123456; background-image: url("${texteDangereux}")`,
      emailTresorerie: "tresorerie@example.test",
      montant: 12,
      piecesJointes: [
        {
          nomAffiche: texteDangereux,
          nomFichierOriginal: texteDangereux,
          nomFichierNormalise: texteDangereux,
          typeMime: "image/png",
          donneesBase64: Buffer.from("image").toString("base64"),
        },
      ],
    });

    const html = envoyerMailSimule.mock.calls[0][0].html as string;
    expect(html).toContain(
      "&lt;img src=x onerror=&quot;alerte()&quot;&gt; &amp; &#39;test&#39;",
    );
    expect(html).not.toContain('<img src=x onerror="alerte()">');
    expect(html).toContain("Détail des dépenses :");
    expect(html).toContain("Sous-total");
    expect(html).toContain("12.00 €");
    expect(html).toContain("background-color: #1E3A8A");
  });

  it("liste chaque catégorie de chaque justificatif dans le texte de l’e-mail", async () => {
    await envoyerEmailDepense({
      typeEnvoi: "depense-groupe",
      emailUtilisateur: "membre@example.test",
      date: "2026-01-01",
      branche: "Groupe",
      emailTresorerie: "tresorerie@example.test",
      montant: 30,
      piecesJointes: [pieceJointe("a.png")],
      detailsDepenses: [
        {
          date: "2026-01-01",
          description: "Courses du camp",
          activite: "",
          modePaiement: "Espèces du groupe",
          lignes: [
            { categorie: "Alimentation, Intendance", montant: 20 },
            { categorie: "Achat Petit Matériel", montant: 10 },
          ],
        },
      ],
    });

    const mail = dernierMail();
    const texte = mail.text as string;
    expect(mail.subject).toContain("Dépense avec moyen de paiement du groupe");
    expect(texte).toContain("- a.png");
    expect(texte).toContain("Date du justificatif : 2026-01-01");
    expect(texte).toContain("Description : Courses du camp");
    expect(texte).toContain("Moyen de paiement : Espèces du groupe");
    expect(texte).toContain("Alimentation, Intendance : 20.00 €");
    expect(texte).toContain("Achat Petit Matériel : 10.00 €");
    expect(texte).toContain("Sous-total : 30.00 €");
    expect(texte).toContain("Total : 30.00 €");
    expect(texte).not.toContain("RIB");
    expect(mail.attachments).toHaveLength(1);
  });

  it("détaille chaque justificatif d’une note de frais et joint le RIB", async () => {
    await envoyerEmailDepense({
      typeEnvoi: "note-de-frais",
      emailUtilisateur: "membre@example.test",
      date: "2026-01-01",
      branche: "Groupe",
      emailTresorerie: "tresorerie@example.test",
      montant: 15,
      piecesJointes: [pieceJointe("a.png"), pieceJointe("b.png")],
      rib: { ...pieceJointe("rib.pdf"), nomFichierNormalise: "RIB - rib.pdf" },
      detailsDepenses: [
        {
          date: "2026-01-01",
          description: "Péage",
          activite: "Week-end",
          modePaiement: "",
          lignes: [{ categorie: "Péage-Parking", montant: 10 }],
        },
        {
          date: "2026-01-02",
          description: "",
          activite: "Camp",
          modePaiement: "",
          lignes: [{ categorie: "Carburant", montant: 5 }],
        },
      ],
    });

    const mail = dernierMail();
    const texte = mail.text as string;
    expect(mail.subject).toContain("Note de frais");
    expect(texte).toContain("Date de la dépense : 2026-01-01");
    expect(texte).toContain("Activité liée : Week-end");
    expect(texte).toContain("Activité liée : Camp");
    expect(texte).toContain("Description : Péage");
    expect(texte).not.toContain("Moyen de paiement");
    expect(texte).toContain("RIB : joint à ce message");
    expect(texte.indexOf("Ventilation par catégorie comptable :")).toBeLessThan(
      texte.indexOf("Total : 15.00 €"),
    );
    expect(texte).toContain("    Péage-Parking : 10.00 €");
    expect(mail.html).toContain("Ventilation par catégorie comptable :");
    expect(
      (mail.attachments as { filename: string }[]).map((p) => p.filename),
    ).toEqual(["a.png", "b.png", "RIB - rib.pdf"]);
  });

  it("signale l’absence de RIB dans une note de frais", async () => {
    await envoyerEmailDepense({
      typeEnvoi: "note-de-frais",
      emailUtilisateur: "membre@example.test",
      date: "2026-01-01",
      branche: "Groupe",
      emailTresorerie: "tresorerie@example.test",
      montant: 5,
      piecesJointes: [pieceJointe("a.png")],
      detailsDepenses: [
        {
          date: "2026-01-01",
          description: "",
          activite: "Camp",
          modePaiement: "",
          lignes: [{ categorie: "Carburant", montant: 5 }],
        },
      ],
    });

    expect(dernierMail().text).toContain("RIB : non fourni");
  });

  it("met en forme, échappe et lie l’e-mail de vérification", async () => {
    await envoyerEmailValidationTresorerie({
      destinataire: "tresorerie@example.test",
      nomGroupe: texteDangereux,
      url: `https://example.test/verifier?nom=${texteDangereux}`,
    });

    const html = envoyerMailSimule.mock.calls[0][0].html as string;
    expect(html).toContain(
      "&lt;img src=x onerror=&quot;alerte()&quot;&gt; &amp; &#39;test&#39;",
    );
    expect(html).toContain('href="https://example.test/verifier?nom=&lt;img');
    expect(html).not.toContain('<img src=x onerror="alerte()">');
    expect(html).toContain("📜 Scouticket");
    expect(html).toContain("Confirmation de la trésorerie");
    expect(html).toContain("Confirmer le rattachement");
    expect(html).toContain("background-color: #1E3A8A");
    expect(html).toContain("background-color: #FBB042");
    expect(html).toContain("Ce lien expire dans 48 heures.");
  });
});
