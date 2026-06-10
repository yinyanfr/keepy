import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";

import type { AppConfig } from "../configs/env.js";
import {
  renderBooks,
  renderHistory,
  renderHome,
  renderLogin,
  renderSettings,
} from "../features/miniApp/pages.js";
import { getMonthRange, monthRangeFromKey } from "../lib/dates.js";
import { readSessionValue, sessionCookieName } from "../lib/session.js";
import {
  BillNotFoundError,
  BookConflictError,
  BookDeleteError,
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
    res.redirect(`/books/${defaultBook.id}`);
  });

  router.get("/settings", (req: Request, res: Response) => {
    const user = requireUser(req, res, service, config);
    if (!user) {
      return;
    }

    const book = service.ensureDefaultBook(user.id);
    res.redirect(`/books/${book.id}/settings`);
  });

  router.post("/settings", (req: Request, res: Response) => {
    const user = requireUser(req, res, service, config);
    if (!user) {
      return;
    }

    const book = service.ensureDefaultBook(user.id);
    try {
      const updatedBook = service.updateBook(user.id, book.id, {
        currency: textBody(req, "currency"),
        currentBalance: book.currentBalance,
        initialBalance: book.initialBalance,
        monthlyBudget: numberBody(req, "monthlyBudget"),
        name: textBody(req, "name") ?? book.name,
      });
      res.redirect(`/books/${updatedBook.id}`);
      return;
    } catch (error) {
      if (error instanceof BookConflictError) {
        res.status(400).send("账本名字已存在。");
        return;
      }

      throw error;
    }
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

  router.get("/books/:bookId/settings", (req: Request, res: Response) => {
    const user = requireUser(req, res, service, config);
    if (!user) {
      return;
    }

    const book = bookFromParam(req, res, user, service);
    if (!book) {
      return;
    }

    res.send(renderSettings({ book, bookCount: service.listBooks(user.id).length, user }));
  });

  router.post("/books/:bookId/settings", (req: Request, res: Response) => {
    const user = requireUser(req, res, service, config);
    if (!user) {
      return;
    }

    const book = bookFromParam(req, res, user, service);
    if (!book) {
      return;
    }

    try {
      const updatedBook = service.updateBook(user.id, book.id, {
        currency: textBody(req, "currency"),
        currentBalance: book.currentBalance,
        initialBalance: book.initialBalance,
        monthlyBudget: numberBody(req, "monthlyBudget"),
        name: textBody(req, "name") ?? book.name,
      });
      res.redirect(`/books/${updatedBook.id}`);
    } catch (error) {
      if (error instanceof BookConflictError) {
        res.status(400).send("账本名字已存在。");
        return;
      }

      throw error;
    }
  });

  router.post("/books/:bookId/delete", (req: Request, res: Response) => {
    const user = requireUser(req, res, service, config);
    if (!user) {
      return;
    }

    const bookId = numberParam(req.params.bookId);
    if (bookId === null) {
      res.status(400).send("账本无效。");
      return;
    }

    try {
      service.deleteBook(user.id, bookId);
      res.redirect("/books");
    } catch (error) {
      if (error instanceof BookDeleteError) {
        res.status(400).send(error.message);
        return;
      }

      if (error instanceof BookNotFoundError) {
        res.status(404).send("账本不存在。");
        return;
      }

      throw error;
    }
  });

  router.post("/books/:bookId/bills", (req: Request, res: Response) => {
    const user = requireUser(req, res, service, config);
    if (!user) {
      return;
    }

    const bookId = numberParam(req.params.bookId);
    const amount = numberBody(req, "amount");
    const purpose = textBody(req, "purpose");
    if (bookId === null || amount === null || !purpose) {
      res.status(400).send("记账内容无效。");
      return;
    }

    try {
      service.recordBillForBookOnce(
        user,
        bookId,
        amount,
        purpose,
        textBody(req, "idempotencyKey") ?? randomUUID(),
      );
      res.redirect(`/books/${bookId}`);
    } catch (error) {
      if (error instanceof BookNotFoundError) {
        res.status(404).send("账本不存在。");
        return;
      }

      throw error;
    }
  });

  router.post("/bills/:billId/delete", (req: Request, res: Response) => {
    const user = requireUser(req, res, service, config);
    if (!user) {
      return;
    }

    const billId = numberParam(req.params.billId);
    if (billId === null) {
      res.status(400).send("记录无效。");
      return;
    }

    try {
      const result = service.deleteBill(user.id, billId);
      res.redirect(returnTo(req) ?? `/books/${result.bookId}`);
    } catch (error) {
      if (error instanceof BillNotFoundError) {
        res.status(404).send("记录不存在。");
        return;
      }

      throw error;
    }
  });

  router.get("/books/:bookId", (req: Request, res: Response) => {
    const user = requireUser(req, res, service, config);
    if (!user) {
      return;
    }

    const bookId = numberParam(req.params.bookId);
    if (bookId === null) {
      res.status(400).send("账本无效。");
      return;
    }

    const book = service.getBook(user.id, bookId);
    if (!book) {
      res.status(404).send("账本不存在。");
      return;
    }

    const range = getMonthRange(new Date(), user.timezone);
    const page = queryNumber(req.query.page, 1);
    const pageSize = queryNumber(req.query.pageSize, 20);
    const summary = service.getMonthSummary(user.id, book.id, range);
    const bills = service.listBillsForRangePaginated(user.id, book.id, range, page, pageSize);
    res.send(
      renderHome({
        billSubmissionKey: randomUUID(),
        bills,
        book,
        purposes: service.listPurposes(user.id),
        summary,
        user,
      }),
    );
  });

  router.get("/history", (req: Request, res: Response) => {
    const user = requireUser(req, res, service, config);
    if (!user) {
      return;
    }

    const bookId = typeof req.query.bookId === "string" ? numberParam(req.query.bookId) : null;
    const book =
      bookId === null ? service.ensureDefaultBook(user.id) : service.getBook(user.id, bookId);
    if (!book) {
      res.status(404).send("账本不存在。");
      return;
    }

    const requestedMonth =
      typeof req.query.month === "string"
        ? req.query.month
        : getMonthRange(new Date(), user.timezone).key;
    const range = monthRangeFromKey(requestedMonth, user.timezone);
    const summary = service.getMonthSummary(user.id, book.id, range);
    const categories = service.getSpendingCategories(user.id, book.id, range);

    res.send(renderHistory({ book, categories, monthKey: summary.monthKey, summary, user }));
  });

  return router;
}

function bookFromParam(
  req: Request,
  res: Response,
  user: User,
  service: KeepyService,
): ReturnType<KeepyService["getBook"]> {
  const bookId = numberParam(req.params.bookId);
  if (bookId === null) {
    res.status(400).send("账本无效。");
    return null;
  }

  const book = service.getBook(user.id, bookId);
  if (!book) {
    res.status(404).send("账本不存在。");
    return null;
  }

  return book;
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

function numberParam(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function queryNumber(value: unknown, fallback: number): number {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function returnTo(req: Request): string | null {
  const value = textBody(req, "returnTo");
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}
