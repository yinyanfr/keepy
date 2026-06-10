import test from "node:test";
import assert from "node:assert/strict";

import { formatAmount, isLedgerParseSuccess, parseLedgerMessage } from "../lib/money.js";

test("parses amount without purpose into default purpose and default book", () => {
  const result = parseLedgerMessage("12", ["默认"]);

  assert.equal(isLedgerParseSuccess(result), true);
  if (isLedgerParseSuccess(result)) {
    assert.equal(result.amount, 12);
    assert.equal(result.purpose, "默认");
    assert.equal(result.bookName, null);
  }
});

test("treats a single field after amount as purpose", () => {
  const result = parseLedgerMessage("12 午饭", ["午饭"]);

  assert.equal(isLedgerParseSuccess(result), true);
  if (isLedgerParseSuccess(result)) {
    assert.equal(result.purpose, "午饭");
    assert.equal(result.bookName, null);
  }
});

test("uses the last field as book only when it matches an existing book", () => {
  const result = parseLedgerMessage("59.9 咖啡 默认", ["默认"]);

  assert.equal(isLedgerParseSuccess(result), true);
  if (isLedgerParseSuccess(result)) {
    assert.equal(result.amount, 59.9);
    assert.equal(result.purpose, "咖啡");
    assert.equal(result.bookName, "默认");
  }
});

test("uses four or more fields as a multi-book entry", () => {
  const result = parseLedgerMessage("59.9 咖啡 默认 旅行", ["默认", "旅行"]);

  assert.equal(isLedgerParseSuccess(result), true);
  if (isLedgerParseSuccess(result)) {
    assert.equal(result.amount, 59.9);
    assert.equal(result.purpose, "咖啡");
    assert.deepEqual(result.bookNames, ["默认", "旅行"]);
  }
});

test("keeps three or fewer fields on the legacy amount purpose book path", () => {
  const result = parseLedgerMessage("59.9 咖啡 旅行", ["默认", "旅行"]);

  assert.equal(isLedgerParseSuccess(result), true);
  if (isLedgerParseSuccess(result)) {
    assert.equal(result.purpose, "咖啡");
    assert.equal(result.bookName, "旅行");
    assert.equal(result.bookNames, undefined);
  }
});

test("rejects missing books in multi-book entries", () => {
  const result = parseLedgerMessage("59.9 咖啡 默认 不存在", ["默认"]);

  assert.equal(isLedgerParseSuccess(result), false);
  if (!isLedgerParseSuccess(result)) {
    assert.match(result.error, /账本不存在：不存在/);
  }
});

test("supports negative income and rejects invalid amount", () => {
  const income = parseLedgerMessage("-3000 工资", []);
  const invalid = parseLedgerMessage("午饭 12", []);

  assert.equal(isLedgerParseSuccess(income), true);
  if (isLedgerParseSuccess(income)) {
    assert.equal(income.amount, -3000);
  }
  assert.equal(isLedgerParseSuccess(invalid), false);
});

test("formats common currencies as symbols", () => {
  assert.equal(formatAmount(3.5, "CNY"), "¥3.50");
  assert.equal(formatAmount(3.5, "USD"), "$3.50");
  assert.equal(formatAmount(3.5, "EUR"), "€3.50");
  assert.equal(formatAmount(3.5, "BTC"), "BTC3.50");
});
