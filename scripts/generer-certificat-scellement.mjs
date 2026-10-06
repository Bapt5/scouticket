// Génère le certificat de scellement des notes de frais signées : un certificat
// X.509 auto-signé (clé RSA 2048) dans un fichier PKCS#12, utilisé pour signer
// électroniquement le PDF à chaque étape du circuit (voir
// docs/technical/ndf-signee.md).
//
// Usage : pnpm ndf:certificat ["Nom de l'organisation"]
//
// La clé n'est jamais écrite sur disque : les valeurs à renseigner dans les
// variables d'environnement sont affichées, ainsi que l'empreinte SHA-256 du
// certificat, à publier pour que chacun puisse vérifier qu'une signature vient
// bien de ce certificat.
import { createHash, randomBytes } from "node:crypto";
import forge from "node-forge";

const organisation = process.argv[2]?.trim() || "Scoutreso";
const motDePasse = randomBytes(24).toString("base64url");

const cles = forge.pki.rsa.generateKeyPair({ bits: 2048 });
const certificat = forge.pki.createCertificate();
certificat.publicKey = cles.publicKey;
certificat.serialNumber = `01${forge.util.bytesToHex(forge.random.getBytesSync(8))}`;
certificat.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
certificat.validity.notAfter = new Date(
  Date.now() + 10 * 365 * 24 * 3600 * 1000,
);
const identite = [
  {
    name: "commonName",
    value: `${organisation} (signature des notes de frais)`,
  },
  { name: "organizationName", value: organisation },
  { name: "countryName", value: "FR" },
];
certificat.setSubject(identite);
certificat.setIssuer(identite);
certificat.setExtensions([
  { name: "basicConstraints", cA: false },
  { name: "keyUsage", digitalSignature: true, nonRepudiation: true },
]);
certificat.sign(cles.privateKey, forge.md.sha256.create());

// 3DES : seul algorithme de chiffrement PKCS#12 que node-forge sait relire.
const p12 = forge.pkcs12.toPkcs12Asn1(
  cles.privateKey,
  [certificat],
  motDePasse,
  {
    algorithm: "3des",
  },
);
const p12Base64 = Buffer.from(
  forge.asn1.toDer(p12).getBytes(),
  "binary",
).toString("base64");
const empreinte = createHash("sha256")
  .update(
    Buffer.from(
      forge.asn1.toDer(forge.pki.certificateToAsn1(certificat)).getBytes(),
      "binary",
    ),
  )
  .digest("hex");

console.log(
  "# À renseigner dans les variables d'environnement (secret, ne pas versionner) :",
);
console.log(`NDF_SCELLEMENT_P12_BASE64=${p12Base64}`);
console.log(`NDF_SCELLEMENT_P12_MOT_DE_PASSE=${motDePasse}`);
console.log("");
console.log("# Empreinte SHA-256 du certificat, à publier (non secrète) :");
console.log(empreinte);
console.log("");
console.log(
  `# Valide jusqu'au ${certificat.validity.notAfter.toISOString().slice(0, 10)}.`,
);
