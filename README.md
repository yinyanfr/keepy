# keepy

Keepy is a lightweight Telegram bookkeeping bot with a small built-in web app.

It supports two input surfaces:

- Telegram bot commands and plain-text ledger messages
- A server-rendered Mini App for login, monthly summary, book management, and history

## What It Does

- Creates a local user profile on first Telegram login or `/start`
- Creates one default book named `默认`
- Records expenses and income from messages like `12 午饭` or `-3000 工资`
- Tracks monthly expense, income, net balance, and optional budget remaining
- Lets users manage books and settings from the web app

## Tech Stack

- Node.js + TypeScript
- Express 5
- grammY
- SQLite via `better-sqlite3`
- Plain server-rendered HTML, no frontend build step

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and fill at least your bot token:

```bash
cp .env.example .env
```

3. Build the app:

```bash
npm run build
```

4. Start the server:

```bash
npm start
```

## Development Behavior

When `PUBLIC_URL` is empty, Keepy starts Telegram long polling automatically. This is the simplest local development mode.

When `PUBLIC_URL` is set, Keepy registers a webhook at:

```text
{PUBLIC_URL}/telegram/webhook/{WEBHOOK_SECRET}
```

In production you should set:

- `NODE_ENV=production`
- `PUBLIC_URL`
- `SESSION_SECRET`
- `WEBHOOK_SECRET`

## Environment Variables

| Variable         | Required    | Notes                                                |
| ---------------- | ----------- | ---------------------------------------------------- |
| `BOT_TOKEN`      | Yes         | Preferred Telegram bot token variable                |
| `BOTTOKEN`       | Yes         | Legacy alias supported by the app                    |
| `BOT_USERNAME`   | Recommended | Needed for Telegram login widget in browser          |
| `MINI_APP_URL`   | No          | Mini App URL; defaults to `https://t.me/<bot>/keepy` |
| `DATABASE_PATH`  | No          | Defaults to `data/keepy.sqlite`                      |
| `PORT`           | No          | Defaults to `3000`                                   |
| `PUBLIC_URL`     | No          | Enables webhook mode when set                        |
| `SESSION_SECRET` | Production  | Required in production; signed login cookie secret   |
| `WEBHOOK_SECRET` | Production  | Required in production; webhook path/header secret   |

## Telegram Usage

### Commands

- `/start` creates the user profile and default book
- `/help` shows the supported message format
- `/book` lists books and lets the user choose the default one
- `/bills` shows the current month's summary for the default book

### Ledger Format

```text
数字 [用途] [账本]
```

Examples:

```text
12 午饭
59.9 咖啡 默认
-3000 工资
```

Rules:

- Positive amounts are treated as expenses
- Negative amounts are treated as income
- Zero is rejected
- The last token is treated as a book name only if it exactly matches an existing book

## Web App Routes

- `GET /` login page or redirect to the default book page
- `GET /settings` default book settings
- `POST /settings` update default book settings
- `GET /books` list books and create new books
- `POST /books` create a book
- `POST /books/default` change the default book
- `GET /history` full grouped bill history

Auth endpoints:

- `POST /auth/telegram-webapp`
- `GET /auth/telegram-login`
- `POST /auth/logout`

Telegram webhook endpoint:

- `POST /telegram/webhook/:secret`

## Scripts

```bash
npm run build
npm run typecheck
npm run lint
npm run format:check
npm test
```

Container deployment:

```bash
docker compose up -d --build
docker compose logs -f keepy
docker compose down
```

Production deployments use a Git checkout and Docker Compose. See
[`docs/deployment.md`](docs/deployment.md) for the update and rollback workflow.

## Project Structure

```text
src/
  app.ts                 Runtime assembly and startup
  configs/               Environment loading
  features/bot/          Telegram bot handlers and replies
  features/miniApp/      Server-rendered Mini App pages
  lib/                   Shared helpers: auth, dates, money, HTML, session
  routes/                Express routers
  services/              Database and bookkeeping logic
  tests/                 Node test suite
docs/
  api.md
  bot.md
  contributing.md
  architecture.md
  database.md
  deployment.md
  index.md
  product.md
```

## Notes

- The database directory is created automatically if needed
- SQLite runs with `foreign_keys = ON` and `journal_mode = WAL`
- Book names are unique per user
- The session cookie is signed and valid for 30 days

## Further Reading

- `docs/index.md`
- `docs/architecture.md`
- `docs/api.md`
- `docs/bot.md`
- `docs/contributing.md`
- `docs/database.md`
- `docs/deployment.md`
- `docs/product.md`
