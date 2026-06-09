# Contributing

This project is small and straightforward on purpose. Changes should stay minimal, readable, and easy to verify.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create local environment file:

```bash
cp .env.example .env
```

3. Fill at least one bot token variable:

- `BOT_TOKEN`
- or legacy `BOTTOKEN`

4. Build and run:

```bash
npm run build
npm start
```

If `PUBLIC_URL` is empty, the bot will use long polling automatically.

## Project Workflow

Before opening a change, run:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
```

If you need formatting fixes:

```bash
npm run format
```

If you need lint autofixes:

```bash
npm run lint:fix
```

## Code Style Expectations

- prefer small, direct changes
- keep logic close to where it is used unless reuse is real
- follow existing naming and file structure
- preserve current Chinese user-facing copy unless intentionally changing product behavior
- add tests for behavior changes, not just refactors

## Architecture Expectations

General ownership in this repo:

- `src/services/` for business rules and persistence behavior
- `src/routes/` for HTTP-specific request handling
- `src/features/bot/` for Telegram update handling and replies
- `src/features/miniApp/` for HTML rendering
- `src/lib/` for shared helpers with no product-specific routing concerns

When adding new behavior, prefer placing it in the layer that already owns that concern.

## Testing Notes

The test suite uses Node's built-in test runner.

Current test coverage includes:

- service behavior
- route validation
- Telegram auth verification
- startup behavior
- parser behavior
- bot reply formatting

Use `:memory:` SQLite databases in tests unless file-backed storage is specifically required.

## Database Changes

Schema creation currently lives in `src/services/database.ts`.

Important constraints already enforced:

- one user per Telegram id
- unique book names per user
- one default book per user

If you change persisted data shape, update:

- `docs/database.md`
- tests touching the changed behavior
- any user-facing docs affected by the change

## Documentation Expectations

Update docs when behavior changes.

Relevant files:

- `README.md`
- `docs/api.md`
- `docs/architecture.md`
- `docs/bot.md`
- `docs/database.md`
- `docs/deployment.md`
- `docs/product.md`

## Pull Request Checklist

Before shipping a change, confirm:

1. The change is scoped to the actual problem.
2. Formatting, lint, typecheck, and tests pass.
3. User-visible behavior is documented when needed.
4. New errors are handled intentionally, not as generic 500s.
5. Telegram webhook and polling behavior still make sense for the affected code path.
