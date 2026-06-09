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
