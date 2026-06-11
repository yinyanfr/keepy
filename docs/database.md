# Database

Keepy stores all persistent data in SQLite.

Default path:

- `data/keepy.sqlite`

Database setup is handled in `src/services/database.ts`.

## Runtime Settings

When the database opens, Keepy applies:

- `foreign_keys = ON`
- `journal_mode = WAL`

The parent directory is created automatically unless `DATABASE_PATH` is `:memory:`.

## Tables

### `users`

Stores one row per Telegram user.

Columns:

| Column        | Type      | Notes                                 |
| ------------- | --------- | ------------------------------------- |
| `id`          | `INTEGER` | Primary key                           |
| `telegram_id` | `INTEGER` | Unique Telegram user id               |
| `username`    | `TEXT`    | Nullable                              |
| `first_name`  | `TEXT`    | Nullable                              |
| `last_name`   | `TEXT`    | Nullable                              |
| `photo_url`   | `TEXT`    | Nullable                              |
| `timezone`    | `TEXT`    | Non-null, defaults to `Asia/Shanghai` |
| `created_at`  | `TEXT`    | ISO timestamp                         |
| `updated_at`  | `TEXT`    | ISO timestamp                         |

Constraints:

- unique: `telegram_id`

Behavior:

- on repeat login or `/start`, profile fields are refreshed from Telegram
- timezone defaults to `Asia/Shanghai` and can be changed from user settings

### `books`

Stores bookkeeping books owned by a user.

Columns:

| Column           | Type      | Notes                       |
| ---------------- | --------- | --------------------------- |
| `id`             | `INTEGER` | Primary key                 |
| `user_id`        | `INTEGER` | Foreign key to `users.id`   |
| `name`           | `TEXT`    | Non-null                    |
| `currency`       | `TEXT`    | Nullable                    |
| `monthly_budget` | `REAL`    | Nullable                    |
| `is_default`     | `INTEGER` | `0` or `1`, defaults to `0` |
| `created_at`     | `TEXT`    | ISO timestamp               |
| `updated_at`     | `TEXT`    | ISO timestamp               |

Constraints:

- foreign key: `user_id -> users.id ON DELETE CASCADE`
- unique: `(user_id, name)`
- partial unique index: one `is_default = 1` row per user

Behavior:

- every new user receives one default book named `默认`
- if no default book exists, the service promotes one or creates `默认`
- book names are trimmed before write
- empty names are rejected in the service layer

### `bills`

Stores recorded ledger entries.

Columns:

| Column        | Type      | Notes                                 |
| ------------- | --------- | ------------------------------------- |
| `id`          | `INTEGER` | Primary key                           |
| `user_id`     | `INTEGER` | Foreign key to `users.id`             |
| `book_id`     | `INTEGER` | Foreign key to `books.id`             |
| `amount`      | `REAL`    | Non-null                              |
| `purpose`     | `TEXT`    | Non-null                              |
| `occurred_at` | `TEXT`    | ISO timestamp used for month grouping |
| `created_at`  | `TEXT`    | ISO timestamp                         |

Constraints:

- foreign key: `user_id -> users.id ON DELETE CASCADE`
- foreign key: `book_id -> books.id ON DELETE CASCADE`

Indexes:

- `idx_bills_user_book_time` on `(user_id, book_id, occurred_at)`

Behavior:

- positive `amount` means expense
- negative `amount` means income
- bills are listed newest first by `occurred_at DESC, id DESC`

## Relationships

```text
users 1 --- n books
users 1 --- n bills
books 1 --- n bills
```

Cascade behavior:

- deleting a user deletes their books and bills
- deleting a book deletes its bills

## Service-Level Data Rules

These rules are not just schema rules; they are part of application behavior:

- one default book per user
- duplicate book names per user are rejected as `BookConflictError`
- missing book references in default-book operations surface as `BookNotFoundError`
- monthly summary is computed from `bills`, not stored as a table

## Month Summary Derivation

Monthly summaries are calculated on demand in `KeepyService`.

For a given user, book, and month range:

- `expenseTotal`: sum of amounts greater than `0`
- `incomeTotal`: absolute sum of amounts less than `0`
- `netBalance`: `incomeTotal - expenseTotal`
- `budgetRemaining`: `monthly_budget - expenseTotal`, or `NULL`

Month boundaries are timezone-aware and derived from the user's timezone. Bill timestamps remain
stored as absolute ISO/UTC values; the timezone only affects display, grouping, and bot replies.

## Operational Notes

- Keepy currently uses schema creation statements only, not versioned migrations
- changing existing column shape or semantics will need a real migration path later
- for local testing, `:memory:` is used in the test suite
