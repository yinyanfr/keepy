import assert from "node:assert/strict";
import express from "express";
import test from "node:test";

import { createSessionValue, sessionCookieName } from "../lib/session.js";
import { createMiniAppRouter } from "../routes/miniApp.js";
import {
  BillNotFoundError,
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

test("records positive and negative amounts from the mini app form with an idempotency key", async () => {
  const submissions: Array<{ amount: number; key: string }> = [];
  const app = buildTestApp({
    recordBillForBookOnce: (_user, _bookId, amount, _purpose, key) => {
      submissions.push({ amount, key });
      return {
        bill: {
          amount,
          bookId: 1,
          bookName: "默认",
          currency: null,
          id: submissions.length,
          occurredAt: new Date(),
          purpose: "饮料",
          userId: 1,
        },
        book: defaultBook,
      };
    },
  });

  await post(
    app,
    "/books/1/bills",
    "amount=12&purpose=%E9%A5%AE%E6%96%99&idempotencyKey=abc",
    "manual",
  );
  await post(
    app,
    "/books/1/bills",
    "amount=-8&purpose=%E9%80%80%E6%AC%BE&idempotencyKey=def",
    "manual",
  );

  assert.deepEqual(submissions, [
    { amount: 12, key: "abc" },
    { amount: -8, key: "def" },
  ]);
});

test("deletes a bill and redirects back to the current page", async () => {
  let deletedBillId: number | null = null;
  const app = buildTestApp({
    deleteBill: (_userId, billId) => {
      deletedBillId = billId;
      return { bookId: 1 };
    },
  });

  const response = await post(app, "/bills/9/delete", "returnTo=%2Fbooks%2F1%3Fpage%3D2", "manual");

  assert.equal(deletedBillId, 9);
  assert.equal(response.status, 302);
  assert.equal(response.location, "/books/1?page=2");
});

test("returns 404 when deleting a missing bill", async () => {
  const app = buildTestApp({
    deleteBill: () => {
      throw new BillNotFoundError();
    },
  });

  const response = await post(app, "/bills/999/delete", "", "manual");

  assert.equal(response.status, 404);
  assert.match(response.text, /记录不存在/);
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

test("renders history charts without a title currency badge", async () => {
  const book = { ...defaultBook, currency: "CNY", name: "月花费" };
  const app = buildTestApp({
    getBook: () => book,
    getMonthSummary: (_userId, _bookId, range) => ({
      ...emptySummary(range.key),
      bills: [
        {
          amount: 12,
          bookId: book.id,
          bookName: book.name,
          currency: book.currency,
          id: 1,
          occurredAt: new Date("2026-06-10T04:00:00.000Z"),
          purpose: "吃饭",
          userId: user.id,
        },
      ],
      billCount: 1,
      expenseTotal: 12,
      netBalance: -12,
    }),
    getSpendingCategories: () => [{ amount: 12, percentage: 100, purpose: "吃饭" }],
  });

  const response = await get(app, "/history?bookId=1&month=2026-06");

  assert.equal(response.status, 200);
  assert.match(response.text, /data-chart-carousel/);
  assert.match(response.text, /每日总消费/);
  assert.doesNotMatch(response.text, /<span class="muted">¥<\/span>/);
});

test("shows book monthly metrics on the book list", async () => {
  const budgetBook = {
    ...defaultBook,
    currency: "CNY",
    monthlyBudget: 100,
    name: "月花费",
  };
  const app = buildTestApp({
    getCurrentMonthSummary: () => ({
      ...emptySummary("2026-06"),
      budgetRemaining: 58,
      expenseTotal: 42,
    }),
    listBooks: () => [budgetBook],
  });

  const response = await get(app, "/books");

  assert.equal(response.status, 200);
  assert.match(response.text, /月花费/);
  assert.match(response.text, /累计消费/);
  assert.match(response.text, /¥42/);
  assert.match(response.text, /本月余额/);
  assert.match(response.text, /¥58/);
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
    deleteBill: () => ({ bookId: 1 }),
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
    recordBillForBookOnce: () => ({
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
