import assert from "node:assert/strict";
import test from "node:test";

import {
  getMonthRange,
  monthDistance,
  monthRangeFromKey,
  parseMonthKey,
  shiftMonthKey,
} from "../lib/dates.js";

test("parses strict month keys", () => {
  assert.deepEqual(parseMonthKey("2026-09"), { month: 9, year: 2026 });
  assert.equal(parseMonthKey("2026-9"), null);
  assert.equal(parseMonthKey("2026-13"), null);
  assert.equal(parseMonthKey("0099-12"), null);
});

test("shifts month keys across years", () => {
  assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
  assert.equal(shiftMonthKey("2025-12", 2), "2026-02");
  assert.equal(monthDistance("2026-09", "2025-08"), 13);
});

test("calculates month boundaries in the user's timezone", () => {
  const shanghai = getMonthRange(new Date("2026-09-30T17:00:00.000Z"), "Asia/Shanghai");
  assert.equal(shanghai.key, "2026-10");
  assert.equal(shanghai.start.toISOString(), "2026-09-30T16:00:00.000Z");
  assert.equal(shanghai.end.toISOString(), "2026-10-31T16:00:00.000Z");

  const newYork = monthRangeFromKey("2026-03", "America/New_York");
  assert.equal(newYork.start.toISOString(), "2026-03-01T05:00:00.000Z");
  assert.equal(newYork.end.toISOString(), "2026-04-01T04:00:00.000Z");
});
