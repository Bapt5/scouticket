// Copie Scanic (paquet scanic) et les assets de son détecteur ML (paquet
// scanic-ml) dans public/ pour les servir depuis notre propre origine, sans CDN
// tiers. Scanic charge son module ML par un import() dynamique que les bundlers
// ne compilent pas (webpackIgnore) : il doit donc être servi tel quel, à côté de
// scanic.js. Voir docs/technical/scan-justificatifs.md.
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

/**
 * Copie `sourceDist` vers public/assets/<nom>/<version>/. La version est dans
 * le chemin : les fichiers sont servis en cache immuable (voir next.config.js)
 * et une mise à jour du paquet change l'URL.
 */
function copierPaquet(nom, fichierPaquet, sourceDist, filtre = () => true) {
  const { version } = JSON.parse(readFileSync(fichierPaquet, "utf8"));
  const dossierAssets = join(racine, "public", "assets", nom);
  const destination = join(dossierAssets, version);
  rmSync(dossierAssets, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  for (const fichier of readdirSync(sourceDist).filter(filtre)) {
    copyFileSync(join(sourceDist, fichier), join(destination, fichier));
  }
  console.log(`Assets ${nom} ${version} copiés vers ${destination}`);
}

// « scanic » n'exporte pas son package.json : on part de son point d'entrée (dist/).
const distScanic = dirname(require.resolve("scanic"));
copierPaquet(
  "scanic",
  join(distScanic, "..", "package.json"),
  distScanic,
  (fichier) => fichier.endsWith(".js"),
);

const packageMl = require.resolve("scanic-ml/package.json");
copierPaquet("scanic-ml", packageMl, join(dirname(packageMl), "dist"));
