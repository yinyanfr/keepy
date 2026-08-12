# AGENTS.md

## Commands

```bash
npm run build        # tsc -p tsconfig.json -> dist/
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npm run lint:fix     # eslint . --fix
npm run format:check # prettier . --check
npm run format       # prettier . --write
npm test             # npm run build && node --test dist/tests/*.test.js
npm start            # node dist/index.js
```

**Tests require a build first.** The `npm test` script handles this, but if you run `node --test` directly, you must `npm run build` first — tests execute compiled JS from `dist/`.

The recommended CI/PR check order is: `typecheck` -> `lint` -> `test` (test already builds).

## TypeScript Strictness

- `verbatimModuleSyntax: true` — type-only imports MUST use `import type { ... }`
- `exactOptionalPropertyTypes: true` — `prop?: string` and `prop?: string | undefined` are distinct
- `noUncheckedIndexedAccess: true` — array/record access returns `T | undefined`
- `strict: true` — no implicit any, strict null checks, etc.
- ESLint `@typescript-eslint/consistent-type-imports` is a **warning** (prefer `type-imports`)

## Environment / Config

- `dotenv` is loaded eagerly in `src/configs/env.ts:3` — it runs `dotenv.config({ quiet: true })` at module import time, not from an entrypoint
- The bot token env var is **`BOT_TOKEN`** (primary) or legacy **`BOTTOKEN`** (fallback)
- When `PUBLIC_URL` is empty, the bot uses long polling; when set, it registers a webhook at `{PUBLIC_URL}/telegram/webhook/{WEBHOOK_SECRET}`
- In production, `SESSION_SECRET` and `WEBHOOK_SECRET` are required (throws on startup if missing)
- Default timezone for new users is `Asia/Shanghai`

## Runtime: Express 5 + ESM

- This project uses **Express 5** and **ESM** (`"type": "module"` in package.json)
- Express 5 error handling: if a middleware returns a rejected promise, Express catches it automatically (unlike Express 4)
- The `public/` directory is served as static files — no frontend build step

## Architecture

```
src/configs/env.ts       # Env loading, AppConfig
src/services/database.ts # SQLite open, schema, migrations
src/services/keepyService.ts # All bookkeeping domain logic
src/features/bot/        # grammY bot handlers and reply formatting
src/features/miniApp/    # Server-rendered HTML pages
src/routes/              # Express routers: auth, api, telegram, miniApp
src/lib/                 # Shared helpers (no routing concerns)
src/components/          # Reusable UI components (HTML shell, layout)
src/app.ts               # createRuntime + start — wires everything together
src/index.ts             # Entry point: calls start()
```

- Put business rules in `src/services/`
- Put HTTP request handling in `src/routes/`
- Put Telegram update handling in `src/features/bot/`
- Put HTML rendering in `src/features/miniApp/`
- Put shared helpers in `src/lib/`

## Database

- SQLite via `better-sqlite3` with `foreign_keys = ON`, `journal_mode = WAL`
- Schema is in `src/services/database.ts` — `migrate()` uses `CREATE TABLE IF NOT EXISTS`
- Legacy migration for `books.initial_balance`/`current_balance` columns exists in the same file
- Tests use `:memory:` databases unless file-backed storage is specifically needed
- Book names are unique per user; one default book per user (enforced by partial unique index)
- New tables: `bill_submissions` (idempotency), `bot_entries`, `bot_entry_bills`

## Domain Rules

- Positive amounts = expenses, negative amounts = income, zero is rejected
- Ledger format: `数字 [用途] [账本]` — the last token is a book name only if it exactly matches an existing book
- Business errors: `BookConflictError`, `BookNotFoundError` — route layer converts these to HTTP 400
- User-facing copy is in Chinese

## Code Style

- Prettier: double quotes, semicolons, trailing commas, print width 100
- Pre-commit: husky runs `lint-staged` (eslint --fix + prettier --write on staged JS/TS files)
- Keep logic close to where it's used; small, direct changes preferred

## Deployment

- Production uses Docker Compose from `/etc/docker/containers/keepy`
- The image is built from the server's Git checkout of `main`; do not upload application files
- `docker compose up -d --build` builds and starts/recreates Keepy
- `docker compose logs -f keepy` tails container logs
- SQLite data is bind-mounted from `./data` to `/app/data`

## Documentation

- `docs/contributing.md` contains the full contribution guide — update it alongside code changes
- Other docs: `docs/architecture.md`, `docs/api.md`, `docs/bot.md`, `docs/database.md`, `docs/deployment.md`, `docs/product.md`
