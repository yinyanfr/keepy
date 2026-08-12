import cookieParser from "cookie-parser";
import express from "express";
import type { Server } from "node:http";
import { join } from "node:path";

import { createKeepyBot } from "./features/bot/bot.js";
import { loadConfig, requireBotToken, type AppConfig } from "./configs/env.js";
import { createApiRouter } from "./routes/api.js";
import { createAuthRouter } from "./routes/auth.js";
import { createMiniAppRouter } from "./routes/miniApp.js";
import { createTelegramRouter } from "./routes/telegram.js";
import { KeepyService } from "./services/keepyService.js";

export interface KeepyRuntime {
  app: express.Express;
  bot: ReturnType<typeof createKeepyBot>;
  config: AppConfig;
  service: KeepyService;
}

export function createRuntime(config = loadConfig()): KeepyRuntime {
  requireBotToken(config);

  const service = KeepyService.fromPath(config.databasePath);
  const bot = createKeepyBot(service, config);
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.get("/healthz", (_req, res) => {
    res.status(200).type("text/plain").send("ok");
  });
  app.use(express.static(join(process.cwd(), "public")));
  app.use(createAuthRouter(service, config));
  app.use(createApiRouter(service, config));
  app.use(createTelegramRouter(bot, config));
  app.use(createMiniAppRouter(service, config));

  return { app, bot, config, service };
}

export async function start(runtime = createRuntime()): Promise<Server> {
  const server = await new Promise<Server>((resolve) => {
    const listeningServer = runtime.app.listen(runtime.config.port, () => {
      console.log(`Keepy listening on http://localhost:${runtime.config.port}`);
      queueMicrotask(() => resolve(listeningServer));
    });
  });

  try {
    await runtime.bot.init();

    if (runtime.config.publicUrl) {
      const webhookUrl = `${runtime.config.publicUrl}/telegram/webhook/${runtime.config.webhookSecret}`;
      await runtime.bot.api.setWebhook(webhookUrl, {
        secret_token: runtime.config.webhookSecret,
      });
      console.log(`Telegram webhook set: ${webhookUrl}`);
    } else {
      console.warn("PUBLIC_URL is empty; Telegram webhook was not set.");
      void runtime.bot.start().catch((error: unknown) => {
        console.error("Telegram polling failed", error);
      });
    }
  } catch (error) {
    server.close();
    runtime.service.close();
    throw error;
  }

  return server;
}
