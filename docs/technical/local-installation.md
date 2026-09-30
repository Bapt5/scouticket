# Installation locale (développement)

## Prérequis

- Node.js 20+
- npm, pnpm, ou bun

## Installation

::: code-group

```bash [npm]
npm install
```

```bash [pnpm]
pnpm install
```

```bash [bun]
bun install
```

:::

## Configuration locale

```bash
cp .env.example .env.local
```

Renseigner ensuite les variables Clerk et SMTP. Le Trésorier de chaque groupe est le membre ayant le rôle `owner`, géré depuis l’application.

Pour tester la note de frais signée (voir [Note de frais signée](/technical/ndf-signee)), renseigner aussi `NDF_SCELLEMENT_P12_BASE64` et `NDF_SCELLEMENT_P12_MOT_DE_PASSE` (valeurs générées par `pnpm ndf:certificat`) et, en local, `PUPPETEER_EXECUTABLE_PATH` (chemin vers un Chrome/Chromium installé sur la machine, voir [Variables d’environnement](/technical/environment-variables#note-de-frais-sign%C3%A9e)).

## Lancement et vérification

::: code-group

```bash [npm]
npm run dev
npm run lint
npm run build
```

```bash [pnpm]
pnpm dev
pnpm lint
pnpm build
```

```bash [bun]
bun run dev
bun run lint
bun run build
```

:::
