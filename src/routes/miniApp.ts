import { Router, type Request, type Response } from "express";

import type { AppConfig } from "../configs/env.js";
import {
  renderBooks,
  renderHistory,
  renderHome,
  renderLogin,
  renderSettings,
} from "../features/miniApp/pages.js";
import { readSessionValue, sessionCookieName } from "../lib/session.js";
import {
  BookConflictError,
  BookNotFoundError,
  type KeepyService,
  type User,
} from "../services/keepyService.js";

export function createMiniAppRouter(service: KeepyService, config: AppConfig): Router {
  const router = Router();

  router.get("/", (req: Request, res: Response) => {
    const user = currentUser(req, service, config);
    if (!user) {
      res.send(renderLogin(config));
      return;
    }

    const defaultBook = service.ensureDefaultBook(user.id);
    const summary = service.getCurrentMonthSummary(user, defaultBook.id);
    res.send(renderHome({ book: defaultBook, summary, user }));
  });

  router.get("/settings", (req: Request, res: Response) => {
    const user = requireUser(req, res, service, config);
    if (!user) {
      return;
    }

    res.send(renderSettings({ book: service.ensureDefaultBook(user.id), user }));
  });

  router.post("/settings", (req: Request, res: Response) => {
    const user = requireUser(req, res, service, config);
    if (!user) {
      return;
    }

    const book = service.ensureDefaultBook(user.id);
    try {
      service.updateBook(user.id, book.id, {
        currency: textBody(req, "currency"),
        currentBalance: numberBody(req, "currentBalance"),
        initialBalance: numberBody(req, "initialBalance"),
        monthlyBudget: numberBody(req, "monthlyBudget"),
        name: textBody(req, "name") ?? book.name,
      });
    } catch (error) {
      if (error instanceof BookConflictError) {
        res.status(400).send("账本名字已存在。");
        return;
      }

      throw error;
    }

    res.redirect("/settings");
  });

  router.get("/books", (req: Request, res: Response) => {
    const user = requireUser(req, res, service, config);
    if (!user) {
      return;
    }

    res.send(renderBooks({ books: service.listBooks(user.id), user }));
  });

  router.post("/books", (req: Request, res: Response) => {
    const user = requireUser(req, res, service, config);
    if (!user) {
      return;
    }

    const name = textBody(req, "name");
    if (!name) {
      res.status(400).send("账本名字不能为空。");
      return;
    }

    try {
      service.createBook(user.id, name, {
        currency: textBody(req, "currency"),
        monthlyBudget: numberBody(req, "monthlyBudget"),
      });
    } catch (error) {
      if (error instanceof BookConflictError) {
        res.status(400).send("账本名字已存在。");
        return;
      }

      throw error;
    }

    res.redirect("/books");
  });

  router.post("/books/default", (req: Request, res: Response) => {
    const user = requireUser(req, res, service, config);
    if (!user) {
      return;
    }

    const bookId = Number(textBody(req, "bookId"));
    if (!Number.isInteger(bookId)) {
      res.status(400).send("账本无效。");
      return;
    }

    try {
      service.setDefaultBook(user.id, bookId);
    } catch (error) {
      if (error instanceof BookNotFoundError) {
        res.status(400).send("账本无效。");
        return;
      }

      throw error;
    }

    res.redirect("/books");
  });

  router.get("/history", (req: Request, res: Response) => {
    const user = requireUser(req, res, service, config);
    if (!user) {
      return;
    }

    res.send(renderHistory({ groups: service.getHistory(user), user }));
  });

  return router;
}

function currentUser(req: Request, service: KeepyService, config: AppConfig): User | null {
  const telegramId = readSessionValue(req.cookies?.[sessionCookieName], config.sessionSecret);
  return telegramId === null ? null : service.getUserByTelegramId(telegramId);
}

function requireUser(
  req: Request,
  res: Response,
  service: KeepyService,
  config: AppConfig,
): User | null {
  const user = currentUser(req, service, config);
  if (!user) {
    res.redirect("/");
    return null;
  }

  return user;
}

function textBody(req: Request, key: string): string | null {
  const value = req.body?.[key];
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

function numberBody(req: Request, key: string): number | null {
  const value = textBody(req, key);
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
