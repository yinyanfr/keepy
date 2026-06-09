import test from "node:test";
import assert from "node:assert/strict";

import { isLedgerParseSuccess, parseLedgerMessage } from "../lib/money.js";
import { BookConflictError, BookNotFoundError, KeepyService } from "../services/keepyService.js";

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
