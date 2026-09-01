# Architecture

## Overview

Keepy is a single-process Node.js service that combines three responsibilities:

- Telegram bot update handling
- Telegram-based web authentication
- A small server-rendered bookkeeping web app

The app is intentionally simple:

- Express owns HTTP routing
- grammY owns Telegram bot behavior
- `KeepyService` owns bookkeeping rules and data access
- SQLite stores all persistent state

## Runtime Assembly

`src/app.ts` builds the runtime:

- load config from environment
- open and migrate SQLite
- create the grammY bot
- create the Express app
- mount auth, Telegram, and Mini App routers

Startup behavior depends on `PUBLIC_URL`:

- with `PUBLIC_URL`: register Telegram webhook
- without `PUBLIC_URL`: start Telegram long polling

## Main Modules

### `src/services/keepyService.ts`

The service layer contains the main domain logic:

- create or update users from Telegram identity
- maintain one default book per user
- create and update books
- record bills
- compute monthly summaries
- aggregate and paginate contiguous history months
- preserve and edit per-month budget snapshots

This file is the main place to change bookkeeping behavior.

### `src/services/database.ts`

Database responsibilities:

- create the parent directory for SQLite when needed
- open the database
- enable SQLite pragmas
- run schema creation migrations

Schema tables:

- `users`
- `books`
- `book_monthly_budgets`
- `bills`

Important constraints:

- `users.telegram_id` is unique
- `books(user_id, name)` is unique
- only one default book per user via partial unique index

### `src/features/bot/`

Bot responsibilities:

- handle `/start`, `/help`, `/book`, `/bills`
- parse plain-text ledger messages
- switch default book through inline callbacks
- format Chinese-language replies

### `src/routes/`

Routing is split by concern:

- `auth.ts`: Telegram WebApp and Login Widget authentication
- `telegram.ts`: webhook verification and handoff to grammY
- `miniApp.ts`: HTML pages and form submissions

### `src/lib/`

Shared helpers:

- `telegramAuth.ts`: Telegram signature verification
- `session.ts`: signed cookie creation and validation
- `money.ts`: ledger parsing and amount formatting
- `dates.ts`: timezone-aware month boundaries and formatting
- `html.ts`: HTML escaping and page shell helpers

## Request and Update Flows

### Telegram bot message flow

1. Telegram sends an update by webhook or polling.
2. grammY dispatches it to handlers in `features/bot/bot.ts`.
3. The handler resolves the current Telegram user.
4. `KeepyService` loads or creates the app user.
5. Parsed input is recorded into SQLite.
6. A formatted reply is sent back to Telegram.

### Web login flow

1. User opens `/`.
2. If no valid session exists, the login page is rendered.
3. Telegram Login Widget or WebApp init data is verified.
4. A signed session cookie is issued.
5. Later page requests resolve the user from the cookie.

## Error Handling

The service layer exposes business-level errors for common user mistakes:

- `BookConflictError`
- `BookNotFoundError`

The Mini App converts those into HTTP 400 responses instead of generic 500 errors.

## Testing Strategy

Tests are under `src/tests/` and currently cover:

- Telegram auth signature validation
- ledger parsing
- service-level bookkeeping behavior
- text reply formatting
- startup mode fallback
- route-level validation for duplicate and missing books
