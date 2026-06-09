# Documentation Index

This directory is the working reference for Keepy.

## Core Docs

- `api.md`: HTTP routes, auth endpoints, webhook behavior, and session cookie rules
- `architecture.md`: runtime assembly, module ownership, request flow, and testing scope
- `bot.md`: Telegram bot commands, message parsing, callbacks, and reply behavior
- `database.md`: SQLite schema, constraints, and derived summary rules
- `deployment.md`: local vs production modes, environment variables, PM2, and release checklist
- `product.md`: business rules, user-visible behavior, parsing semantics, and known limitations
- `contributing.md`: local workflow, validation commands, and change expectations

## Suggested Reading Order

For a new maintainer:

1. `../README.md`
2. `architecture.md`
3. `product.md`
4. `bot.md`
5. `database.md`
6. `api.md`
7. `deployment.md`

## Fast Lookup

If you need to answer a specific question:

- How does login work: `api.md` and `architecture.md`
- How are Telegram messages parsed: `bot.md` and `product.md`
- What data is stored: `database.md`
- How do I run or deploy it: `deployment.md`
- What should contributors run before merging: `contributing.md`
