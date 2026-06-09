import { Router, type Request, type Response } from "express";

import type { AppConfig } from "../configs/env.js";
import { createSessionValue, sessionCookieName } from "../lib/session.js";
import { verifyLoginWidgetAuth, verifyWebAppInitData } from "../lib/telegramAuth.js";
import type { KeepyService } from "../services/keepyService.js";

const sessionMaxAgeMs = 30 * 24 * 60 * 60 * 1000;

export function createAuthRouter(service: KeepyService, config: AppConfig): Router {
  const router = Router();

  router.post("/auth/telegram-webapp", (req: Request, res: Response) => {
    const initData = typeof req.body?.initData === "string" ? req.body.initData : "";
    const user = verifyWebAppInitData(initData, config.botToken);

    if (!user) {
      res.status(401).json({ ok: false });
      return;
    }

    service.ensureUser(user);
    setSessionCookie(res, user.telegramId, config);
    res.json({ ok: true });
  });

  router.get("/auth/telegram-login", (req: Request, res: Response) => {
    const user = verifyLoginWidgetAuth(queryToSearchParams(req.query), config.botToken);

    if (!user) {
      res.status(401).send("Telegram login failed.");
      return;
    }

    service.ensureUser(user);
    setSessionCookie(res, user.telegramId, config);
    res.redirect("/");
  });

  router.post("/auth/logout", (_req: Request, res: Response) => {
    res.clearCookie(sessionCookieName);
    res.redirect("/");
  });

  return router;
}

function setSessionCookie(res: Response, telegramId: number, config: AppConfig): void {
  res.cookie(sessionCookieName, createSessionValue(telegramId, config.sessionSecret), {
    httpOnly: true,
    maxAge: sessionMaxAgeMs,
    sameSite: "lax",
    secure: config.isProduction,
  });
}

function queryToSearchParams(query: Request["query"]): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  return params;
}
