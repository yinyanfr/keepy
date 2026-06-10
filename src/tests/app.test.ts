import assert from "node:assert/strict";
import test from "node:test";

import { start } from "../app.js";
import type { AppConfig } from "../configs/env.js";

test("starts long polling when PUBLIC_URL is empty", async () => {
  let pollingStarted = false;
  let listenPort: number | null = null;

  const config: AppConfig = {
    botToken: "test-token",
    botUsername: "keepy_bot",
    databasePath: ":memory:",
    isProduction: false,
    port: 3000,
    publicUrl: "",
    sessionSecret: "session-secret",
    webhookSecret: "webhook-secret",
  };

  await start({
    app: {
      listen: (port: number, callback?: () => void) => {
        listenPort = port;
        callback?.();
        return {};
      },
    } as never,
    bot: {
      api: {
        setWebhook: async () => undefined,
      },
      init: async () => undefined,
      start: async () => {
        pollingStarted = true;
      },
    } as never,
    config,
    service: {} as never,
  });

  assert.equal(pollingStarted, true);
  assert.equal(listenPort, 3000);
});

test("listens before Telegram initialization completes", async () => {
  let listenPort: number | null = null;
  let resolveInit: (() => void) | null = null;

  const config: AppConfig = {
    botToken: "test-token",
    botUsername: "keepy_bot",
    databasePath: ":memory:",
    isProduction: false,
    port: 3001,
    publicUrl: "https://example.test",
    sessionSecret: "session-secret",
    webhookSecret: "webhook-secret",
  };
  const startPromise = start({
    app: {
      listen: (port: number, callback?: () => void) => {
        listenPort = port;
        callback?.();
        return {};
      },
    } as never,
    bot: {
      api: {
        setWebhook: async () => undefined,
      },
      init: async () =>
        new Promise<void>((resolve) => {
          resolveInit = resolve;
        }),
      start: async () => undefined,
    } as never,
    config,
    service: {} as never,
  });

  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(listenPort, 3001);
  assert.ok(resolveInit);
  const finishInit = resolveInit as () => void;
  finishInit();
  await startPromise;
});
