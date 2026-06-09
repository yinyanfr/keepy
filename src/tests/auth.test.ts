import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../configs/env.js";
import { verifyLoginWidgetAuth, verifyWebAppInitData } from "../lib/telegramAuth.js";

const botToken = "12345:test-token";
const now = new Date("2026-06-09T12:00:00.000Z");
const currentAuthDate = String(Math.floor(now.getTime() / 1000));
const staleAuthDate = String(Math.floor(now.getTime() / 1000) - 25 * 60 * 60);

test("verifies Telegram WebApp initData hash", () => {
  const params = new URLSearchParams({
    auth_date: currentAuthDate,
    query_id: "abc",
    user: JSON.stringify({
      first_name: "Yan",
      id: 42,
      username: "yan",
    }),
  });
  params.set("hash", webAppHash(params));

  const user = verifyWebAppInitData(params.toString(), botToken, now);

  assert.equal(user?.telegramId, 42);
  assert.equal(user?.username, "yan");
});

test("rejects stale Telegram WebApp initData", () => {
  const params = new URLSearchParams({
    auth_date: staleAuthDate,
    user: JSON.stringify({
      first_name: "Yan",
      id: 42,
    }),
  });
  params.set("hash", webAppHash(params));

  assert.equal(verifyWebAppInitData(params.toString(), botToken, now), null);
});

test("verifies Telegram Login Widget hash", () => {
  const params = new URLSearchParams({
    auth_date: currentAuthDate,
    first_name: "Yan",
    id: "42",
    username: "yan",
  });
  params.set("hash", loginWidgetHash(params));

  const user = verifyLoginWidgetAuth(params, botToken, now);

  assert.equal(user?.telegramId, 42);
  assert.equal(user?.firstName, "Yan");
});

test("rejects stale Telegram Login Widget auth", () => {
  const params = new URLSearchParams({
    auth_date: staleAuthDate,
    first_name: "Yan",
    id: "42",
  });
  params.set("hash", loginWidgetHash(params));

  assert.equal(verifyLoginWidgetAuth(params, botToken, now), null);
});

test("requires production session and webhook secrets", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSessionSecret = process.env.SESSION_SECRET;
  const originalWebhookSecret = process.env.WEBHOOK_SECRET;

  try {
    process.env.NODE_ENV = "production";
    delete process.env.SESSION_SECRET;
    delete process.env.WEBHOOK_SECRET;

    assert.throws(() => loadConfig(), /SESSION_SECRET/);

    process.env.SESSION_SECRET = "session-secret";
    assert.throws(() => loadConfig(), /WEBHOOK_SECRET/);
  } finally {
    restoreEnv("NODE_ENV", originalNodeEnv);
    restoreEnv("SESSION_SECRET", originalSessionSecret);
    restoreEnv("WEBHOOK_SECRET", originalWebhookSecret);
  }
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

function checkString(params: URLSearchParams): string {
  return [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function webAppHash(params: URLSearchParams): string {
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  return createHmac("sha256", secret).update(checkString(params)).digest("hex");
}

function loginWidgetHash(params: URLSearchParams): string {
  const secret = createHash("sha256").update(botToken).digest();
  return createHmac("sha256", secret).update(checkString(params)).digest("hex");
}
