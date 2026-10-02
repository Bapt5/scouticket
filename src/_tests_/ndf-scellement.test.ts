// @vitest-environment node
import { createHash } from "node:crypto";
import forge from "node-forge";
import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  preparerPagesSignature,
  signerChamp,
} from "@/lib/ndfSignature/pdfSignature";
import { construireDossierPreuve } from "@/lib/ndfSignature/dossierPreuve";
import { genererCertificatScellementTest } from "@/test/certificatScellement";

const SIGNATAIRES = [
  { etape: "beneficiaire", nom: "Alice Martin" },
  { etape: "responsable", nom: "Bruno Durand" },
  { etape: "tresorier", nom: "Chloé Petit" },
] as const;

async function documentInitial(): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage([595, 842]).drawText("Note de frais");
  await preparerPagesSignature(document, [...SIGNATAIRES]);
  return Buffer.from(await document.save({ useObjectStreams: false }));
}

const dossier = (etape: (typeof SIGNATAIRES)[number]["etape"]) =>
  construireDossierPreuve({
    noteDeFraisId: "ndf-1",
    etape,
    userId: `user-${etape}`,
    nom: "Nom Prénom",
    email: `${etape}@example.org`,
    adresseIp: "203.0.113.42",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) Test/1.0",
    codeEnvoyeLe: new Date("2026-10-01T09:00:00Z"),
    codeVerifieLe: new Date("2026-10-01T09:01:12Z"),
    nombreSaisiesCode: 2,
    documentHash: "a".repeat(64),
    dateVirement: etape === "tresorier" ? "2026-10-02" : null,
  });

/** Signe les 3 étapes ; renvoie le PDF après chaque étape. */
async function signerTout(initial?: Buffer): Promise<Buffer[]> {
  const etapes: Buffer[] = [];
  let pdf = initial ?? (await documentInitial());
  for (const [indice, signataire] of SIGNATAIRES.entries()) {
    pdf = await signerChamp(pdf, {
      etape: signataire.etape,
      nom: signataire.nom,
      lignesDossier: dossier(signataire.etape),
      date: new Date(Date.UTC(2026, 9, 1, 9, indice)),
    });
    etapes.push(pdf);
  }
  return etapes;
}

interface ResultatSignature {
  couvreJusquaLaFin: boolean;
  longueurCouverte: number;
  integre: boolean;
}

/** Coupe l'éventuel remplissage après un élément DER (balise, longueur, contenu). */
function extraireDer(octets: string): string {
  const premierOctetLongueur = octets.charCodeAt(1);
  if (premierOctetLongueur < 0x80)
    return octets.slice(0, 2 + premierOctetLongueur);
  const nombreOctetsLongueur = premierOctetLongueur & 0x7f;
  let longueur = 0;
  for (let i = 0; i < nombreOctetsLongueur; i++)
    longueur = longueur * 256 + octets.charCodeAt(2 + i);
  return octets.slice(0, 2 + nombreOctetsLongueur + longueur);
}

/**
 * Vérifie chaque signature PAdES du PDF sans lire sa structure : le hash des
 * octets couverts par /ByteRange doit être celui du CMS (messageDigest) et la
 * signature RSA des attributs signés doit être valide.
 */
function verifierSignatures(pdf: Buffer): ResultatSignature[] {
  const texte = pdf.toString("latin1");
  const resultats: ResultatSignature[] = [];
  for (const m of texte.matchAll(/\/ByteRange \[(\d+) (\d+) (\d+) (\d+)\]/g)) {
    const [a, b, c, d] = m.slice(1).map(Number);
    const couvert = Buffer.concat([
      pdf.subarray(a, a + b),
      pdf.subarray(c, c + d),
    ]);
    // Le CMS est suivi de zéros de remplissage dans l'espace réservé.
    const p7 = forge.pkcs7.messageFromAsn1(
      forge.asn1.fromDer(
        extraireDer(
          forge.util.hexToBytes(
            pdf.subarray(a + b + 1, c - 1).toString("latin1"),
          ),
        ),
      ),
    ) as forge.pkcs7.PkcsSignedData & {
      rawCapture: {
        authenticatedAttributes: forge.asn1.Asn1[];
        signature: string;
      };
    };
    const attributs = p7.rawCapture.authenticatedAttributes;
    const empreinteAttendue = createHash("sha256").update(couvert).digest();
    const attributEmpreinte = attributs.find(
      (attribut) =>
        forge.asn1.derToOid(
          (attribut.value as forge.asn1.Asn1[])[0].value as string,
        ) === forge.pki.oids.messageDigest,
    )!;
    const empreinteCms = (
      (attributEmpreinte.value as forge.asn1.Asn1[])[1]
        .value as forge.asn1.Asn1[]
    )[0].value as string;
    // Le CMS signe l'encodage DER des attributs sous l'étiquette SET.
    const ensemble = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SET,
      true,
      attributs,
    );
    const empreinteAttributs = forge.md.sha256.create();
    empreinteAttributs.update(forge.asn1.toDer(ensemble).getBytes());
    const signatureValide = (
      p7.certificates[0].publicKey as forge.pki.rsa.PublicKey
    ).verify(empreinteAttributs.digest().getBytes(), p7.rawCapture.signature);
    resultats.push({
      couvreJusquaLaFin: c + d === pdf.length,
      longueurCouverte: c + d,
      integre:
        signatureValide &&
        Buffer.from(empreinteCms, "binary").equals(empreinteAttendue),
    });
  }
  return resultats;
}

/** Modifie un chiffre hexadécimal du texte écrit dans l'apparence de la signature de l'étape. */
function alterer(pdf: Buffer, apresOctet: number): Buffer {
  const copie = Buffer.from(pdf);
  const debut = copie.indexOf("BT /F1 9 Tf", apresOctet, "latin1");
  const position = copie.indexOf("<", debut, "latin1") + 3;
  copie[position] = copie[position] === 0x35 ? 0x36 : 0x35;
  return copie;
}

describe("signatures PAdES cumulatives des notes de frais", () => {
  beforeEach(() => {
    const { p12Base64, motDePasse } = genererCertificatScellementTest();
    vi.stubEnv("NDF_SCELLEMENT_P12_BASE64", p12Base64);
    vi.stubEnv("NDF_SCELLEMENT_P12_MOT_DE_PASSE", motDePasse);
  }, 60_000);

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ajoute chaque signature à la suite, sans modifier les octets précédents", async () => {
    const initial = await documentInitial();
    const etapes = await signerTout(initial);
    expect(etapes[0].subarray(0, initial.length).equals(initial)).toBe(true);
    expect(etapes[1].subarray(0, etapes[0].length).equals(etapes[0])).toBe(
      true,
    );
    expect(etapes[2].subarray(0, etapes[1].length).equals(etapes[1])).toBe(
      true,
    );
  }, 60_000);

  it("produit 3 signatures valides, chacune couvrant tout ce qui précède", async () => {
    const etapes = await signerTout();
    const resultats = verifierSignatures(etapes[2]);
    expect(resultats).toHaveLength(3);
    expect(resultats.every((r) => r.integre)).toBe(true);
    expect(resultats.map((r) => r.longueurCouverte)).toEqual([
      etapes[0].length,
      etapes[1].length,
      etapes[2].length,
    ]);
    expect(resultats[2].couvreJusquaLaFin).toBe(true);
  }, 60_000);

  it("invalide toutes les signatures si le document d'origine est modifié", async () => {
    const etapes = await signerTout();
    const altere = Buffer.from(etapes[2]);
    // Un octet de la page de signature « Signature : Bénéficiaire » du dépôt.
    const position = altere.indexOf("Signature", 0, "latin1");
    altere[position] ^= 0x01;
    expect(verifierSignatures(altere).map((r) => r.integre)).toEqual([
      false,
      false,
      false,
    ]);
  }, 60_000);

  it("n'invalide que la dernière signature si sa propre révision est modifiée", async () => {
    const etapes = await signerTout();
    const altere = alterer(etapes[2], etapes[1].length);
    expect(verifierSignatures(altere).map((r) => r.integre)).toEqual([
      true,
      true,
      false,
    ]);
  }, 60_000);

  it("invalide la signature de la première étape et les suivantes si sa révision est modifiée", async () => {
    const etapes = await signerTout();
    const initial = await documentInitial();
    const altere = alterer(etapes[2], initial.length);
    expect(verifierSignatures(altere).map((r) => r.integre)).toEqual([
      false,
      false,
      false,
    ]);
  }, 60_000);

  it("détecte un ajout après la dernière signature (les signatures restent valides)", async () => {
    const etapes = await signerTout();
    const complete = Buffer.concat([etapes[2], Buffer.from("\n%ajout\n")]);
    const resultats = verifierSignatures(complete);
    expect(resultats.every((r) => r.integre)).toBe(true);
    expect(resultats[2].couvreJusquaLaFin).toBe(false);
  }, 60_000);

  it("refuse de signer deux fois le même champ", async () => {
    const [premiere] = await signerTout();
    await expect(
      signerChamp(premiere, {
        etape: "beneficiaire",
        nom: "Alice Martin",
        lignesDossier: [],
        date: new Date(),
      }),
    ).rejects.toThrow("déjà signé");
  }, 60_000);

  it("échoue clairement si le certificat de scellement est absent", async () => {
    vi.stubEnv("NDF_SCELLEMENT_P12_BASE64", "");
    await expect(
      signerChamp(await documentInitial(), {
        etape: "beneficiaire",
        nom: "Alice Martin",
        lignesDossier: [],
        date: new Date(),
      }),
    ).rejects.toThrow("NDF_SCELLEMENT_P12_BASE64");
  }, 60_000);

  it("accepte les caractères hors WinAnsi sans planter", async () => {
    const pdf = await signerChamp(await documentInitial(), {
      etape: "beneficiaire",
      nom: "Łukasz 山田",
      lignesDossier: ["User-Agent : Test 😀 ł"],
      date: new Date(),
    });
    expect(verifierSignatures(pdf)).toHaveLength(1);
  }, 60_000);

  it("range le dossier de preuve avec identité, réseau et dates du code, sans le code", () => {
    const lignes = dossier("tresorier").join("\n");
    expect(lignes).toContain("tresorier@example.org");
    expect(lignes).toContain("user-tresorier");
    expect(lignes).toContain("203.0.113.42");
    expect(lignes).toContain("Mozilla/5.0");
    expect(lignes).toContain("2026-10-01T09:00:00.000Z");
    expect(lignes).toContain("2026-10-01T09:01:12.000Z");
    expect(lignes).toContain("saisie n° 2");
    expect(lignes).toContain("2026-10-02");
  });
});
