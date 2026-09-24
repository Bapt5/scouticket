# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Scouticket: a Next.js 16 (App Router) app that lets scout group members send expense receipts to their treasurer by email. No receipt storage: uploaded files are only ever emailed, never persisted server-side. French-language codebase — see "Conventions" below.

## Commands

```bash
pnpm install               # install deps (pnpm, see packageManager in package.json)
pnpm dev                   # dev server
pnpm build                 # production build
pnpm test                  # run tests once (vitest)
pnpm test:watch            # vitest watch mode
pnpm lint                  # eslint --max-warnings 0
pnpm format                # prettier --write
pnpm format:check
pnpm type                  # tsc --noEmit
pnpm validate               # lint && type && test && build — run before considering work done
```

Run a single test file: `pnpm vitest run src/_tests_/<name>.test.ts` (or drop `run` for watch mode on that file). Test files live under `src/_tests_/**/*.{test,spec}.{ts,tsx}` (see `vitest.config.ts`); setup file is `src/test/setup.ts`, environment is `jsdom`.

DB migrations: `pnpm db:migrate` (runs `scripts/migrate-base-de-donnees.mjs` against files in `sql/`). Auth schema migrations: `pnpm auth:migrate` (Better Auth CLI).

Docker: `docker compose up --build --wait` starts the app + PostgreSQL; then `docker compose exec app pnpm auth:migrate && docker compose exec app pnpm db:migrate`.

Docs site (VitePress, in `docs/`): `pnpm docs:dev`, `pnpm docs:build`, `pnpm docs:preview`.

Before finishing any task: run `pnpm format`, `pnpm type`, and `pnpm build`.

## Architecture

- **Auth is Better Auth**, not Clerk — despite what older docs may say, `src/lib/auth.ts` (server) and `src/lib/auth-client.ts` (client) configure it. It also owns multi-tenant organizations (= scout groups), members, roles (owner/admin/member) and invitations. The Better Auth API route is the catch-all `src/app/api/auth/[...all]/route.ts`.
- **`src/proxy.ts`** is the Next.js middleware (not `middleware.ts`). It handles maintenance-mode short-circuiting, redirecting unauthenticated users to `/sign-in` with a `callbackURL`, and gating `/invitation`. Its `matcher` config determines which routes it runs on.
- **Data split**: Better Auth owns users/organizations/members/invitations in PostgreSQL. App-specific data lives in two extra tables written directly by API routes: `scouticket_group_data` (treasury email, units/"unités", validation state, group settings such as receipt scanning — see `src/lib/group.ts` / `groupServer.ts` / `parametresGroupe.ts`) and `scouticket_user_default_group` (per-user last-used/primary group).
- **No receipt persistence**: expense submission (`src/app/api/send-expense/`) builds an email with attachments (`src/lib/attachments.ts`, `src/lib/email.ts`) and sends it via Nodemailer/SMTP directly; files are never written to disk or DB.
- **API routes must use `executerRouteAvecLogs`** from `src/lib/api/routeAvecLogs.ts` to wrap their handler — it adds structured logging (via `src/lib/logger`), an `X-Request-Id` header, and consistent 4xx/5xx logging with the resolved session's user id. New routes should follow this pattern.
- **Treasury validation gate**: no expense can be sent until the treasurer confirms their email address (`src/lib/treasuryVerification.ts`, `src/lib/treasuryEmail.ts`, route group `src/app/verify-treasury/`). See the sequence diagram in `docs/technical/overview.md` for the full account/group/invitation flow.
- **Audit logging**: sensitive Better Auth events (login, signup, password, org/invitation actions) are logged as JSON to stdout with `utilisateur`/`organisation` fields AES-256-GCM-encrypted using `AUDIT_LOG_SECRET` (`src/lib/auditAuthentification.ts`). Same encryption scheme is used for optional OpenObserve RUM user identifiers.
- **Route groups**: `(auth)` = sign-in/forgot-password/reset-password pages; `(main)` = the authenticated app shell including `gestion-membres` (member management), `gestion-unites` (unit management) and `parametres-groupe` (group settings, e.g. Scanic receipt scanning — see `docs/technical/scan-justificatifs.md`), all owner/admin-only.
- **PWA**: service worker registration only happens client-side in a `useEffect` (`src/components/register-sw.tsx`) and only in a secure context. Each deploy must ship a distinct SW version, invalidate old caches, and reload clients on `controllerchange`. API routes and pages must never be cached by the SW — see `docs/technical` for details before touching this.

## Bonnes pratiques à respecter

- **Une branche par fonctionnalité** : créer une branche dédiée (ex. `feat/...`, `fix/...`) pour chaque fonctionnalité ou correctif plutôt que de committer directement sur `main`. La branche est fusionnée en _squash_ lors du merge, pour garder un historique `main` propre avec un seul commit par fonctionnalité.
- **Sobriété technique** : privilégier des frameworks et outils largement connus et documentés (déjà le cas ici : Next.js, TypeScript, PostgreSQL) plutôt que des choix de niche, pour que n'importe quel contributeur puisse reprendre le code facilement. Favoriser les applications web plutôt que les clients lourds/apps natives, et limiter autant que possible l'état côté serveur.
- **Données personnelles et RGPD** : ne jamais traiter de données sensibles au sens de l'article 9 du RGPD (santé, origine, opinions, etc.). Toute conservation de données personnelles doit rester minimale, justifiée, auditée et assortie d'une politique de rétention claire ; les mineurs ne doivent pas voir leurs données personnelles collectées ou conservées. C'est cohérent avec le principe déjà en place ici de ne jamais stocker les justificatifs (uniquement transmis par e-mail).
- **Intégration de services externes** : tout nouveau service tiers (e-mail, IA, analytics, stockage, etc.) doit être documenté (variables d'environnement dans `SETUP.md`/`docs/technical/environment-variables.md`, usage précisé dans `docs/technical/`) avant d'être branché.
- **Observabilité et sauvegardes** : maintenir un plan d'observabilité (logs structurés, métriques, alertes — déjà en place via `src/lib/logger` et OpenObserve) et s'assurer que les données PostgreSQL critiques restent sauvegardables/restaurables (volume `postgres_data` en Docker).
- **Git et commits** : suivre la notation [Conventional Commits](https://www.conventionalcommits.org/) (déjà appliqué via `feat:`, `fix:`, `chore:`…) pour permettre une génération automatique du changelog et du versioning sémantique.
- **Dépôt de code** : garder le dépôt privé par défaut pour limiter l'exposition aux vulnérabilités ; n'activer une visibilité publique des tickets/issues que pour faciliter les remontées utilisateur, sans exposer le code source lui-même.
- **Environnement de développement homogène** : si un fichier `.editorconfig` est ajouté, le respecter (indentation, fin de ligne, encodage) pour garantir un formatage cohérent entre contributeurs, en complément de Prettier/ESLint déjà en place.
- **Versions des runtimes** : utiliser des versions LTS de Node.js (voir la politique de release officielle de Node.js) plutôt que des versions expérimentales, et les tenir à jour.
- **Images Docker** : préférer des images de base durcies (« hardened »/minimales) plutôt que des images standard non maintenues, pour réduire la surface d'attaque du conteneur de production.

## Conventions (see `AGENTS.md` for the full French-language policy)

- Identifiers, comments, and user-facing strings are French (`montantTotal`, `envoyerFacture`, `FactureFormulaire`), except terms imposed by frameworks/libraries (`useState`, `onClick`, `className`, external types).
- Prefer reusing existing code over adding new abstractions; keep changes minimal.
- New UI components go in `src/components/` (barrel `index.ts` if needed); server logic goes in `src/app/api/` or `src/lib/`, kept out of the client bundle.
- Style with Tailwind utility classes directly in JSX; preserve the existing dark-mode/glassmorphism aesthetic. Avoid custom CSS files.
- Commits: Conventional Commits in French (`feat:`, `fix:`, `chore:`…).
- When adding env vars, update `SETUP.md` and `docs/technical/environment-variables.md`. When UI changes affect the user journey, update the relevant doc under `docs/technical/`.
