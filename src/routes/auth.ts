import { Router, type Request, type Response } from "express";

import type { AppConfig } from "../configs/env.js";
import { clientSourceCookieName, type ClientSource } from "../lib/clientSource.js";
import { createSessionValue, readSessionValue, sessionCookieName } from "../lib/session.js";
import { verifyLoginWidgetAuth, verifyWebAppInitData } from "../lib/telegramAuth.js";
import type { KeepyService } from "../services/keepyService.js";

const sessionMaxAgeMs = 30 * 24 * 60 * 60 * 1000;
const clientSourceMaxAgeMs = sessionMaxAgeMs;

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
    setClientSourceCookie(res, "telegram", config);
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
    setClientSourceCookie(res, "web", config);
    res.redirect("/");
  });

  router.post("/auth/logout", (_req: Request, res: Response) => {
    res.setHeader("Clear-Site-Data", '"cache", "storage"');
    res.clearCookie(sessionCookieName);
    res.clearCookie(clientSourceCookieName);
    res.redirect("/");
  });

  router.get("/auth/avatar", async (req: Request, res: Response) => {
    const telegramId = readSessionValue(req.cookies?.[sessionCookieName], config.sessionSecret);
    if (telegramId === null) {
      res.status(401).end();
      return;
    }

    const user = service.getUserByTelegramId(telegramId);
    if (!user) {
      res.status(404).end();
      return;
    }

    const photo = await fetchTelegramAvatar(config.botToken, user.telegramId);
    if (!photo) {
      res.status(404).end();
      return;
    }

    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Type", photo.contentType);
    res.send(Buffer.from(photo.bytes));
  });

  return router;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
}

interface TelegramFile {
  file_path?: string;
}

interface TelegramPhotoSize {
  file_id: string;
}

interface TelegramUserProfilePhotos {
  photos: TelegramPhotoSize[][];
  total_count: number;
}

async function fetchTelegramAvatar(
  botToken: string,
  telegramId: number,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  try {
    const photosResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${telegramId}&limit=1`,
    );
    const photos = (await photosResponse.json()) as TelegramApiResponse<TelegramUserProfilePhotos>;
    const sizes = photos.ok ? photos.result?.photos[0] : null;
    const largest = sizes?.at(-1);
    if (!largest) {
      return null;
    }

    const fileResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(
        largest.file_id,
      )}`,
    );
    const file = (await fileResponse.json()) as TelegramApiResponse<TelegramFile>;
    if (!file.ok || !file.result?.file_path) {
      return null;
    }

    const imageResponse = await fetch(
      `https://api.telegram.org/file/bot${botToken}/${file.result.file_path}`,
    );
    if (!imageResponse.ok) {
      return null;
    }

    return {
      bytes: await imageResponse.arrayBuffer(),
      contentType: imageResponse.headers.get("content-type") ?? "image/jpeg",
    };
  } catch {
    return null;
  }
}

function setSessionCookie(res: Response, telegramId: number, config: AppConfig): void {
  res.cookie(sessionCookieName, createSessionValue(telegramId, config.sessionSecret), {
    httpOnly: true,
    maxAge: sessionMaxAgeMs,
    sameSite: "lax",
    secure: config.isProduction,
  });
}

function setClientSourceCookie(res: Response, source: ClientSource, config: AppConfig): void {
  res.cookie(clientSourceCookieName, source, {
    httpOnly: true,
    maxAge: clientSourceMaxAgeMs,
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
