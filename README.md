# cleaning-plan

https://derrabbyt.github.io/cleaning-plan/

A weekly cleaning rotation for a shared flat: who cleans this week, who's next, and simple ways to
swap, pause or shift the schedule. Angular frontend hosted on GitHub Pages, talking **directly** to
[Neon](https://neon.com) Postgres from the browser over HTTP (`@neondatabase/serverless`). There is no
backend server and no login: everyone with the link shares one plan.

## How the schedule works

- **One row per week** (`weeks`, keyed by Monday) is materialised 26 weeks ahead. Opening the app tops it up.
- **Rotation**: active roommates in `position` order take one week each, repeating.
- **Confirming** records who actually cleaned (`cleaned_by_id`). It never changes the rotation.
- **Swap** exchanges the people of two active, unconfirmed weeks. Nothing else moves; paused weeks can't be swapped.
- **Pause** (one or several weeks) gives the week nobody and pushes every later turn back one active week,
  so no turn is lost or doubled. Pausing an already paused week changes nothing; resuming pulls turns forward.
- **Shift by N** pauses the next N *active* weeks from a week on, so it always adds exactly N weeks of delay
  (existing pauses stay where they are and don't count towards N).
- **Rotation edits** (add / remove / reorder) rebuild the upcoming weeks from the last turn onwards; an
  unconfirmed current week keeps its person if they're still in the rotation. Paused weeks stay paused.
- **History is fixed**: only the current and future *unconfirmed* weeks are ever rewritten. A database trigger
  rejects changes to a confirmed week's assignment, and removed roommates are deactivated, never deleted.
- Past weeks nobody confirmed stay **unconfirmed** (never assumed done or missed). They can be confirmed later
  or marked as **skipped**.
- **Shared use**: every write says what the client saw (`save_weeks`, `save_rotation`, conditional confirm
  updates). If a roommate changed it meanwhile, nothing is written and the app shows the latest plan, so a stale
  tab can't overwrite a swap or apply the same shift twice. Open pages refresh every minute and on focus.

Every schedule change is previewed before it's applied and can be undone from the toast afterwards. The
rules live in `src/app/schedule/schedule.ts` (pure functions, unit-tested), shared by previews and saves.

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
src/app/schedule/           Date helpers + scheduling rules (pure, unit-tested)
src/app/db.ts               All database queries
src/app/store.ts            App state, writes, undo, previews
src/app/pages/              Overview, Calendar, Settings
src/app/ui/                 Week sheet, preview dialog, avatar/status bits
.github/workflows/deploy.yml  GitHub Pages deployment
```

To change the schema, add a new numbered file in `db/migrations/` (e.g. `005_add_notes.sql`) and run
`npm run db:migrate`. If the app needs a new table, grant it to `cleaning_app` in that migration.

## Security model

GitHub secrets only stay secret until the build: `APP_DATABASE_URL` is compiled into the JavaScript that
GitHub Pages serves, so **anyone can read it**. That is why it uses `cleaning_app`, a role that can only
`SELECT/INSERT/UPDATE` on `roommates` and `weeks` and call the two guarded save functions (5s statement
timeout) — no deletes, no other tables,
no DDL.
`scripts/write-db-config.mjs` refuses to build with any other role.

Anyone with the URL can still read and edit the plan. If it gets abused, rotate the password
(`npm run db:migrate -- --rotate-app-password`), update `.env` and the GitHub secret, and redeploy.

## Deploying to GitHub Pages

1. Repository **Settings → Secrets and variables → Actions**: add secret `APP_DATABASE_URL` (value from `.env`).
2. **Settings → Pages**: set Source to **GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site is served at
   `https://derrabbyt.github.io/cleaning-plan/` (built with `--base-href /cleaning-plan/`).
