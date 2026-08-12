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
DATABASE_PATH=/app/data/keepy.sqlite
PORT=3000
```

Production guards already enforced by the app:

- missing `SESSION_SECRET` throws on startup
- missing `WEBHOOK_SECRET` throws on startup
- missing bot token throws on startup

## Docker Compose

Production runs Keepy as a single Docker Compose service. The image is built from the checked-out
Git revision and runs the compiled app as a non-root user. Compose restarts the service unless it
was explicitly stopped.

The included `compose.yaml`:

- loads secrets and app settings from `.env`
- binds container port `3000` to `127.0.0.1:20267` on the host
- mounts `./data` at `/app/data`
- checks `/healthz` for container health
- gives the app 30 seconds to close HTTP, Telegram polling, and SQLite cleanly

Initial server setup:

```bash
cd /etc/docker/containers
git clone --branch main https://github.com/yinyanfr/keepy.git keepy
cd keepy
cp .env.example .env
mkdir data
docker compose up -d --build
```

Fill all required production values in `.env` before starting. Keep `.env` and `data/` only on the
server; both are ignored by Git and excluded from the image build context.

## Updates

Deploy only from Git. Do not upload application files directly:

```bash
cd /etc/docker/containers/keepy
git pull --ff-only origin main
docker compose up -d --build
docker image prune -f
```

Inspect status and logs with:

```bash
docker compose ps
docker compose logs -f keepy
```

To roll back, check out a known-good commit and rebuild:

```bash
git checkout <commit>
docker compose up -d --build
```

Return to the production branch after the rollback is resolved:

```bash
git switch main
git pull --ff-only origin main
```

## Reverse Proxy Notes

If you deploy behind Nginx, Caddy, or another reverse proxy:

- terminate HTTPS at the proxy or upstream platform
- forward requests to `PORT`
- keep the public origin aligned with `PUBLIC_URL`
- do not strip the Telegram secret header

## Data and Persistence

- Container database path: `/app/data/keepy.sqlite`
- Host database path: `/etc/docker/containers/keepy/data/keepy.sqlite`
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
4. Run `docker compose up -d --build`.
5. Confirm `docker compose ps` reports the service as healthy.
6. Verify Telegram webhook registration logs.
7. Open `/` and confirm Telegram login works.
8. Send a test message to the bot.
