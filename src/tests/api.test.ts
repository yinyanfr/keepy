import assert from "node:assert/strict";
import cookieParser from "cookie-parser";
import express from "express";
import test from "node:test";

import type { AppConfig } from "../configs/env.js";
import { createSessionValue, sessionCookieName } from "../lib/session.js";
import { createApiRouter } from "../routes/api.js";
import { KeepyService } from "../services/keepyService.js";

const config: AppConfig = {
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

test("api me requires a session", async () => {
  const service = KeepyService.fromPath(":memory:");
  const app = buildApiApp(service);

  const response = await get(app, "/api/me");

  assert.equal(response.status, 401);
  service.close();
});

test("api me returns current user books and purposes", async () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = seedUser(service);
  service.recordBillForBook(user, defaultBook.id, 12, "咖啡");
  const app = buildApiApp(service, user.telegramId);

  const response = await get(app, "/api/me");
  const data = JSON.parse(response.text) as {
    books: Array<{ id: number }>;
    defaultBookId: number;
    purposes: string[];
  };

  assert.equal(response.status, 200);
  assert.equal(data.defaultBookId, defaultBook.id);
  assert.equal(data.books.length, 1);
  assert.deepEqual(data.purposes, ["咖啡"]);
  service.close();
});

test("api bill creation is idempotent by key", async () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = seedUser(service);
  const app = buildApiApp(service, user.telegramId);

  await postJson(app, `/api/books/${defaultBook.id}/bills`, {
    amount: 6,
    idempotencyKey: "same-key",
    purpose: "饮料",
  });
  await postJson(app, `/api/books/${defaultBook.id}/bills`, {
    amount: 6,
    idempotencyKey: "same-key",
    purpose: "饮料",
  });

  assert.equal(service.getCurrentMonthSummary(user, defaultBook.id).billCount, 1);
  service.close();
});

test("api bill creation prefers custom purpose, then preset, then default", async () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = seedUser(service);
  const app = buildApiApp(service, user.telegramId);

  await postJson(app, `/api/books/${defaultBook.id}/bills`, {
    amount: 6,
    idempotencyKey: "custom-purpose",
    purposeCustom: "夜宵",
    purposePreset: "饮料",
  });
  await postJson(app, `/api/books/${defaultBook.id}/bills`, {
    amount: 7,
    idempotencyKey: "preset-purpose",
    purposePreset: "公交",
  });
  await postJson(app, `/api/books/${defaultBook.id}/bills`, {
    amount: 8,
    idempotencyKey: "default-purpose",
  });

  const purposes = service
    .getCurrentMonthSummary(user, defaultBook.id)
    .bills.map((bill) => bill.purpose)
    .sort();

  assert.deepEqual(purposes, ["公交", "夜宵", "默认"]);
  service.close();
});

test("api sync bills returns per-item results", async () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = seedUser(service);
  const app = buildApiApp(service, user.telegramId);

  const response = await postJson(app, "/api/sync/bills", {
    bills: [
      {
        amount: 10,
        bookId: defaultBook.id,
        clientId: "local-1",
        idempotencyKey: "local-1",
        occurredAt: "2026-06-10T04:00:00.000Z",
        purpose: "吃饭",
      },
      {
        amount: 5,
        bookId: 999,
        clientId: "local-2",
        idempotencyKey: "local-2",
        occurredAt: "2026-06-10T04:00:00.000Z",
        purpose: "公交",
      },
    ],
  });
  const data = JSON.parse(response.text) as { results: Array<{ clientId: string; ok: boolean }> };

  assert.equal(response.status, 200);
  assert.deepEqual(
    data.results.map((result) => [result.clientId, result.ok]),
    [
      ["local-1", true],
      ["local-2", false],
    ],
  );
  service.close();
});

test("api bill creation rejects zero amounts", async () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = seedUser(service);
  const app = buildApiApp(service, user.telegramId);

  const response = await postJson(app, `/api/books/${defaultBook.id}/bills`, {
    amount: 0,
    idempotencyKey: "zero-amount",
    purpose: "测试",
  });

  assert.equal(response.status, 400);
  assert.equal(service.getCurrentMonthSummary(user, defaultBook.id).billCount, 0);
  service.close();
});

test("api sync bills rejects zero amounts per item", async () => {
  const service = KeepyService.fromPath(":memory:");
  const { user, defaultBook } = seedUser(service);
  const app = buildApiApp(service, user.telegramId);

  const response = await postJson(app, "/api/sync/bills", {
    bills: [
      {
        amount: 0,
        bookId: defaultBook.id,
        clientId: "local-zero",
        idempotencyKey: "local-zero",
        occurredAt: "2026-06-10T04:00:00.000Z",
        purpose: "测试",
      },
    ],
  });
  const data = JSON.parse(response.text) as { results: Array<{ clientId: string; ok: boolean }> };

  assert.equal(response.status, 200);
  assert.deepEqual(data.results, [{ clientId: "local-zero", error: "记账内容无效。", ok: false }]);
  assert.equal(service.getCurrentMonthSummary(user, defaultBook.id).billCount, 0);
  service.close();
});

test("pwa manifest and service worker are static assets", async () => {
  const app = express();
  app.use(express.static("public"));

  const manifest = await get(app, "/manifest.webmanifest");
  const worker = await get(app, "/service-worker.js");

  assert.equal(manifest.status, 200);
  assert.match(manifest.text, /"name": "Keepy"/);
  assert.equal(worker.status, 200);
  assert.match(worker.text, /STATIC_ASSETS/);
});

function buildApiApp(service: KeepyService, telegramId?: number): express.Express {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  if (telegramId !== undefined) {
    app.use((req, _res, next) => {
      req.cookies = {
        [sessionCookieName]: createSessionValue(telegramId, config.sessionSecret),
      };
      next();
    });
  }
  app.use(createApiRouter(service, config));
  return app;
}

function seedUser(service: KeepyService): ReturnType<KeepyService["ensureUser"]> {
  return service.ensureUser({
    firstName: "Yan",
    lastName: null,
    photoUrl: null,
    telegramId: 42,
    username: "yan",
  });
}

async function get(app: express.Express, path: string) {
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Failed to start server.");
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    return { status: response.status, text: await response.text() };
  } finally {
    await closeServer(server);
  }
}

async function postJson(app: express.Express, path: string, body: unknown) {
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Failed to start server.");
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    return { status: response.status, text: await response.text() };
  } finally {
    await closeServer(server);
  }
}

async function closeServer(server: ReturnType<express.Express["listen"]>): Promise<void> {
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
