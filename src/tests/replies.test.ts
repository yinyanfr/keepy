import test from "node:test";
import assert from "node:assert/strict";

import { billCreatedText, billsText } from "../features/bot/replies.js";

test("formats bot bill confirmation with budget remaining", () => {
  const text = billCreatedText({
    bill: {
      amount: 12,
      bookId: 1,
      bookName: "默认",
      currency: "CNY",
      id: 1,
      occurredAt: new Date("2026-06-09T04:00:00.000Z"),
      purpose: "午饭",
      userId: 1,
    },
    book: {
      currency: "CNY",
      currentBalance: null,
      id: 1,
      initialBalance: null,
      isDefault: true,
      monthlyBudget: 100,
      name: "默认",
      userId: 1,
    },
    summary: {
      billCount: 1,
      bills: [],
      budgetRemaining: 88,
      expenseTotal: 12,
      incomeTotal: 0,
      monthKey: "2026-06",
      netBalance: -12,
    },
    user: {
      firstName: "Yan",
      id: 1,
      lastName: null,
      photoUrl: null,
      telegramId: 42,
      timezone: "Asia/Shanghai",
      username: "yan",
    },
  });

  assert.match(text, /成功于2026-06-09 12:00/);
  assert.match(text, /用于午饭的¥12/);
  assert.match(text, /预算余额¥88/);
});

test("formats bills command as category summary", () => {
  const text = billsText({
    book: {
      currency: "CNY",
      currentBalance: null,
      id: 1,
      initialBalance: null,
      isDefault: true,
      monthlyBudget: null,
      name: "默认",
      userId: 1,
    },
    categories: [
      { amount: 30, percentage: 75, purpose: "晚饭" },
      { amount: 10, percentage: 25, purpose: "咖啡" },
    ],
    summary: {
      billCount: 3,
      bills: [],
      budgetRemaining: null,
      expenseTotal: 40,
      incomeTotal: 100,
      monthKey: "2026-06",
      netBalance: 60,
    },
  });

  assert.match(text, /累计消费：¥40/);
  assert.match(text, /类型消费：/);
  assert.match(text, /晚饭：¥30/);
  assert.doesNotMatch(text, /明细/);
});
