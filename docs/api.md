# HTTP API

This document describes the HTTP surface exposed by Keepy today.

The app is mostly server-rendered HTML, but it also exposes a small authenticated JSON API under `/api`.

## Conventions

- Base URL: your deployed Keepy origin, for example `https://keepy.example.com`
- Authenticated browser pages use the signed cookie `keepy_session`
- Form submissions use `application/x-www-form-urlencoded`
- The Telegram WebApp login endpoint uses JSON

## Authentication

### POST `/auth/telegram-webapp`

Verifies Telegram Mini App `initData` and creates a signed session cookie.

Request:

```json
{
  "initData": "query_id=...&user=...&auth_date=...&hash=..."
}
```

Success:

- Status: `200 OK`
- Body:

```json
{
  "ok": true
}
```

- Side effect: sets `keepy_session`

Failure:

- Status: `401 Unauthorized`
- Body:

```json
{
  "ok": false
}
```

### GET `/auth/telegram-login`

Verifies Telegram Login Widget query parameters and creates a signed session cookie.

Expected query parameters are the standard Telegram Login Widget fields, including:

- `id`
- `auth_date`
- `hash`
- optional profile fields such as `first_name`, `last_name`, `username`, `photo_url`

Success:

- Status: `302 Found`
- Redirect: `/`
- Side effect: sets `keepy_session`

Failure:

- Status: `401 Unauthorized`
- Body: `Telegram login failed.`

### POST `/auth/logout`

Clears the signed session cookie.

Success:

- Status: `302 Found`
- Redirect: `/`

## HTML Pages

### GET `/`

Behavior depends on session state.

Unauthenticated:

- Status: `200 OK`
- Returns the login page with Telegram Login Widget support

Authenticated:

- Status: `302 Found`
- Redirects to `/books/:defaultBookId`

### GET `/settings`

Returns the settings page for the current user's default book.

Success:

- Status: `200 OK`
- Returns HTML

Unauthenticated:

- Status: `302 Found`
- Redirect: `/`

### POST `/settings`

Updates the current user's default book.

Form fields:

- `name`: string, optional in transport, falls back to current book name
- `currency`: string or empty
- `monthlyBudget`: number or empty

An empty `monthlyBudget` clears the stored budget.

Success:

- Status: `302 Found`
- Redirect: `/books/:bookId`

Validation failure:

- Status: `400 Bad Request`
- Body: `账本名字已存在。`

Unauthenticated:

- Status: `302 Found`
- Redirect: `/`

### GET `/books`

Returns the books page.

Success:

- Status: `200 OK`
- Returns HTML with:
  - current default book selector
  - current books list
  - new-book creation form

Unauthenticated:

- Status: `302 Found`
- Redirect: `/`

### POST `/books`

Creates a new book for the current user.

Form fields:

- `name`: required string
- `currency`: string or empty
- `monthlyBudget`: number or empty

Success:

- Status: `302 Found`
- Redirect: `/books`

Validation failures:

- Status: `400 Bad Request`, body `账本名字不能为空。`
- Status: `400 Bad Request`, body `账本名字已存在。`

Unauthenticated:

- Status: `302 Found`
- Redirect: `/`

### POST `/books/default`

Changes the current user's default book.

Form fields:

- `bookId`: integer book id

Success:

- Status: `302 Found`
- Redirect: `/books`

Validation failures:

- Status: `400 Bad Request`, body `账本无效。`

Unauthenticated:

- Status: `302 Found`
- Redirect: `/`

### GET `/history`

Returns grouped bill history for the current user.

Success:

- Status: `200 OK`
- Returns HTML

Unauthenticated:

- Status: `302 Found`
- Redirect: `/`

## Telegram Webhook

### POST `/telegram/webhook/:secret`

Receives Telegram bot updates in webhook mode.

Guards:

- path parameter `:secret` must equal `WEBHOOK_SECRET`
- request header `X-Telegram-Bot-Api-Secret-Token` must also equal `WEBHOOK_SECRET`

Failure modes:

- Status: `404 Not Found` when the path secret is wrong
- Status: `403 Forbidden` when the Telegram secret header is wrong
- Status: `403 Forbidden` when the Telegram secret header is missing

Success:

- Delegated to grammY's Express webhook middleware
- Exact response body depends on Telegram update handling

## Session Cookie

Cookie name:

- `keepy_session`

Properties:

- signed with `SESSION_SECRET`
- `httpOnly`
- `sameSite=lax`
- `secure` when `NODE_ENV=production`
- 30-day TTL

## JSON API

Authenticated JSON endpoints:

- `GET /api/me`
- `GET /api/books/:bookId/month`
- `POST /api/books/:bookId/bills`
- `POST /api/sync/bills`

Bill creation rules:

- `amount` must be a finite non-zero number
- `purpose` must be a non-empty string

## Notes

- Most user-facing state changes are driven by HTML forms and Telegram updates
- In local development without `PUBLIC_URL`, Telegram updates arrive through polling rather than the webhook route
