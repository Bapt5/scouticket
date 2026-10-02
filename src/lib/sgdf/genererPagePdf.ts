import type { Browser } from "puppeteer-core";
import puppeteer from "puppeteer-core";
import { journal } from "@/lib/logger";
import {
  construireHtmlNoteDeFrais,
  type NoteDeFraisPourPdf,
} from "@/lib/sgdf/remplirModele";

/**
 * Résout le binaire Chromium à utiliser : en développement/test, le Chrome
 * local de la machine (`PUPPETEER_EXECUTABLE_PATH`, voir SETUP.md) ; sinon
 * (production, fonctions serverless Vercel) le binaire compressé fourni par
 * `@sparticuz/chromium`, sans dépendre d'un LibreOffice/microservice externe.
 */
async function resoudreNavigateur(): Promise<{
  executablePath: string;
  args: string[];
}> {
  const executableLocal = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (executableLocal) return { executablePath: executableLocal, args: [] };

  const { default: chromium } = await import("@sparticuz/chromium");
  return {
    executablePath: await chromium.executablePath(),
    args: chromium.args,
  };
}

let navigateurPartage: Promise<Browser> | null = null;

/** Instance Chromium réutilisée entre les appels (même conteneur/fonction). */
async function navigateur(): Promise<Browser> {
  if (!navigateurPartage) {
    navigateurPartage = (async () => {
      const { executablePath, args } = await resoudreNavigateur();
      return puppeteer.launch({
        executablePath,
        args,
        headless: true,
      });
    })().catch((erreur) => {
      navigateurPartage = null;
      throw erreur;
    });
  }
  return navigateurPartage;
}

/** Rend un document HTML autonome (CSS inline/`<style>`, pas de ressources externes) en PDF. */
export async function rendrePdfDepuisHtml(html: string): Promise<Buffer> {
  const instance = await navigateur();
  const page = await instance.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } catch (erreur) {
    journal.erreur("sgdf.rendu_pdf_echoue", {
      categorie: "note-de-frais-signee",
      erreur,
    });
    throw erreur;
  } finally {
    await page.close();
  }
}

/** Génère la page note de frais (fidèle au template SGDF) en PDF, d'un bloc. */
export async function genererPdfNoteDeFrais(
  donnees: NoteDeFraisPourPdf,
): Promise<Buffer> {
  return rendrePdfDepuisHtml(construireHtmlNoteDeFrais(donnees));
}
