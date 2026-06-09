import assert from "node:assert/strict";
import express from "express";
import test from "node:test";

import { createSessionValue, sessionCookieName } from "../lib/session.js";
import { createMiniAppRouter } from "../routes/miniApp.js";
import {
  BookConflictError,
  BookNotFoundError,
  type Book,
  type KeepyService,
  type User,
} from "../services/keepyService.js";

const user: User = {
  firstName: "Yan",
  id: 1,
  lastName: null,
  photoUrl: null,
  telegramId: 42,
  timezone: "Asia/Shanghai",
  username: "yan",
};

const defaultBook: Book = {
  currency: null,
  currentBalance: null,
  id: 1,
  initialBalance: null,
  isDefault: true,
  monthlyBudget: null,
  name: "默认",
  userId: 1,
};

const config = {
  botToken: "test-token",
  botUsername: "keepy_bot",
  databasePath: ":memory:",
  isProduction: false,
  port: 3000,
  publicUrl: "",
  sessionSecret: "session-secret",
  webhookSecret: "webhook-secret",
};

test("returns 400 when creating a duplicate book", async () => {
  const app = buildTestApp({
    createBook: () => {
      throw new BookConflictError();
    },
  });

  const response = await post(app, "/books", "name=%E9%BB%98%E8%AE%A4");

  assert.equal(response.status, 400);
  assert.match(response.text, /账本名字已存在/);
});

test("returns 400 when renaming a book to a duplicate name", async () => {
  const app = buildTestApp({
    updateBook: () => {
      throw new BookConflictError();
    },
  });

  const response = await post(app, "/settings", "name=%E9%BB%98%E8%AE%A4");

  assert.equal(response.status, 400);
  assert.match(response.text, /账本名字已存在/);
});

test("returns 400 when selecting a missing default book", async () => {
  const app = buildTestApp({
    setDefaultBook: () => {
      throw new BookNotFoundError();
    },
  });

  const response = await post(app, "/books/default", "bookId=999");

  assert.equal(response.status, 400);
  assert.match(response.text, /账本无效/);
});

function buildTestApp(overrides: Partial<KeepyService>): express.Express {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => {
    req.cookies = {
      [sessionCookieName]: createSessionValue(user.telegramId, config.sessionSecret),
    };
    next();
  });

  const service = {
    createBook: () => defaultBook,
    ensureDefaultBook: () => defaultBook,
    getCurrentMonthSummary: () => ({
      billCount: 0,
      bills: [],
      budgetRemaining: null,
      expenseTotal: 0,
      incomeTotal: 0,
      monthKey: "2026-06",
      netBalance: 0,
    }),
    getHistory: () => [],
    getUserByTelegramId: () => user,
    listBooks: () => [defaultBook],
    setDefaultBook: () => defaultBook,
    updateBook: () => defaultBook,
    ...overrides,
  } as unknown as KeepyService;

  app.use(createMiniAppRouter(service, config));
  return app;
}

async function post(app: express.Express, path: string, body: string) {
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to start test server.");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });

    return {
      status: response.status,
      text: await response.text(),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}
