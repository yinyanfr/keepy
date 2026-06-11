# Telegram Bot

This document describes the Telegram bot behavior implemented in `src/features/bot/bot.ts`.

## Runtime Modes

Keepy can receive Telegram updates in two ways.

### Polling mode

Used when `PUBLIC_URL` is empty.

Behavior:

- the HTTP server still starts
- Keepy calls `bot.start()`
- this is the default local development path

### Webhook mode

Used when `PUBLIC_URL` is set.

Behavior:

- Keepy registers a webhook on startup
- updates are delivered to `POST /telegram/webhook/:secret`
- the webhook route validates both the URL secret and Telegram secret header

## User Resolution

Most commands and message handlers begin by resolving `ctx.from` into a local `TelegramAuthUser` shape.

Mapped fields:

- `telegramId`
- `username`
- `firstName`
- `lastName`
- `photoUrl`

Current note:

- bot-side `photoUrl` is always set to `null`

## Commands

### `/start`

Behavior:

- creates the user if missing
- refreshes stored Telegram profile fields if the user already exists
- ensures a default book exists
- replies with a welcome message
- includes a Mini App button when `PUBLIC_URL` is available

Failure case:

- if Telegram user information is missing, replies `无法识别 Telegram 用户。`

### `/help`

Replies with:

- ledger input format
- examples
- command list
- Mini App URL when available

### `/book`

Behavior:

- ensures the user exists
- loads that user's books
- renders an inline keyboard
- marks the default book with `✓`

Selecting a button triggers a callback of the form:

```text
book:set:{bookId}
```

### `/bills`

Behavior:

- ensures the user exists
- loads the default book
- computes the current month summary
- replies with current month expense totals, optional budget remaining, and spending categories

## Plain-Text Ledger Messages

Keepy listens to `message:text` updates.

Ignored:

- any text starting with `/`

Handled format:

```text
数字 [用途] [账本]
```

Examples:

- `12 午饭`
- `59.9 咖啡 默认`
- `-3000 工资`

Parsing flow:

1. Trim and normalize whitespace.
2. Parse the first token as the amount.
3. Use the remaining tokens as purpose and optional book name.
4. Treat the last token as a book name only if it matches an existing user book exactly.
5. Reject zero amounts.

Fallback behavior:

- if the named book is not found during record time, the service falls back to the default book

Business meaning:

- positive amount: expense
- negative amount: income

Success reply includes:

- formatted occurrence time
- purpose
- amount and currency
- chosen book
- current month's expense total
- optional budget remaining

Parse failure reply includes:

- the parser error
- help text

## Callback Queries

The bot currently handles one callback pattern:

```text
book:set:{bookId}
```

Behavior:

- validates `bookId`
- ensures the user exists
- changes the default book
- answers the callback query
- edits the original message to confirm the new default book

Failure behavior:

- invalid callback payload: `无法设置账本。`
- missing or stale book id: `账本不存在。`

## Reply Composition

Text replies live in `src/features/bot/replies.ts`.

Current reply builders:

- `helpText()`
- `welcomeText()`
- `billCreatedText()`
- `billsText()`

Formatting choices:

- Chinese text output
- timezone-aware datetime formatting
- amount formatting with up to 2 decimals
- currency is appended directly when present

## Error Handling

Global bot error handling is registered with `bot.catch(...)`.

Current behavior:

- log the error with prefix `Bot error`
- do not crash the bot handler synchronously from expected user mistakes

Expected business errors are handled closer to the command or callback path where possible.

## Mini App Link Integration

When `MINI_APP_URL` is available:

- `/start` and `/help` replies include a button labeled `打开 Mini App`

When `MINI_APP_URL` is empty:

- no Mini App button is attached

## Current Limitations

- no command exists yet for creating, renaming, or deleting books directly in chat
- no editing or deletion flow exists for bills
- bot-side parsing is simple and space-delimited
- book matching is exact and case-sensitive
