import test from "node:test";
import assert from "node:assert/strict";

import { isLedgerParseSuccess, parseLedgerMessage } from "../lib/money.js";

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

test("supports negative income and rejects invalid amount", () => {
  const income = parseLedgerMessage("-3000 工资", []);
  const invalid = parseLedgerMessage("午饭 12", []);

  assert.equal(isLedgerParseSuccess(income), true);
  if (isLedgerParseSuccess(income)) {
    assert.equal(income.amount, -3000);
  }
  assert.equal(isLedgerParseSuccess(invalid), false);
});
