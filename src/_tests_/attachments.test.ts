import { describe, expect, it } from "vitest";
import { assainirSegmentNomFichier, devinerExtension } from "@/lib/attachments";

describe("assainirSegmentNomFichier", () => {
  it("remplace les caractères interdits et compacte les espaces", () => {
    expect(assainirSegmentNomFichier('  a/b:c  "d" ')).toBe("a-b-c -d-");
  });
});

describe("devinerExtension", () => {
  it("privilégie le type MIME, puis l'extension du nom, sinon bin", () => {
    expect(devinerExtension("application/pdf", "x.doc")).toBe("pdf");
    expect(devinerExtension("application/x-inconnu", "Photo.JPG")).toBe("jpg");
    expect(devinerExtension("application/x-inconnu", "sans-extension")).toBe(
      "bin",
    );
  });
});
