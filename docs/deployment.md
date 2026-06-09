# Deployment

## Modes

Keepy supports two runtime modes.

### Local or simple development

Leave `PUBLIC_URL` empty.

Behavior:

- Express still starts on `PORT`
- the bot uses Telegram long polling
- no webhook registration is attempted

### Production webhook mode

Set `PUBLIC_URL` to the public HTTPS origin of the service.

Behavior:

- Keepy registers a webhook on startup
- Telegram sends updates to `/telegram/webhook/:secret`
- the route validates both the URL secret and the Telegram secret header

## Required Production Variables

```text
NODE_ENV=production
BOT_TOKEN=...
BOT_USERNAME=...
PUBLIC_URL=https://your-domain.example
SESSION_SECRET=...
WEBHOOK_SECRET=...
DATABASE_PATH=data/keepy.sqlite
PORT=3000
```

Production guards already enforced by the app:

- missing `SESSION_SECRET` throws on startup
- missing `WEBHOOK_SECRET` throws on startup
- missing bot token throws on startup

## Process Management

The project includes PM2 helper scripts:

```bash
npm run serve
npm run serve:logs
npm run serve:stop
```

`npm run serve` builds first, then starts `dist/app.js` under the PM2 process name `keepy`.

## Reverse Proxy Notes

If you deploy behind Nginx, Caddy, or another reverse proxy:

- terminate HTTPS at the proxy or upstream platform
- forward requests to `PORT`
- keep the public origin aligned with `PUBLIC_URL`
- do not strip the Telegram secret header

## Data and Persistence

- Default database path: `data/keepy.sqlite`
- The `data/` directory is gitignored
- SQLite WAL mode is enabled

Back up at least:

- `data/keepy.sqlite`
- any accompanying SQLite WAL files if the process is active

## CI

GitHub Actions runs:

- formatting check
- lint
- typecheck
- tests

Workflow file:

- `.github/workflows/ci.yml`

## Release Checklist

1. Fill production environment variables.
2. Confirm `PUBLIC_URL` is reachable over HTTPS.
3. Build and test locally.
4. Start or restart the process.
5. Verify Telegram webhook registration logs.
6. Open `/` and confirm Telegram login works.
7. Send a test message to the bot.
