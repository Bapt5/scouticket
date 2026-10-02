// @vitest-environment node
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recupererContexteGroupe: vi.fn(),
  recupererSession: vi.fn(),
  recupererRoleMembre: vi.fn(),
  recupererGroupeActif: vi.fn(),
  query: vi.fn(),
  verifierOrigineRequete: vi.fn(),
}));

vi.mock("@/lib/sessionServeur", () => ({
  recupererContexteGroupe: mocks.recupererContexteGroupe,
  recupererSession: mocks.recupererSession,
}));
vi.mock("@/lib/groupServer", async () => {
  const reel =
    await vi.importActual<typeof import("@/lib/groupServer")>(
      "@/lib/groupServer",
    );
  return {
    ...reel,
    recupererRoleMembre: mocks.recupererRoleMembre,
    recupererGroupeActif: mocks.recupererGroupeActif,
  };
});
vi.mock("@/lib/baseDeDonnees", () => ({ pool: { query: mocks.query } }));
vi.mock("@/lib/api/securiteRequetes", () => ({
  verifierOrigineRequete: mocks.verifierOrigineRequete,
  verifierRateLimit: () => ({ autorise: true }),
  reponseRateLimit: vi.fn(),
}));

import { DELETE, GET, PUT } from "@/app/api/group/parametres/logo/route";

const URL_LOGO = "https://example.test/api/group/parametres/logo";

async function requetePut(fichier?: Buffer) {
  const corps = new FormData();
  if (fichier)
    corps.append("logo", new File([new Uint8Array(fichier)], "l.png"));
  return PUT(new Request(URL_LOGO, { method: "PUT", body: corps }));
}

const pngValide = () =>
  sharp({
    create: {
      width: 300,
      height: 100,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();

describe("/api/group/parametres/logo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recupererContexteGroupe.mockResolvedValue({
      identifiantOrganisation: "org_1",
      identifiantUtilisateur: "user_1",
    });
    mocks.recupererSession.mockResolvedValue({ user: { id: "user_1" } });
    mocks.recupererRoleMembre.mockResolvedValue("admin");
    mocks.recupererGroupeActif.mockResolvedValue({
      parametres: { ndfSigneeActif: true },
    });
    mocks.verifierOrigineRequete.mockReturnValue(null);
    mocks.query.mockResolvedValue({ rows: [] });
  });

  it("refuse un membre non responsable", async () => {
    mocks.recupererRoleMembre.mockResolvedValue("member");
    expect((await requetePut(await pngValide())).status).toBe(403);
    expect(
      (await DELETE(new Request(URL_LOGO, { method: "DELETE" }))).status,
    ).toBe(403);
  });

  it("refuse l'import si les notes de frais signées sont désactivées", async () => {
    mocks.recupererGroupeActif.mockResolvedValue({
      parametres: { ndfSigneeActif: false },
    });
    expect((await requetePut(await pngValide())).status).toBe(409);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("refuse un fichier manquant ou invalide", async () => {
    expect((await requetePut()).status).toBe(400);
    expect((await requetePut(Buffer.from("texte"))).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("enregistre le logo normalisé", async () => {
    const reponse = await requetePut(await pngValide());
    expect(reponse.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0][1][0]).toBe("org_1");
    expect(Buffer.isBuffer(mocks.query.mock.calls[0][1][1])).toBe(true);
  });

  it("supprime le logo", async () => {
    const reponse = await DELETE(new Request(URL_LOGO, { method: "DELETE" }));
    expect(reponse.status).toBe(200);
    expect(mocks.query.mock.calls[0][0]).toContain("ndf_logo = NULL");
  });

  it("GET renvoie 404 sans logo puis le PNG", async () => {
    expect((await GET(new Request(URL_LOGO))).status).toBe(404);
    mocks.query.mockResolvedValueOnce({
      rows: [{ ndf_logo: await pngValide() }],
    });
    const reponse = await GET(new Request(URL_LOGO));
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("Content-Type")).toBe("image/png");
  });
});
