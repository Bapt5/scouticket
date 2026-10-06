import forge from "node-forge";

/**
 * Certificat de scellement de test (PKCS#12 auto-signé), généré à la volée :
 * aucune clé n'est versionnée. Mis en cache pour tout le fichier de test (la
 * génération d'une clé RSA 2048 en JavaScript prend quelques secondes).
 */
let cache: { p12Base64: string; motDePasse: string } | null = null;

export function genererCertificatScellementTest(): {
  p12Base64: string;
  motDePasse: string;
} {
  if (cache) return cache;
  const motDePasse = "mot-de-passe-test";
  const cles = forge.pki.rsa.generateKeyPair({ bits: 2048 });
  const certificat = forge.pki.createCertificate();
  certificat.publicKey = cles.publicKey;
  certificat.serialNumber = "01";
  certificat.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  certificat.validity.notAfter = new Date(Date.now() + 24 * 3600 * 1000);
  const identite = [{ name: "commonName", value: "Scoutreso (test)" }];
  certificat.setSubject(identite);
  certificat.setIssuer(identite);
  certificat.sign(cles.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(
    cles.privateKey,
    [certificat],
    motDePasse,
    { algorithm: "3des" },
  );
  cache = {
    p12Base64: Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary").toString(
      "base64",
    ),
    motDePasse,
  };
  return cache;
}
