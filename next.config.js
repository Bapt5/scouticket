/** @type {import('next').NextConfig} */
const versionDeploiement = process.env.GITHUB_SHA || Date.now().toString();
// La version est dans le chemin des assets ML (voir scripts/copier-assets-scanic.mjs) :
// ils peuvent donc être mis en cache durablement, une mise à jour changeant l'URL.
const versionScanicMl = require("scanic-ml/package.json").version;
// « scanic » n'exporte pas son package.json : on lit le fichier directement.
const versionScanic = JSON.parse(
  require("fs").readFileSync(
    require("path").join(
      require("path").dirname(require.resolve("scanic")),
      "..",
      "package.json",
    ),
    "utf8",
  ),
).version;

const nextConfig = {
  // Générées pour être envoyées à OpenObserve durant la release, puis retirées
  // de l'image de production afin de ne jamais exposer le code source.
  productionBrowserSourceMaps: true,
  env: {
    NEXT_PUBLIC_VERSION_DEPLOIEMENT: versionDeploiement,
    NEXT_PUBLIC_SCANIC_ML_VERSION: versionScanicMl,
    NEXT_PUBLIC_SCANIC_VERSION: versionScanic,
  },
  // Turbopack is now default in Next.js 16
  // The webpack config below is for fallback to webpack if needed
  turbopack: {
    // Empty config to silence the migration warning
    // The webpack fallback config below will be used if --webpack flag is passed
  },
  experimental: {
    // 20 Mo de fichiers encodés en Base64 représentent environ 27 Mo de JSON.
    proxyClientMaxBodySize: "30mb",
  },
  async headers() {
    return [
      {
        source: "/assets/:paquet(scanic|scanic-ml)/:version/:fichier",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
  // Désactiver l'export statique pour permettre les API routes
  // output: 'export'
};

module.exports = nextConfig;
