import { Router, type Request, type Response, type NextFunction } from "express";
import { webhookCallback, type Bot } from "grammy";

import type { AppConfig } from "../configs/env.js";

export function createTelegramRouter(bot: Bot, config: AppConfig): Router {
  const router = Router();
  const middleware = webhookCallback(bot, "express");

  router.post(
    "/telegram/webhook/:secret",
    (req: Request, res: Response, next: NextFunction) => {
      const status = validateTelegramWebhookRequest(
        typeof req.params.secret === "string" ? req.params.secret : undefined,
        req.header("X-Telegram-Bot-Api-Secret-Token"),
        config.webhookSecret,
      );
      if (status !== null) {
        res.sendStatus(status);
        return;
      }

      next();
    },
    middleware,
  );

  return router;
}

export function validateTelegramWebhookRequest(
  pathSecret: string | undefined,
  headerSecret: string | undefined,
  webhookSecret: string,
): 403 | 404 | null {
  if (pathSecret !== webhookSecret) {
    return 404;
  }

  if (headerSecret !== undefined && headerSecret !== webhookSecret) {
    return 403;
  }

  return null;
}
