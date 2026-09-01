import assert from "node:assert/strict";
import express from "express";
import test from "node:test";

import { clientSourceCookieName, type ClientSource } from "../lib/clientSource.js";
import { createSessionValue, sessionCookieName } from "../lib/session.js";
import { createMiniAppRouter } from "../routes/miniApp.js";
import {
  BillNotFoundError,
  BookConflictError,
  BookDeleteError,
  BookNotFoundError,
  InvalidTimeZoneError,
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
  id: 1,
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
  miniAppUrl: "https://t.me/keepy_bot/keepy",
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
  const submissions: Array<{ amount: number; key: string; purpose: string }> = [];
  const app = buildTestApp({
    recordBillForBookOnce: (_user, _bookId, amount, purpose, key) => {
      submissions.push({ amount, key, purpose });
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
    "amount=12&purposePreset=%E9%A5%AE%E6%96%99&idempotencyKey=abc",
    "manual",
  );
  await post(
    app,
    "/books/1/bills",
    "amount=-8&purposeCustom=%E9%80%80%E6%AC%BE&idempotencyKey=def",
    "manual",
  );

  assert.deepEqual(submissions, [
    { amount: 12, key: "abc", purpose: "饮料" },
    { amount: -8, key: "def", purpose: "退款" },
  ]);
});

test("uses default purpose when the mini app form leaves preset and custom blank", async () => {
  const submissions: string[] = [];
  const app = buildTestApp({
    recordBillForBookOnce: (_user, _bookId, _amount, purpose) => {
      submissions.push(purpose);
      return {
        bill: {
          amount: 12,
          bookId: 1,
          bookName: "默认",
          currency: null,
          id: 1,
          occurredAt: new Date(),
          purpose,
          userId: 1,
        },
        book: defaultBook,
      };
    },
  });

  await post(app, "/books/1/bills", "amount=12&idempotencyKey=blank-purpose", "manual");

  assert.deepEqual(submissions, ["默认"]);
});

test("rejects zero amounts from the mini app form", async () => {
  let called = false;
  const app = buildTestApp({
    recordBillForBookOnce: () => {
      called = true;
      throw new Error("Should not record zero-amount bills.");
    },
  });

  const response = await post(
    app,
    "/books/1/bills",
    "amount=0&purpose=%E6%B5%8B%E8%AF%95",
    "manual",
  );

  assert.equal(response.status, 400);
  assert.equal(called, false);
  assert.match(response.text, /记账内容无效/);
});

test("passes submitted book settings without balance fields", async () => {
  let received: {
    currency: string | null;
    monthlyBudget: number | null;
    name: string;
  } | null = null;
  const app = buildTestApp({
    updateBook: (_userId, _bookId, input) => {
      received = {
        currency: input.currency,
        monthlyBudget: input.monthlyBudget,
        name: input.name,
      };
      return {
        ...defaultBook,
        monthlyBudget: input.monthlyBudget,
        name: input.name,
      };
    },
  });

  const response = await post(
    app,
    "/books/1/settings",
    "name=%E9%BB%98%E8%AE%A4&monthlyBudget=50",
    "manual",
  );

  assert.equal(response.status, 302);
  assert.deepEqual(received, {
    currency: null,
    monthlyBudget: 50,
    name: "默认",
  });
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

test("renders paginated month overview for the selected book", async () => {
  const travel = { ...defaultBook, id: 2, isDefault: false, name: "旅行" };
  const calls: Array<[number, number]> = [];
  const app = buildTestApp({
    getBook: () => travel,
    getHistoryMonths: (_user, bookId, page) => {
      calls.push([bookId, page ?? 1]);
      return {
        items: [
          {
            budget: 100,
            expenseTotal: 12,
            incomeTotal: 30,
            monthKey: "2026-05",
            remaining: 88,
          },
        ],
        page: 2,
        pageSize: 12,
        total: 13,
        totalPages: 2,
      };
    },
  });

  const response = await get(app, "/history?bookId=2&page=2");

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [[2, 2]]);
  assert.match(response.text, /data-history-overview/);
  assert.match(response.text, /2026年 5月/);
  assert.match(response.text, /<small>总支出<\/small><strong>¥?12<\/strong>/);
  assert.match(response.text, /<small>总收入<\/small><strong>¥?30<\/strong>/);
  assert.match(response.text, /<small>预算<\/small><strong>¥?100<\/strong>/);
  assert.match(response.text, /<small>结余<\/small><strong>¥?88<\/strong>/);
  assert.match(response.text, /2\/2 页 · 13 个月/);
  assert.match(response.text, /href="\/history\/2026-05\?bookId=2"/);
});

test("renders the selected month's income, expenses, and charts", async () => {
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
        {
          amount: -30,
          bookId: book.id,
          bookName: book.name,
          currency: book.currency,
          id: 2,
          occurredAt: new Date("2026-06-11T04:00:00.000Z"),
          purpose: "退款",
          userId: user.id,
        },
      ],
      billCount: 2,
      expenseTotal: 12,
      incomeTotal: 30,
      netBalance: 18,
    }),
    getSpendingCategories: () => [{ amount: 12, percentage: 100, purpose: "吃饭" }],
  });

  const response = await get(app, "/history/2026-06?bookId=1");

  assert.equal(response.status, 200);
  assert.match(response.text, /aria-label="所选月份收支汇总"/);
  assert.match(response.text, /<span>总支出<\/span>\s*<strong>¥12<\/strong>/);
  assert.match(response.text, /<span>总收入<\/span>\s*<strong>¥30<\/strong>/);
  assert.match(response.text, /data-chart-carousel/);
  assert.match(response.text, /每日总消费/);
  assert.doesNotMatch(response.text, /<span class="muted">¥<\/span>/);
  assert.match(response.text, /编辑该月预算/);
  assert.match(response.text, /href="\/history\?bookId=1"/);
});

test("redirects legacy month query links to the month detail page", async () => {
  const response = await get(buildTestApp(), "/history?bookId=1&month=2026-06", "manual");

  assert.equal(response.status, 302);
  assert.equal(response.location, "/history/2026-06?bookId=1");
});

test("updates only the selected month's budget", async () => {
  let updated: [number, string, number | null] | null = null;
  const app = buildTestApp({
    updateMonthlyBudget: (_userId, bookId, monthKey, budget) => {
      updated = [bookId, monthKey, budget];
    },
  });

  const response = await post(
    app,
    "/history/2026-05/budget?bookId=1",
    "monthlyBudget=2500",
    "manual",
  );

  assert.deepEqual(updated, [1, "2026-05", 2500]);
  assert.equal(response.status, 302);
  assert.equal(response.location, "/history/2026-05?bookId=1");
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
  assert.doesNotMatch(response.text, /<div class="bill-meta">¥<\/div>/);
  assert.match(response.text, /data-dialog-open="book-drawer"/);
  assert.match(response.text, /<dialog class="drawer" id="book-drawer">/);
});

test("caps monthly balance progress at 100% when income pushes balance above budget", async () => {
  const budgetBook = {
    ...defaultBook,
    currency: "CNY",
    monthlyBudget: 100,
    name: "月花费",
  };
  const app = buildTestApp({
    getMonthSummary: () => ({
      ...emptySummary("2026-06"),
      budgetRemaining: 180,
      expenseTotal: 20,
      incomeTotal: 100,
      netBalance: 80,
    }),
    getBook: () => budgetBook,
  });

  const response = await get(app, "/books/1");

  assert.equal(response.status, 200);
  assert.match(response.text, /width: 100.00%/);
  assert.match(response.text, /¥180/);
});

test("renders user settings with timezone selector instead of an account dropdown", async () => {
  const app = buildTestApp();

  const response = await get(app, "/user/settings");

  assert.equal(response.status, 200);
  assert.match(response.text, /用户设置/);
  assert.match(response.text, /name="timezone"/);
  assert.match(response.text, /Asia\/Shanghai/);
  assert.match(response.text, /退出登录/);
  assert.doesNotMatch(response.text, /account-panel/);
});

test("updates user timezone from the user settings page", async () => {
  let receivedTimezone: string | null = null;
  const app = buildTestApp({
    updateUserTimezone: (_userId, timezone) => {
      receivedTimezone = timezone;
      return { ...user, timezone };
    },
  });

  const response = await post(app, "/user/settings", "timezone=America%2FLos_Angeles", "manual");

  assert.equal(response.status, 302);
  assert.equal(response.location, "/user/settings");
  assert.equal(receivedTimezone, "America/Los_Angeles");
});

test("rejects invalid user timezone values", async () => {
  const app = buildTestApp({
    updateUserTimezone: () => {
      throw new InvalidTimeZoneError();
    },
  });

  const response = await post(app, "/user/settings", "timezone=Mars%2FOlympus", "manual");

  assert.equal(response.status, 400);
  assert.match(response.text, /时区无效/);
});

test("hides logout on user settings inside Telegram mini app", async () => {
  const app = buildTestApp({}, "telegram");

  const response = await get(app, "/user/settings");

  assert.equal(response.status, 200);
  assert.doesNotMatch(response.text, /action="\/auth\/logout"/);
});

function buildTestApp(
  overrides: Partial<KeepyService> = {},
  clientSource: ClientSource = "web",
): express.Express {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => {
    req.cookies = {
      [clientSourceCookieName]: clientSource,
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
    getHistoryMonths: () => ({ items: [], page: 1, pageSize: 12, total: 1, totalPages: 1 }),
    getMonthlyBudget: () => null,
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
    updateMonthlyBudget: () => undefined,
    updateUserTimezone: () => user,
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

async function get(app: express.Express, path: string, redirect: "follow" | "manual" = "follow") {
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to start test server.");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { redirect });

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
