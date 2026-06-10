import test from "node:test";
import assert from "node:assert/strict";

import { isLedgerParseSuccess, parseLedgerMessage } from "../lib/money.js";
import { getMonthRange } from "../lib/dates.js";
import {
  BillNotFoundError,
  BookConflictError,
  BookDeleteError,
  BookNotFoundError,
  KeepyService,
} from "../services/keepyService.js";

test("creates a user with one default book", () => {
  const service = KeepyService.fromPath(":memory:");

  const result = service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 1001,
    username: "yan",
  });

  assert.equal(result.created, true);
  assert.equal(result.defaultBook.name, "默认");
  assert.equal(result.defaultBook.isDefault, true);
  assert.equal(service.listBooks(result.user.id).length, 1);

  service.close();
});

test("records bills and calculates monthly budget remaining", () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 1002,
    username: "yan",
  });
  const book = service.updateBook(user.id, defaultBook.id, {
    currency: "CNY",
    currentBalance: null,
    initialBalance: null,
    monthlyBudget: 100,
    name: "默认",
  });
  const expense = parseLedgerMessage("12 午饭 默认", ["默认"]);
  const income = parseLedgerMessage("-20 退款 默认", ["默认"]);

  assert.equal(isLedgerParseSuccess(expense), true);
  assert.equal(isLedgerParseSuccess(income), true);
  if (!isLedgerParseSuccess(expense) || !isLedgerParseSuccess(income)) {
    throw new Error("Expected valid ledger inputs.");
  }

  service.recordBill(user, expense, new Date("2026-06-09T04:00:00.000Z"));
  service.recordBill(user, income, new Date("2026-06-09T05:00:00.000Z"));
  const summary = service.getCurrentMonthSummary(
    user,
    book.id,
    new Date("2026-06-09T06:00:00.000Z"),
  );

  assert.equal(summary.expenseTotal, 12);
  assert.equal(summary.incomeTotal, 20);
  assert.equal(summary.netBalance, 8);
  assert.equal(summary.budgetRemaining, 88);

  service.close();
});

test("keeps only one default book", () => {
  const service = KeepyService.fromPath(":memory:");
  const { user } = service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 1003,
    username: "yan",
  });
  const travel = service.createBook(user.id, "旅行");

  service.setDefaultBook(user.id, travel.id);

  const books = service.listBooks(user.id);
  assert.equal(books.filter((book) => book.isDefault).length, 1);
  assert.equal(service.getDefaultBook(user.id)?.name, "旅行");

  service.close();
});

test("rejects duplicate book names with a business error", () => {
  const service = KeepyService.fromPath(":memory:");
  const { user } = service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 1004,
    username: "yan",
  });

  assert.throws(() => service.createBook(user.id, "默认"), BookConflictError);

  service.close();
});

test("rejects missing default book changes with a business error", () => {
  const service = KeepyService.fromPath(":memory:");
  const { user } = service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 1005,
    username: "yan",
  });

  assert.throws(() => service.setDefaultBook(user.id, 999), BookNotFoundError);

  service.close();
});

test("deletes a non-default book with its bills", () => {
  const service = KeepyService.fromPath(":memory:");
  const { user } = service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 1006,
    username: "yan",
  });
  const travel = service.createBook(user.id, "旅行");

  service.recordBillForBook(user, travel.id, 30, "车票", new Date("2026-06-09T04:00:00.000Z"));
  service.deleteBook(user.id, travel.id);

  assert.equal(service.getBook(user.id, travel.id), null);
  assert.equal(
    service.getCurrentMonthSummary(user, service.ensureDefaultBook(user.id).id).billCount,
    0,
  );

  service.close();
});

test("rejects deleting the default or last book", () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 1007,
    username: "yan",
  });

  assert.throws(() => service.deleteBook(user.id, defaultBook.id), BookDeleteError);

  service.close();
});

test("paginates bills with default page size", () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 1008,
    username: "yan",
  });

  for (let index = 0; index < 25; index += 1) {
    service.recordBillForBook(
      user,
      defaultBook.id,
      index + 1,
      `项目${index}`,
      new Date(`2026-06-${String(index + 1).padStart(2, "0")}T04:00:00.000Z`),
    );
  }

  const range = getMonthRange(new Date("2026-06-20T04:00:00.000Z"), user.timezone);
  const page = service.listBillsForRangePaginated(user.id, defaultBook.id, range);

  assert.equal(page.page, 1);
  assert.equal(page.pageSize, 20);
  assert.equal(page.total, 25);
  assert.equal(page.totalPages, 2);
  assert.equal(page.items.length, 20);

  service.close();
});

test("aggregates spending categories without income", () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 1009,
    username: "yan",
  });
  const rangeDate = new Date("2026-06-09T04:00:00.000Z");

  service.recordBillForBook(user, defaultBook.id, 10, "咖啡", rangeDate);
  service.recordBillForBook(user, defaultBook.id, 30, "咖啡", rangeDate);
  service.recordBillForBook(user, defaultBook.id, 60, "晚饭", rangeDate);
  service.recordBillForBook(user, defaultBook.id, -100, "退款", rangeDate);

  const categories = service.getSpendingCategories(
    user.id,
    defaultBook.id,
    getMonthRange(rangeDate, user.timezone),
  );

  assert.equal(categories.length, 2);
  assert.deepEqual(
    categories.map((category) => [category.purpose, category.amount]),
    [
      ["晚饭", 60],
      ["咖啡", 40],
    ],
  );

  service.close();
});

test("records bills into the specified book only", () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 1010,
    username: "yan",
  });
  const travel = service.createBook(user.id, "旅行");

  service.recordBillForBook(user, travel.id, 88, "酒店", new Date("2026-06-09T04:00:00.000Z"));

  assert.equal(service.getCurrentMonthSummary(user, defaultBook.id).billCount, 0);
  assert.equal(service.getCurrentMonthSummary(user, travel.id).billCount, 1);

  service.close();
});

test("deduplicates mini app bill submissions by idempotency key", () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 1011,
    username: "yan",
  });

  const first = service.recordBillForBookOnce(
    user,
    defaultBook.id,
    6,
    "吃饭",
    "same-submit",
    new Date("2026-06-10T04:00:00.000Z"),
  );
  const second = service.recordBillForBookOnce(
    user,
    defaultBook.id,
    6,
    "吃饭",
    "same-submit",
    new Date("2026-06-10T04:00:00.000Z"),
  );

  assert.equal(first.bill.id, second.bill.id);
  assert.equal(service.getCurrentMonthSummary(user, defaultBook.id).billCount, 1);

  service.close();
});

test("deletes a single bill and restores current balance", () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 1012,
    username: "yan",
  });
  const book = service.updateBook(user.id, defaultBook.id, {
    currency: "CNY",
    currentBalance: 100,
    initialBalance: 100,
    monthlyBudget: null,
    name: "默认",
  });
  const { bill } = service.recordBillForBook(user, book.id, 6, "吃饭");

  assert.equal(service.getBook(user.id, book.id)?.currentBalance, 94);
  service.deleteBill(user.id, bill.id);

  assert.equal(service.getBook(user.id, book.id)?.currentBalance, 100);
  assert.equal(service.getCurrentMonthSummary(user, book.id).billCount, 0);
  assert.throws(() => service.deleteBill(user.id, bill.id), BillNotFoundError);

  service.close();
});

test("replaces a bot entry from one bill to multiple books", () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 1013,
    username: "yan",
  });
  const travel = service.createBook(user.id, "旅行");
  const entry = service.upsertBotEntry({
    chatId: "42",
    messageId: 100,
    rawText: "12 午饭",
    status: "valid",
    userId: user.id,
  });

  service.replaceBotEntryBills(
    entry.id,
    "12 午饭",
    [{ amount: 12, bookId: defaultBook.id, purpose: "午饭" }],
    new Date("2026-06-10T04:00:00.000Z"),
  );
  service.replaceBotEntryBills(
    entry.id,
    "12 午饭 默认 旅行",
    [
      { amount: 12, bookId: defaultBook.id, purpose: "午饭" },
      { amount: 12, bookId: travel.id, purpose: "午饭" },
    ],
    new Date("2026-06-10T05:00:00.000Z"),
  );

  assert.equal(
    service.getCurrentMonthSummary(user, defaultBook.id, new Date("2026-06-10T06:00:00.000Z"))
      .billCount,
    1,
  );
  assert.equal(
    service.getCurrentMonthSummary(user, travel.id, new Date("2026-06-10T06:00:00.000Z")).billCount,
    1,
  );
  assert.equal(service.countBotEntryBills(entry.id), 2);

  service.close();
});

test("replaces a bot entry from multiple books to one bill", () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 1014,
    username: "yan",
  });
  const travel = service.createBook(user.id, "旅行");
  const entry = service.upsertBotEntry({
    chatId: "42",
    messageId: 101,
    rawText: "20 晚饭 默认 旅行",
    status: "valid",
    userId: user.id,
  });

  service.replaceBotEntryBills(
    entry.id,
    "20 晚饭 默认 旅行",
    [
      { amount: 20, bookId: defaultBook.id, purpose: "晚饭" },
      { amount: 20, bookId: travel.id, purpose: "晚饭" },
    ],
    new Date("2026-06-10T04:00:00.000Z"),
  );
  service.replaceBotEntryBills(
    entry.id,
    "20 晚饭",
    [{ amount: 20, bookId: defaultBook.id, purpose: "晚饭" }],
    new Date("2026-06-10T05:00:00.000Z"),
  );

  assert.equal(
    service.getCurrentMonthSummary(user, defaultBook.id, new Date("2026-06-10T06:00:00.000Z"))
      .expenseTotal,
    20,
  );
  assert.equal(
    service.getCurrentMonthSummary(user, travel.id, new Date("2026-06-10T06:00:00.000Z")).billCount,
    0,
  );
  assert.equal(service.countBotEntryBills(entry.id), 1);

  service.close();
});

test("keeps existing bot bills when an entry is marked invalid", () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 1015,
    username: "yan",
  });
  const entry = service.upsertBotEntry({
    chatId: "42",
    messageId: 102,
    rawText: "8 咖啡",
    status: "valid",
    userId: user.id,
  });

  service.replaceBotEntryBills(
    entry.id,
    "8 咖啡",
    [{ amount: 8, bookId: defaultBook.id, purpose: "咖啡" }],
    new Date("2026-06-10T04:00:00.000Z"),
  );
  const invalidEntry = service.markBotEntryInvalid(
    entry.id,
    "咖啡 8",
    "记账格式应为：数字 [用途] [账本]",
  );

  assert.equal(invalidEntry.status, "invalid");
  assert.equal(service.countBotEntryBills(entry.id), 1);
  assert.equal(
    service.getCurrentMonthSummary(user, defaultBook.id, new Date("2026-06-10T06:00:00.000Z"))
      .expenseTotal,
    8,
  );

  service.close();
});

test("records an invalid bot entry and later replaces it with a bill", () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 1016,
    username: "yan",
  });
  const entry = service.upsertBotEntry({
    chatId: "42",
    lastError: "记账格式应为：数字 [用途] [账本]",
    messageId: 103,
    rawText: "午饭 12",
    status: "invalid",
    userId: user.id,
  });

  assert.equal(service.countBotEntryBills(entry.id), 0);
  service.replaceBotEntryBills(
    entry.id,
    "12 午饭",
    [{ amount: 12, bookId: defaultBook.id, purpose: "午饭" }],
    entry.createdAt,
  );

  const updatedEntry = service.getBotEntry(user.id, "42", 103);
  assert.equal(updatedEntry?.status, "valid");
  assert.equal(service.countBotEntryBills(entry.id), 1);
  assert.equal(
    service.getCurrentMonthSummary(user, defaultBook.id, entry.createdAt).expenseTotal,
    12,
  );

  service.close();
});
