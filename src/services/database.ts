import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

export type SqliteDatabase = Database.Database;

export function openDatabase(databasePath: string): SqliteDatabase {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

export function migrate(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL UNIQUE,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      photo_url TEXT,
      timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      currency TEXT,
      monthly_budget REAL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_books_one_default
      ON books(user_id)
      WHERE is_default = 1;

    CREATE INDEX IF NOT EXISTS idx_books_user ON books(user_id);

    CREATE TABLE IF NOT EXISTS book_monthly_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      month_key TEXT NOT NULL,
      monthly_budget REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      UNIQUE(book_id, month_key)
    );

    CREATE INDEX IF NOT EXISTS idx_book_monthly_budgets_book
      ON book_monthly_budgets(book_id, month_key);

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      purpose TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_bills_user_book_time
      ON bills(user_id, book_id, occurred_at);

    CREATE TABLE IF NOT EXISTS bill_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      idempotency_key TEXT NOT NULL,
      bill_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
      UNIQUE(user_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS bot_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      chat_id TEXT NOT NULL,
      message_id INTEGER NOT NULL,
      raw_text TEXT NOT NULL,
      status TEXT NOT NULL,
      first_bill_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, chat_id, message_id)
    );

    CREATE TABLE IF NOT EXISTS bot_entry_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL,
      bill_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (entry_id) REFERENCES bot_entries(id) ON DELETE CASCADE,
      FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE,
      UNIQUE(entry_id, bill_id)
    );
  `);

  removeLegacyBookBalanceColumns(db);
}

function removeLegacyBookBalanceColumns(db: SqliteDatabase): void {
  const columns = db.prepare("PRAGMA table_info(books)").all() as Array<{ name: string }>;
  const hasLegacyBalanceColumns = columns.some(
    (column) => column.name === "initial_balance" || column.name === "current_balance",
  );
  if (!hasLegacyBalanceColumns) {
    return;
  }

  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE books_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          currency TEXT,
          monthly_budget REAL,
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(user_id, name)
        );

        INSERT INTO books_new (
          id, user_id, name, currency, monthly_budget, is_default, created_at, updated_at
        )
        SELECT id, user_id, name, currency, monthly_budget, is_default, created_at, updated_at
        FROM books;

        DROP TABLE books;
        ALTER TABLE books_new RENAME TO books;

        CREATE UNIQUE INDEX IF NOT EXISTS idx_books_one_default
          ON books(user_id)
          WHERE is_default = 1;

        CREATE INDEX IF NOT EXISTS idx_books_user ON books(user_id);
      `);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}
