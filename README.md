# cleaning-plan

A minimal cleaning-task list. Angular frontend hosted on GitHub Pages, talking **directly** to
[Neon](https://neon.com) Postgres from the browser over HTTP (`@neondatabase/serverless`). There is no
backend server and no login.

## Requirements

- Node.js 22+ (CI uses 24)
- [Neon CLI](https://neon.com/docs/cli): `npm i -g neon@latest`, then `neon login`

## Setup

```bash
npm install
neon deploy                                    # provisions services in neon.ts, writes Neon vars into .env
npm run db:migrate -- --rotate-app-password    # creates schema + app role, prints APP_DATABASE_URL
```

Copy the printed `APP_DATABASE_URL=...` line into `.env`, then:

```bash
npm start                                      # http://localhost:4200
```

## Environment variables

All live in `.env` (gitignored). `neon deploy` / `neon env pull` fill in the Neon ones.

| Variable                | Source                         | Used by                      | Notes                                                       |
| ----------------------- | ------------------------------ | ---------------------------- | ----------------------------------------------------------- |
| `DATABASE_URL`          | `neon deploy`                  | —                            | Pooled, owner role (`neondb_owner`). Never ship to browser. |
| `DATABASE_URL_UNPOOLED` | `neon deploy`                  | `npm run db:migrate`         | Direct, owner role. Used for migrations.                    |
| `NEON_BRANCH`           | `neon deploy`                  | —                            | Neon branch the vars were pulled from (`production`).       |
| `APP_DATABASE_URL`      | `db:migrate --rotate-app-password` | `npm start` / `build` / `test` | Restricted `cleaning_app` role. **Embedded in the public bundle.** |

## Commands

| Command                                         | What it does                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm start`                                     | Dev server on http://localhost:4200                                                            |
| `npm run build`                                 | Production build to `dist/cleaning-plan/browser`                                              |
| `npm run watch`                                 | Dev build in watch mode                                                                       |
| `npm test`                                      | Unit tests (Vitest)                                                                           |
| `npm run dbconfig`                              | Writes `APP_DATABASE_URL` into `src/app/db-config.generated.ts` (runs automatically before start/build/test/watch) |
| `npm run db:migrate`                            | Applies pending `db/migrations/*.sql` (tracked in `schema_migrations`)                        |
| `npm run db:migrate -- --rotate-app-password`   | Same, plus sets a new `cleaning_app` password and prints the new `APP_DATABASE_URL`           |
| `neon deploy`                                   | Applies `neon.ts` to the linked project/branch and pulls env vars into `.env`                 |
| `neon env pull`                                 | Re-pulls Neon env vars into `.env`                                                            |

## Project layout

```
neon.ts                     Neon services config (Postgres only)
.neon                       Linked Neon org/project/branch (gitignored)
db/migrations/              Plain SQL migrations, applied in filename order
scripts/migrate.mjs         Migration runner + app-role password rotation
scripts/write-db-config.mjs Generates the browser DB config at build time
src/app/tasks.service.ts    All database queries
src/app/app.*               UI
.github/workflows/deploy.yml  GitHub Pages deployment
```

To change the schema, add a new numbered file in `db/migrations/` (e.g. `003_add_due_date.sql`) and run
`npm run db:migrate`. If the app needs a new table, grant it to `cleaning_app` in that migration.

## Security model

GitHub secrets only stay secret until the build: `APP_DATABASE_URL` is compiled into the JavaScript that
GitHub Pages serves, so **anyone can read it**. That is why it uses `cleaning_app`, a role that can only
`SELECT/INSERT/UPDATE/DELETE` on `tasks` (5s statement timeout) — no other tables, no DDL.
`scripts/write-db-config.mjs` refuses to build with any other role.

Anyone with the URL can still read and edit the task list. If it gets abused, rotate the password
(`npm run db:migrate -- --rotate-app-password`), update `.env` and the GitHub secret, and redeploy.

## Deploying to GitHub Pages

1. Repository **Settings → Secrets and variables → Actions**: add secret `APP_DATABASE_URL` (value from `.env`).
2. **Settings → Pages**: set Source to **GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site is served at
   `https://derrabbyt.github.io/cleaning-plan/` (built with `--base-href /cleaning-plan/`).
