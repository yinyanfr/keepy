import assert from "node:assert/strict";
import express from "express";
import test from "node:test";

import { createSessionValue, sessionCookieName } from "../lib/session.js";
import { createMiniAppRouter } from "../routes/miniApp.js";
import {
  BookConflictError,
  BookDeleteError,
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

test("redirects to the edited non-default book after saving settings", async () => {
  const travel = { ...defaultBook, id: 2, isDefault: false, name: "旅行" };
  const app = buildTestApp({
    getBook: () => travel,
    updateBook: () => travel,
  });

  const response = await post(app, "/books/2/settings", "name=%E6%97%85%E8%A1%8C", "manual");

  assert.equal(response.status, 302);
  assert.equal(response.location, "/books/2");
});

test("returns 400 when deleting the default book", async () => {
  const app = buildTestApp({
    deleteBook: () => {
      throw new BookDeleteError("默认账本不能删除。");
    },
  });

  const response = await post(app, "/books/1/delete", "", "manual");

  assert.equal(response.status, 400);
  assert.match(response.text, /默认账本不能删除/);
});

test("records positive and negative amounts from the mini app form", async () => {
  const amounts: number[] = [];
  const app = buildTestApp({
    recordBillForBook: (_user, _bookId, amount) => {
      amounts.push(amount);
      return {
        bill: {
          amount,
          bookId: 1,
          bookName: "默认",
          currency: null,
          id: amounts.length,
          occurredAt: new Date(),
          purpose: "饮料",
          userId: 1,
        },
        book: defaultBook,
      };
    },
  });

  await post(app, "/books/1/bills", "amount=12&purpose=%E9%A5%AE%E6%96%99", "manual");
  await post(app, "/books/1/bills", "amount=-8&purpose=%E9%80%80%E6%AC%BE", "manual");

  assert.deepEqual(amounts, [12, -8]);
});

test("uses bookId and month query params on the history page", async () => {
  const travel = { ...defaultBook, id: 2, isDefault: false, name: "旅行" };
  const calls: Array<[number, string]> = [];
  const app = buildTestApp({
    getBook: () => travel,
    getMonthSummary: (_userId, bookId, range) => {
      calls.push([bookId, range.key]);
      return emptySummary(range.key);
    },
    getSpendingCategories: (_userId, bookId, range) => {
      calls.push([bookId, range.key]);
      return [];
    },
  });

  const response = await get(app, "/history?bookId=2&month=2026-05");

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    [2, "2026-05"],
    [2, "2026-05"],
  ]);
  assert.match(response.text, /旅行/);
  assert.match(response.text, /2026年5月/);
  assert.doesNotMatch(response.text, /type="month"/);
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
    deleteBook: () => undefined,
    ensureDefaultBook: () => defaultBook,
    getBook: () => defaultBook,
    getCurrentMonthSummary: () => emptySummary("2026-06"),
    getHistory: () => [],
    getMonthSummary: () => emptySummary("2026-06"),
    getSpendingCategories: () => [],
    getUserByTelegramId: () => user,
    listBillsForRangePaginated: () => ({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
    }),
    listBooks: () => [defaultBook],
    listPurposes: () => [],
    recordBillForBook: () => ({
      bill: {
        amount: 1,
        bookId: 1,
        bookName: "默认",
        currency: null,
        id: 1,
        occurredAt: new Date(),
        purpose: "默认",
        userId: 1,
      },
      book: defaultBook,
    }),
    setDefaultBook: () => defaultBook,
    updateBook: () => defaultBook,
    ...overrides,
  } as unknown as KeepyService;

  app.use(createMiniAppRouter(service, config));
  return app;
}

function emptySummary(monthKey: string) {
  return {
    billCount: 0,
    bills: [],
    budgetRemaining: null,
    expenseTotal: 0,
    incomeTotal: 0,
    monthKey,
    netBalance: 0,
  };
}

async function post(
  app: express.Express,
  path: string,
  body: string,
  redirect: "follow" | "manual" = "follow",
) {
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
      redirect,
    });

    return {
      location: response.headers.get("location"),
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

async function get(app: express.Express, path: string) {
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to start test server.");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);

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
