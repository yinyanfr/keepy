import { Router, type Request, type Response, type NextFunction } from "express";
import { webhookCallback, type Bot } from "grammy";

import type { AppConfig } from "../configs/env.js";

export function createTelegramRouter(bot: Bot, config: AppConfig): Router {
  const router = Router();
  const middleware = webhookCallback(bot, "express");

  router.post(
    "/telegram/webhook/:secret",
    (req: Request, res: Response, next: NextFunction) => {
      if (req.params.secret !== config.webhookSecret) {
        res.sendStatus(404);
        return;
      }

      const secretHeader = req.header("X-Telegram-Bot-Api-Secret-Token");
      if (secretHeader !== config.webhookSecret) {
        res.sendStatus(403);
        return;
      }

      next();
    },
    middleware,
  );

  return router;
}
