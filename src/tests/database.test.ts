import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";

import { migrate } from "../services/database.js";

test("removes legacy book balance columns during migration", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE users (
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

    CREATE TABLE books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      currency TEXT,
      initial_balance REAL NOT NULL DEFAULT 0,
      current_balance REAL NOT NULL DEFAULT 0,
      monthly_budget REAL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name)
    );

    INSERT INTO users (
      id, telegram_id, username, first_name, last_name, photo_url, timezone, created_at, updated_at
    )
    VALUES (
      1, 1001, 'yan', 'Yan', NULL, NULL, 'Asia/Shanghai',
      '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z'
    );

    INSERT INTO books (
      id, user_id, name, currency, initial_balance, current_balance,
      monthly_budget, is_default, created_at, updated_at
    )
    VALUES (
      1, 1, '默认', 'CNY', 100, 80, 1000, 1,
      '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z'
    );
  `);

  migrate(db);

  const columns = db.prepare("PRAGMA table_info(books)").all() as Array<{ name: string }>;
  assert.equal(
    columns.some((column) => column.name === "initial_balance"),
    false,
  );
  assert.equal(
    columns.some((column) => column.name === "current_balance"),
    false,
  );

  const book = db
    .prepare("SELECT name, currency, monthly_budget FROM books WHERE id = 1")
    .get() as { currency: string; monthly_budget: number; name: string };
  assert.deepEqual(book, {
    currency: "CNY",
    monthly_budget: 1000,
    name: "默认",
  });

  db.prepare(
    `
      INSERT INTO book_monthly_budgets (
        book_id, month_key, monthly_budget, created_at, updated_at
      ) VALUES (1, '2026-06', 1000, '2026-06-11T00:00:00.000Z', '2026-06-11T00:00:00.000Z')
    `,
  ).run();
  db.prepare("DELETE FROM books WHERE id = 1").run();
  const budgetCount = db.prepare("SELECT COUNT(*) AS count FROM book_monthly_budgets").get() as {
    count: number;
  };
  assert.equal(budgetCount.count, 0);

  db.close();
});
