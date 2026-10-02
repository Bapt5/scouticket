// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Faux dépôt en mémoire : aucune base, aucun SMTP, aucun Chromium. */
const bd = vi.hoisted(() => ({
  note: null as Record<string, any> | null,
  pdf: null as Buffer | null,
  /** Paramètres de chaque appel à `signerChamp`, dans l'ordre. */
  appelsSignature: [] as Record<string, any>[],
  signerChamp: vi.fn(),
  codes: [] as Record<string, any>[],
  emails: [] as { type: string; [cle: string]: unknown }[],
  envoiDepense: vi.fn(),
  envoiNomenclature: vi.fn(),
  formatNomenclature: null as string | null,
  utilisateurs: new Map<string, { nom: string; email: string }>(),
  prochainIdCode: 1,
}));

const CODE_CLAIR = "123456";

vi.mock("@/lib/ndfSignature/repository", () => ({
  recupererNoteDeFrais: async () => (bd.note ? { ...bd.note } : null),
  enregistrerPdfSigne: async (
    _id: string,
    pdf: Buffer,
    statutAttendu: string,
    nouveauStatut: string,
  ) => {
    if (bd.note!.statut !== statutAttendu) return false;
    bd.pdf = pdf;
    bd.note!.statut = nouveauStatut;
    return true;
  },
  /** Comme en base : la ligne est supprimée, avec son PDF et ses codes (cascade). */
  cloturerCircuit: async () => {
    bd.note = null;
    bd.pdf = null;
    bd.codes = [];
  },
  recupererPdf: async () => bd.pdf,
  recupererUtilisateur: async (userId: string) =>
    bd.utilisateurs.get(userId) ?? null,
  recupererDernierCode: async (
    id: string,
    etape: string,
    userId: string,
  ): Promise<Record<string, any> | null> =>
    bd.codes
      .filter(
        (c) =>
          c.noteDeFraisId === id && c.etape === etape && c.userId === userId,
      )
      .slice(-1)[0] ?? null,
  incrementerTentativeCode: async (id: number) => {
    bd.codes.find((c) => c.id === id)!.tentatives += 1;
  },
  marquerCodeUtilise: async (id: number) => {
    const code = bd.codes.find((c) => c.id === id)!;
    if (code.utilise) return false;
    code.utilise = true;
    return true;
  },
}));

vi.mock("@/lib/ndfSignature/depot", async () => {
  const { hasherCode } = await import("@/lib/ndfSignature/codesVerification");
  return {
    envoyerCodeVerification: async (
      noteDeFraisId: string,
      etape: string,
      userId: string,
    ) => {
      bd.codes.push({
        id: bd.prochainIdCode++,
        noteDeFraisId,
        etape,
        userId,
        codeHash: hasherCode(CODE_CLAIR),
        expireLe: new Date(Date.now() + 10 * 60_000),
        utilise: false,
        tentatives: 0,
        creeLe: new Date(Date.now() - 30_000),
      });
    },
  };
});

vi.mock("@/lib/emailSignatureNdf", () => ({
  envoyerEmailTourDeSigner: async (p: Record<string, unknown>) => {
    bd.emails.push({ type: "tour", ...p });
  },
  envoyerEmailRefusNoteDeFrais: async (p: Record<string, unknown>) => {
    bd.emails.push({ type: "refus", ...p });
  },
}));

/** Chaque signature « ajoute » son étape au PDF reçu : on voit ainsi ce qui est passé d'une étape à l'autre. */
vi.mock("@/lib/ndfSignature/pdfSignature", () => ({
  signerChamp: (pdf: Buffer, parametres: Record<string, any>) =>
    bd.signerChamp(pdf, parametres),
}));

vi.mock("@/lib/email", () => ({
  envoyerEmailDepense: (donnees: unknown) => bd.envoiDepense(donnees),
}));

vi.mock("@/lib/envoiNomenclature", () => ({
  envoyerAvecNomenclature: (...args: unknown[]) =>
    bd.envoiNomenclature(...args),
}));

vi.mock("@/lib/groupServer", () => ({
  recupererGroupeActif: async () => ({
    nomenclature: {
      depense: { format: bd.formatNomenclature },
      anneeComptable: { mois: 1, jour: 1, format: "AAAA" },
    },
  }),
}));

vi.mock("@/lib/logger", () => ({
  journal: { erreur: vi.fn(), info: vi.fn(), avertissement: vi.fn() },
}));

import { journal } from "@/lib/logger";
import {
  demanderCodeVerification,
  traiterSignature,
} from "@/lib/ndfSignature/signer";

const BENEFICIAIRE = "u-benef";
const APPROBATEUR = "u-appro";
const TRESORIER = "u-tresor";

function nouvelleNote(statut = "en_attente_beneficiaire") {
  bd.note = {
    id: "note-1",
    organizationId: "org-1",
    beneficiaireUserId: BENEFICIAIRE,
    responsableSignataireUserId: APPROBATEUR,
    tresorierSignataireUserId: TRESORIER,
    statut,
    documentHash: "hash-du-document",
    donneesNdf: {
      emailUtilisateur: "benef@example.test",
      date: "2026-09-03",
      branche: "Louveteaux",
      groupe: "Groupe Orsay",
      couleur: "#123456",
      montant: 30,
      emailsTresoriers: ["tresor@example.test"],
      rib: {
        nomAffiche: "rib.pdf",
        typeMime: "application/pdf",
        donneesBase64: "UklC",
        nomFichierOriginal: "rib.pdf",
        nomFichierNormalise: "RIB - Camille.pdf",
      },
      detailsDepenses: [
        {
          date: "2026-09-03",
          modePaiement: "",
          activite: "Camp",
          description: "Train",
          lignes: [
            {
              categorie: "Remboursement via Ndf frais de transport",
              montant: 20,
            },
          ],
        },
        {
          date: "2026-09-04",
          modePaiement: "",
          activite: "Camp",
          description: "Courses",
          lignes: [
            { categorie: "Alimentation, Intendance", montant: 6 },
            { categorie: "Formation", montant: 4 },
          ],
        },
      ],
    },
  };
  bd.pdf = Buffer.from("pdf-original");
}

const contexte = { adresseIp: "203.0.113.7", userAgent: "vitest" };

async function signer(
  userId: string,
  options: Partial<Parameters<typeof traiterSignature>[0]> = {},
) {
  await demanderCodeVerification("note-1", userId);
  return traiterSignature({
    noteDeFraisId: "note-1",
    userId,
    decision: "signee",
    code: CODE_CLAIR,
    ...contexte,
    ...options,
  });
}

async function parcourirJusquauTresorier() {
  expect(await signer(BENEFICIAIRE)).toEqual({
    type: "ok",
    nouveauStatut: "en_attente_responsable",
  });
  expect(await signer(APPROBATEUR)).toEqual({
    type: "ok",
    nouveauStatut: "en_attente_tresorier",
  });
}

beforeEach(() => {
  bd.appelsSignature = [];
  bd.signerChamp
    .mockReset()
    .mockImplementation(
      async (pdf: Buffer, parametres: Record<string, any>) => {
        bd.appelsSignature.push(parametres);
        return Buffer.from(`${pdf.toString()}+${parametres.etape}`);
      },
    );
  bd.codes = [];
  bd.emails = [];
  bd.prochainIdCode = 1;
  bd.formatNomenclature = null;
  bd.envoiDepense.mockReset().mockResolvedValue({ success: true });
  bd.envoiNomenclature.mockReset().mockResolvedValue({ success: true });
  bd.utilisateurs = new Map([
    [BENEFICIAIRE, { nom: "Camille Martin", email: "benef@example.test" }],
    [APPROBATEUR, { nom: "Alex Dupont", email: "appro@example.test" }],
    [TRESORIER, { nom: "Jordan Petit", email: "tresor@example.test" }],
  ]);
  nouvelleNote();
});

describe("circuit de signature complet", () => {
  it("fait signer bénéficiaire, approbateur puis trésorier, et envoie une dépense de groupe", async () => {
    await parcourirJusquauTresorier();

    expect(bd.emails.map((e) => [e.type, e.etape, e.destinataire])).toEqual([
      ["tour", "responsable", "appro@example.test"],
      ["tour", "tresorier", "tresor@example.test"],
    ]);
    // Le RIB part avec l'invitation du trésorier, pas avec celle de l'approbateur.
    expect(bd.emails[0].rib).toBeUndefined();
    expect(bd.emails[1].rib).toMatchObject({
      nomFichierNormalise: "RIB - Camille.pdf",
    });

    expect(await signer(TRESORIER, { dateVirement: "2026-09-30" })).toEqual({
      type: "ok",
      nouveauStatut: "validee",
    });

    // Rien ne reste en base : ni la note, ni le PDF, ni les codes.
    expect(bd.note).toBeNull();
    expect(bd.pdf).toBeNull();
    expect(bd.codes).toHaveLength(0);
    expect(journal.info).toHaveBeenCalledWith("ndf_signee.cloturee", {
      categorie: "note-de-frais-signee",
      details: { noteDeFraisId: "note-1", issue: "validee" },
    });

    expect(bd.envoiNomenclature).not.toHaveBeenCalled();
    expect(bd.envoiDepense).toHaveBeenCalledTimes(1);
    const envoi = bd.envoiDepense.mock.calls[0][0];
    expect(envoi).toMatchObject({
      typeEnvoi: "depense-groupe",
      libelleTypeAffiche: "Note de frais",
      emailUtilisateur: "benef@example.test",
      date: "2026-09-30",
      montant: 30,
      groupe: "Groupe Orsay",
      emailsTresoriers: ["tresor@example.test"],
    });
    expect(envoi.rib).toBeUndefined();
    expect(envoi.piecesJointes).toHaveLength(1);
    expect(envoi.piecesJointes[0]).toMatchObject({
      typeMime: "application/pdf",
    });
    expect(
      Buffer.from(envoi.piecesJointes[0].donneesBase64, "base64").toString(),
    ).toBe("pdf-original+beneficiaire+responsable+tresorier");
    expect(envoi.detailsDepenses).toHaveLength(1);
    expect(envoi.detailsDepenses[0]).toMatchObject({
      modePaiement: "Virement du groupe",
      lignes: [
        { categorie: "Remboursement via Ndf frais de transport", montant: 20 },
        { categorie: "Alimentation, Intendance", montant: 6 },
        { categorie: "Formation", montant: 4 },
      ],
    });
  });

  it("applique la nomenclature du groupe à l'envoi final quand elle est configurée", async () => {
    bd.formatNomenclature = "{Annee}-{Global}";
    await parcourirJusquauTresorier();
    await signer(TRESORIER, { dateVirement: "2026-09-30" });

    expect(bd.envoiDepense).not.toHaveBeenCalled();
    expect(bd.envoiNomenclature).toHaveBeenCalledTimes(1);
    const [donnees, organisation, format] = bd.envoiNomenclature.mock.calls[0];
    expect(donnees.typeEnvoi).toBe("depense-groupe");
    expect(donnees.libelleTypeAffiche).toBe("Note de frais");
    expect(organisation).toBe("org-1");
    expect(format).toBe("{Annee}-{Global}");
  });

  it("signe chaque étape sur le PDF signé par l'étape précédente", async () => {
    await parcourirJusquauTresorier();
    await signer(TRESORIER, { dateVirement: "2026-09-30" });

    expect(bd.appelsSignature.map((a) => a.etape)).toEqual([
      "beneficiaire",
      "responsable",
      "tresorier",
    ]);
    expect(bd.signerChamp.mock.calls.map(([pdf]) => pdf.toString())).toEqual([
      "pdf-original",
      "pdf-original+beneficiaire",
      "pdf-original+beneficiaire+responsable",
    ]);
    expect(bd.appelsSignature.map((a) => a.nom)).toEqual([
      "Camille Martin",
      "Alex Dupont",
      "Jordan Petit",
    ]);
  });

  it("met la preuve d'identité de chaque signataire dans son dossier signé", async () => {
    await parcourirJusquauTresorier();
    await signer(TRESORIER, { dateVirement: "2026-09-30" });

    const dossiers = bd.appelsSignature.map((a) => a.lignesDossier.join("\n"));
    const attendus = [
      [BENEFICIAIRE, "benef@example.test"],
      [APPROBATEUR, "appro@example.test"],
      [TRESORIER, "tresor@example.test"],
    ];
    attendus.forEach(([userId, email], i) => {
      expect(dossiers[i]).toContain(userId);
      expect(dossiers[i]).toContain(email);
      expect(dossiers[i]).toContain("203.0.113.7");
      expect(dossiers[i]).toContain("vitest");
      expect(dossiers[i]).toContain("hash-du-document");
      expect(dossiers[i]).toContain("saisie n° 1");
      expect(dossiers[i]).not.toContain(CODE_CLAIR);
    });
    expect(dossiers[0]).not.toContain("virement");
    expect(dossiers[2]).toContain("Date du virement : 2026-09-30");
  });
});

describe("refus", () => {
  it.each([
    ["beneficiaire", BENEFICIAIRE, 0],
    ["responsable", APPROBATEUR, 1],
    ["tresorier", TRESORIER, 2],
  ] as const)(
    "annule tout le circuit quand le %s refuse",
    async (etape, userId, avant) => {
      if (avant >= 1) await signer(BENEFICIAIRE);
      if (avant >= 2) await signer(APPROBATEUR);

      expect(
        await signer(userId, {
          decision: "refusee",
          motifRefus: "Montant faux",
        }),
      ).toEqual({ type: "ok", nouveauStatut: "refusee" });

      expect(bd.note).toBeNull();
      expect(bd.pdf).toBeNull();
      expect(bd.codes).toHaveLength(0);
      expect(journal.info).toHaveBeenCalledWith("ndf_signee.cloturee", {
        categorie: "note-de-frais-signee",
        details: { noteDeFraisId: "note-1", issue: "refusee", etape },
      });
      expect(bd.envoiDepense).not.toHaveBeenCalled();
      // Un refus n'appose aucune signature supplémentaire.
      expect(bd.appelsSignature).toHaveLength(avant);
      expect(bd.emails.slice(-1)[0]).toMatchObject({
        type: "refus",
        destinataire: "benef@example.test",
        etape,
        motif: "Montant faux",
      });
    },
  );

  it("ne permet plus aucune signature après un refus", async () => {
    await signer(BENEFICIAIRE, { decision: "refusee" });
    expect(await signer(APPROBATEUR)).toEqual({ type: "introuvable" });
  });
});

describe("contrôles d'accès et d'ordre", () => {
  it("refuse un utilisateur qui n'est pas le signataire attendu", async () => {
    expect(await signer(APPROBATEUR)).toEqual({ type: "non_autorise" });
    expect(await signer("u-inconnu")).toEqual({ type: "non_autorise" });
    expect(bd.note!.statut).toBe("en_attente_beneficiaire");
    expect(bd.appelsSignature).toHaveLength(0);
  });

  it("refuse le bénéficiaire quand c'est le tour de l'approbateur", async () => {
    await signer(BENEFICIAIRE);
    expect(await signer(BENEFICIAIRE)).toEqual({ type: "non_autorise" });
  });

  it("répond introuvable pour une note inexistante", async () => {
    bd.note = null;
    expect(await signer(BENEFICIAIRE)).toEqual({ type: "introuvable" });
    expect(await demanderCodeVerification("note-1", BENEFICIAIRE)).toEqual({
      type: "introuvable",
    });
  });

  it("répond introuvable une fois le circuit terminé, la note ayant été supprimée", async () => {
    await parcourirJusquauTresorier();
    await signer(TRESORIER, { dateVirement: "2026-09-30" });
    expect(bd.note).toBeNull();
    expect(await signer(TRESORIER)).toEqual({ type: "introuvable" });
    expect(await demanderCodeVerification("note-1", TRESORIER)).toEqual({
      type: "introuvable",
    });
  });
});

describe("code de vérification", () => {
  it("compte les saisies ratées dans le dossier de preuve", async () => {
    await demanderCodeVerification("note-1", BENEFICIAIRE);
    const essayer = (code: string) =>
      traiterSignature({
        noteDeFraisId: "note-1",
        userId: BENEFICIAIRE,
        decision: "signee",
        code,
        ...contexte,
      });
    await essayer("000000");
    await essayer("111111");
    expect(await essayer(CODE_CLAIR)).toMatchObject({ type: "ok" });
    expect(bd.appelsSignature[0].lignesDossier.join("\n")).toContain(
      "saisie n° 3",
    );
  });

  it("ne consomme pas le code si la signature du PDF échoue", async () => {
    await demanderCodeVerification("note-1", BENEFICIAIRE);
    bd.signerChamp.mockRejectedValueOnce(new Error("certificat absent"));
    await expect(
      traiterSignature({
        noteDeFraisId: "note-1",
        userId: BENEFICIAIRE,
        decision: "signee",
        code: CODE_CLAIR,
        ...contexte,
      }),
    ).rejects.toThrow("certificat absent");
    expect(bd.codes[0].utilise).toBe(false);
    expect(bd.note!.statut).toBe("en_attente_beneficiaire");
    expect(bd.pdf!.toString()).toBe("pdf-original");

    // Le même code permet de réessayer.
    expect(
      await traiterSignature({
        noteDeFraisId: "note-1",
        userId: BENEFICIAIRE,
        decision: "signee",
        code: CODE_CLAIR,
        ...contexte,
      }),
    ).toMatchObject({ type: "ok" });
  });

  it("refuse la seconde de deux soumissions simultanées avec le même code", async () => {
    await demanderCodeVerification("note-1", BENEFICIAIRE);
    const soumettre = () =>
      traiterSignature({
        noteDeFraisId: "note-1",
        userId: BENEFICIAIRE,
        decision: "signee",
        code: CODE_CLAIR,
        ...contexte,
      });
    const [premiere, seconde] = await Promise.all([soumettre(), soumettre()]);
    expect([premiere.type, seconde.type].sort()).toEqual([
      "code_non_demande",
      "ok",
    ]);
    expect(bd.note!.statut).toBe("en_attente_responsable");
  });

  it("exige qu'un code ait été demandé", async () => {
    expect(
      await traiterSignature({
        noteDeFraisId: "note-1",
        userId: BENEFICIAIRE,
        decision: "signee",
        code: CODE_CLAIR,
        ...contexte,
      }),
    ).toEqual({ type: "code_non_demande" });
  });

  it("refuse un mauvais code et compte les tentatives jusqu'au blocage", async () => {
    await demanderCodeVerification("note-1", BENEFICIAIRE);
    const essayer = (code: string) =>
      traiterSignature({
        noteDeFraisId: "note-1",
        userId: BENEFICIAIRE,
        decision: "signee",
        code,
        ...contexte,
      });

    for (let i = 0; i < 5; i++)
      expect(await essayer("000000")).toEqual({ type: "code_invalide" });
    expect(bd.codes[0].tentatives).toBe(5);
    expect(await essayer(CODE_CLAIR)).toEqual({ type: "trop_de_tentatives" });
    expect(bd.appelsSignature).toHaveLength(0);
  });

  it("refuse un code expiré", async () => {
    await demanderCodeVerification("note-1", BENEFICIAIRE);
    bd.codes[0].expireLe = new Date(Date.now() - 1000);
    expect(
      await traiterSignature({
        noteDeFraisId: "note-1",
        userId: BENEFICIAIRE,
        decision: "signee",
        code: CODE_CLAIR,
        ...contexte,
      }),
    ).toEqual({ type: "code_expire" });
  });

  it("ne peut servir qu'une seule fois", async () => {
    await signer(BENEFICIAIRE);
    // Même utilisateur, même code : la note a avancé, le code est consommé.
    expect(bd.codes[0].utilise).toBe(true);
    bd.note!.statut = "en_attente_beneficiaire";
    expect(
      await traiterSignature({
        noteDeFraisId: "note-1",
        userId: BENEFICIAIRE,
        decision: "signee",
        code: CODE_CLAIR,
        ...contexte,
      }),
    ).toEqual({ type: "code_non_demande" });
  });

  it("exige la date du virement au trésorier sans consommer son code", async () => {
    await parcourirJusquauTresorier();
    await demanderCodeVerification("note-1", TRESORIER);
    expect(
      await traiterSignature({
        noteDeFraisId: "note-1",
        userId: TRESORIER,
        decision: "signee",
        code: CODE_CLAIR,
        ...contexte,
      }),
    ).toEqual({ type: "date_virement_requise" });
    expect(bd.appelsSignature).toHaveLength(2);
    expect(bd.codes.slice(-1)[0]!.utilise).toBe(false);
    expect(bd.note!.statut).toBe("en_attente_tresorier");
    expect(bd.envoiDepense).not.toHaveBeenCalled();
  });

  it("n'exige pas de date de virement pour un refus du trésorier", async () => {
    await parcourirJusquauTresorier();
    expect(await signer(TRESORIER, { decision: "refusee" })).toEqual({
      type: "ok",
      nouveauStatut: "refusee",
    });
  });
});
