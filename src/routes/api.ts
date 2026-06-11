import { randomUUID } from "node:crypto";

import { Router, type Request, type Response } from "express";

import type { AppConfig } from "../configs/env.js";
import { getMonthRange, monthRangeFromKey } from "../lib/dates.js";
import { readSessionValue, sessionCookieName } from "../lib/session.js";
import {
  BookNotFoundError,
  InvalidBillAmountError,
  type Bill,
  type Book,
  type KeepyService,
  type MonthSummary,
  type User,
} from "../services/keepyService.js";

export function createApiRouter(service: KeepyService, config: AppConfig): Router {
  const router = Router();

  router.get("/api/me", (req: Request, res: Response) => {
    const user = requireApiUser(req, res, service, config);
    if (!user) {
      return;
    }

    const books = service.listBooks(user.id);
    res.json({
      books: books.map(serializeBook),
      defaultBookId: service.ensureDefaultBook(user.id).id,
      purposes: service.listPurposes(user.id),
      user: serializeUser(user),
    });
  });

  router.get("/api/books/:bookId/month", (req: Request, res: Response) => {
    const user = requireApiUser(req, res, service, config);
    if (!user) {
      return;
    }

    const book = apiBookFromParam(req, res, user, service);
    if (!book) {
      return;
    }

    const requestedMonth =
      typeof req.query.month === "string"
        ? req.query.month
        : getMonthRange(new Date(), user.timezone).key;
    const page = queryNumber(req.query.page, 1);
    const pageSize = queryNumber(req.query.pageSize, 20);
    const range = monthRangeFromKey(requestedMonth, user.timezone);
    const summary = service.getMonthSummary(user.id, book.id, range);
    const bills = service.listBillsForRangePaginated(user.id, book.id, range, page, pageSize);
    const categories = service.getSpendingCategories(user.id, book.id, range);

    res.json({
      bills: {
        ...bills,
        items: bills.items.map(serializeBill),
      },
      book: serializeBook(book),
      categories,
      dailyExpenses: dailyExpenses(summary.bills, user.timezone),
      monthKey: summary.monthKey,
      summary: serializeSummary(summary),
    });
  });

  router.post("/api/books/:bookId/bills", (req: Request, res: Response) => {
    const user = requireApiUser(req, res, service, config);
    if (!user) {
      return;
    }

    const bookId = numberParam(req.params.bookId);
    const amount = numberBody(req, "amount");
    const purpose = textBody(req, "purpose") || "默认";
    if (bookId === null || amount === null || !isValidBillAmount(amount)) {
      res.status(400).json({ error: "记账内容无效。" });
      return;
    }

    try {
      const result = service.recordBillForBookOnce(
        user,
        bookId,
        amount,
        purpose,
        textBody(req, "idempotencyKey") ?? randomUUID(),
        dateBody(req, "occurredAt") ?? new Date(),
      );
      res.json({ bill: serializeBill(result.bill), book: serializeBook(result.book), ok: true });
    } catch (error) {
      if (error instanceof BookNotFoundError) {
        res.status(404).json({ error: "账本不存在。" });
        return;
      }

      if (error instanceof InvalidBillAmountError) {
        res.status(400).json({ error: "记账内容无效。" });
        return;
      }

      throw error;
    }
  });

  router.post("/api/sync/bills", (req: Request, res: Response) => {
    const user = requireApiUser(req, res, service, config);
    if (!user) {
      return;
    }

    const bills = Array.isArray(req.body?.bills) ? (req.body.bills as unknown[]) : [];
    const results = bills.map((item) => syncBill(user, service, item));
    res.json({ results });
  });

  return router;
}

function syncBill(user: User, service: KeepyService, item: unknown): Record<string, unknown> {
  if (!item || typeof item !== "object") {
    return { error: "记账内容无效。", ok: false };
  }

  const record = item as Record<string, unknown>;
  const clientId = typeof record.clientId === "string" ? record.clientId : "";
  const bookId = Number(record.bookId);
  const amount = Number(record.amount);
  const purpose = typeof record.purpose === "string" && record.purpose.trim() ? record.purpose : "";
  const idempotencyKey =
    typeof record.idempotencyKey === "string" && record.idempotencyKey.trim()
      ? record.idempotencyKey
      : clientId || randomUUID();
  const occurredAt =
    typeof record.occurredAt === "string" ? new Date(record.occurredAt) : new Date();

  if (
    !Number.isInteger(bookId) ||
    !isValidBillAmount(amount) ||
    !purpose ||
    !isValidDate(occurredAt)
  ) {
    return { clientId, error: "记账内容无效。", ok: false };
  }

  try {
    const result = service.recordBillForBookOnce(
      user,
      bookId,
      amount,
      purpose,
      idempotencyKey,
      occurredAt,
    );
    return {
      bill: serializeBill(result.bill),
      book: serializeBook(result.book),
      clientId,
      ok: true,
    };
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return { clientId, error: "账本不存在。", ok: false };
    }

    if (error instanceof InvalidBillAmountError) {
      return { clientId, error: "记账内容无效。", ok: false };
    }

    throw error;
  }
}

function requireApiUser(
  req: Request,
  res: Response,
  service: KeepyService,
  config: AppConfig,
): User | null {
  const telegramId = readSessionValue(req.cookies?.[sessionCookieName], config.sessionSecret);
  const user = telegramId === null ? null : service.getUserByTelegramId(telegramId);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  return user;
}

function apiBookFromParam(
  req: Request,
  res: Response,
  user: User,
  service: KeepyService,
): Book | null {
  const bookId = numberParam(req.params.bookId);
  if (bookId === null) {
    res.status(400).json({ error: "账本无效。" });
    return null;
  }

  const book = service.getBook(user.id, bookId);
  if (!book) {
    res.status(404).json({ error: "账本不存在。" });
    return null;
  }

  return book;
}

function serializeUser(user: User): Record<string, unknown> {
  return {
    firstName: user.firstName,
    id: user.id,
    lastName: user.lastName,
    photoUrl: user.photoUrl,
    telegramId: user.telegramId,
    timezone: user.timezone,
    username: user.username,
  };
}

function serializeBook(book: Book): Record<string, unknown> {
  return {
    currency: book.currency,
    id: book.id,
    isDefault: book.isDefault,
    monthlyBudget: book.monthlyBudget,
    name: book.name,
    userId: book.userId,
  };
}

function serializeBill(bill: Bill): Record<string, unknown> {
  return {
    amount: bill.amount,
    bookId: bill.bookId,
    bookName: bill.bookName,
    currency: bill.currency,
    id: bill.id,
    occurredAt: bill.occurredAt.toISOString(),
    purpose: bill.purpose,
    userId: bill.userId,
  };
}

function serializeSummary(summary: MonthSummary): Record<string, unknown> {
  return {
    billCount: summary.billCount,
    budgetRemaining: summary.budgetRemaining,
    expenseTotal: summary.expenseTotal,
    incomeTotal: summary.incomeTotal,
    monthKey: summary.monthKey,
    netBalance: summary.netBalance,
  };
}

function dailyExpenses(bills: Bill[], timezone: string): Array<{ amount: number; label: string }> {
  const groups = new Map<string, number>();
  for (const bill of bills) {
    if (bill.amount <= 0) {
      continue;
    }

    const label = new Intl.DateTimeFormat("zh-CN", {
      day: "numeric",
      month: "long",
      timeZone: timezone,
    }).format(bill.occurredAt);
    groups.set(label, (groups.get(label) ?? 0) + bill.amount);
  }

  return [...groups.entries()].map(([label, amount]) => ({ amount, label }));
}

function textBody(req: Request, key: string): string | null {
  const value = req.body?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberBody(req: Request, key: string): number | null {
  const value = req.body?.[key];
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function dateBody(req: Request, key: string): Date | null {
  const value = req.body?.[key];
  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return isValidDate(parsed) ? parsed : null;
}

function queryNumber(value: unknown, fallback: number): number {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function numberParam(value: unknown): number | null {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isInteger(parsed) ? parsed : null;
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function isValidBillAmount(value: number): boolean {
  return Number.isFinite(value) && value !== 0;
}
