import type { TelegramAuthUser } from "../lib/telegramAuth.js";
import { getMonthRange, monthRangeFromKey, type MonthRange } from "../lib/dates.js";
import type { LedgerParseSuccess } from "../lib/money.js";
import { openDatabase, type SqliteDatabase } from "./database.js";

export interface User {
  firstName: string | null;
  id: number;
  lastName: string | null;
  photoUrl: string | null;
  telegramId: number;
  timezone: string;
  username: string | null;
}

export interface Book {
  currency: string | null;
  currentBalance: number | null;
  id: number;
  initialBalance: number | null;
  isDefault: boolean;
  monthlyBudget: number | null;
  name: string;
  userId: number;
}

export interface Bill {
  amount: number;
  bookId: number;
  bookName: string;
  currency: string | null;
  id: number;
  occurredAt: Date;
  purpose: string;
  userId: number;
}

export interface EnsureUserResult {
  created: boolean;
  defaultBook: Book;
  user: User;
}

export interface MonthSummary {
  billCount: number;
  bills: Bill[];
  budgetRemaining: number | null;
  expenseTotal: number;
  incomeTotal: number;
  monthKey: string;
  netBalance: number;
}

export interface PaginatedBills {
  items: Bill[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SpendingCategory {
  amount: number;
  percentage: number;
  purpose: string;
}

interface UserRow {
  first_name: string | null;
  id: number;
  last_name: string | null;
  photo_url: string | null;
  telegram_id: number;
  timezone: string;
  username: string | null;
}

interface BookRow {
  currency: string | null;
  current_balance: number | null;
  id: number;
  initial_balance: number | null;
  is_default: 0 | 1;
  monthly_budget: number | null;
  name: string;
  user_id: number;
}

interface BillRow {
  amount: number;
  book_id: number;
  book_name: string;
  currency: string | null;
  id: number;
  occurred_at: string;
  purpose: string;
  user_id: number;
}

interface SpendingCategoryRow {
  amount: number;
  purpose: string;
}

export interface UpdateBookInput {
  currency: string | null;
  currentBalance: number | null;
  initialBalance: number | null;
  monthlyBudget: number | null;
  name: string;
}

export class BookConflictError extends Error {
  constructor(message = "Book name already exists.") {
    super(message);
    this.name = "BookConflictError";
  }
}

export class BookNotFoundError extends Error {
  constructor(message = "Book not found.") {
    super(message);
    this.name = "BookNotFoundError";
  }
}

export class BookDeleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookDeleteError";
  }
}

export class KeepyService {
  constructor(private readonly db: SqliteDatabase) {}

  static fromPath(databasePath: string): KeepyService {
    return new KeepyService(openDatabase(databasePath));
  }

  close(): void {
    this.db.close();
  }

  ensureUser(profile: TelegramAuthUser): EnsureUserResult {
    const now = new Date().toISOString();
    const existing = this.getUserByTelegramId(profile.telegramId);

    if (existing) {
      this.db
        .prepare(
          `
          UPDATE users
          SET username = ?, first_name = ?, last_name = ?, photo_url = ?, updated_at = ?
          WHERE id = ?
        `,
        )
        .run(
          profile.username,
          profile.firstName,
          profile.lastName,
          profile.photoUrl,
          now,
          existing.id,
        );

      const updatedUser = this.getUser(existing.id);
      if (!updatedUser) {
        throw new Error("Failed to reload updated user.");
      }

      return {
        created: false,
        defaultBook: this.ensureDefaultBook(updatedUser.id),
        user: updatedUser,
      };
    }

    const create = this.db.transaction(() => {
      const result = this.db
        .prepare(
          `
          INSERT INTO users (
            telegram_id, username, first_name, last_name, photo_url, timezone, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, 'Asia/Shanghai', ?, ?)
        `,
        )
        .run(
          profile.telegramId,
          profile.username,
          profile.firstName,
          profile.lastName,
          profile.photoUrl,
          now,
          now,
        );

      const userId = Number(result.lastInsertRowid);
      this.db
        .prepare(
          `
          INSERT INTO books (
            user_id, name, currency, initial_balance, current_balance, monthly_budget,
            is_default, created_at, updated_at
          )
          VALUES (?, '默认', NULL, NULL, NULL, NULL, 1, ?, ?)
        `,
        )
        .run(userId, now, now);

      return userId;
    });

    const userId = create();
    const user = this.getUser(userId);
    if (!user) {
      throw new Error("Failed to load created user.");
    }

    return {
      created: true,
      defaultBook: this.ensureDefaultBook(user.id),
      user,
    };
  }

  getUserByTelegramId(telegramId: number): User | null {
    const row = this.db
      .prepare<[number], UserRow>("SELECT * FROM users WHERE telegram_id = ?")
      .get(telegramId);
    return row ? mapUser(row) : null;
  }

  getUser(userId: number): User | null {
    const row = this.db.prepare<[number], UserRow>("SELECT * FROM users WHERE id = ?").get(userId);
    return row ? mapUser(row) : null;
  }

  listBooks(userId: number): Book[] {
    return this.db
      .prepare<
        [number],
        BookRow
      >("SELECT * FROM books WHERE user_id = ? ORDER BY is_default DESC, name")
      .all(userId)
      .map(mapBook);
  }

  getBook(userId: number, bookId: number): Book | null {
    const row = this.db
      .prepare<[number, number], BookRow>("SELECT * FROM books WHERE user_id = ? AND id = ?")
      .get(userId, bookId);
    return row ? mapBook(row) : null;
  }

  findBookByName(userId: number, name: string): Book | null {
    const row = this.db
      .prepare<[number, string], BookRow>("SELECT * FROM books WHERE user_id = ? AND name = ?")
      .get(userId, name);
    return row ? mapBook(row) : null;
  }

  ensureDefaultBook(userId: number): Book {
    const defaultBook = this.getDefaultBook(userId);
    if (defaultBook) {
      return defaultBook;
    }

    const books = this.listBooks(userId);
    if (books[0]) {
      this.setDefaultBook(userId, books[0].id);
      const promoted = this.getDefaultBook(userId);
      if (promoted) {
        return promoted;
      }
    }

    return this.createBook(userId, "默认", { makeDefault: true });
  }

  getDefaultBook(userId: number): Book | null {
    const row = this.db
      .prepare<[number], BookRow>("SELECT * FROM books WHERE user_id = ? AND is_default = 1")
      .get(userId);
    return row ? mapBook(row) : null;
  }

  createBook(
    userId: number,
    name: string,
    options: {
      currency?: string | null;
      initialBalance?: number | null;
      makeDefault?: boolean;
      monthlyBudget?: number | null;
    } = {},
  ): Book {
    const now = new Date().toISOString();

    let create: () => number;

    try {
      create = this.db.transaction(() => {
        if (options.makeDefault) {
          this.db.prepare("UPDATE books SET is_default = 0 WHERE user_id = ?").run(userId);
        }

        const result = this.db
          .prepare(
            `
            INSERT INTO books (
              user_id, name, currency, initial_balance, current_balance, monthly_budget,
              is_default, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .run(
            userId,
            cleanName(name),
            cleanNullableText(options.currency ?? null),
            options.initialBalance ?? null,
            options.initialBalance ?? null,
            options.monthlyBudget ?? null,
            options.makeDefault ? 1 : 0,
            now,
            now,
          );

        return Number(result.lastInsertRowid);
      });
    } catch (error) {
      throw mapBookWriteError(error);
    }

    let bookId: number;
    try {
      bookId = create();
    } catch (error) {
      throw mapBookWriteError(error);
    }

    const book = this.getBook(userId, bookId);
    if (!book) {
      throw new Error("Failed to load created book.");
    }

    return book;
  }

  updateBook(userId: number, bookId: number, input: UpdateBookInput): Book {
    const now = new Date().toISOString();
    try {
      this.db
        .prepare(
          `
          UPDATE books
          SET name = ?, currency = ?, initial_balance = ?, current_balance = ?,
              monthly_budget = ?, updated_at = ?
          WHERE user_id = ? AND id = ?
        `,
        )
        .run(
          cleanName(input.name),
          cleanNullableText(input.currency),
          input.initialBalance,
          input.currentBalance,
          input.monthlyBudget,
          now,
          userId,
          bookId,
        );
    } catch (error) {
      throw mapBookWriteError(error);
    }

    const book = this.getBook(userId, bookId);
    if (!book) {
      throw new BookNotFoundError();
    }

    return book;
  }

  deleteBook(userId: number, bookId: number): void {
    const book = this.getBook(userId, bookId);
    if (!book) {
      throw new BookNotFoundError();
    }

    if (book.isDefault) {
      throw new BookDeleteError("默认账本不能删除。");
    }

    if (this.listBooks(userId).length <= 1) {
      throw new BookDeleteError("至少需要保留一个账本。");
    }

    this.db.prepare("DELETE FROM books WHERE user_id = ? AND id = ?").run(userId, bookId);
  }

  setDefaultBook(userId: number, bookId: number): Book {
    const now = new Date().toISOString();
    const update = this.db.transaction(() => {
      const book = this.getBook(userId, bookId);
      if (!book) {
        throw new BookNotFoundError();
      }

      this.db
        .prepare("UPDATE books SET is_default = 0, updated_at = ? WHERE user_id = ?")
        .run(now, userId);
      this.db
        .prepare("UPDATE books SET is_default = 1, updated_at = ? WHERE user_id = ? AND id = ?")
        .run(now, userId, bookId);
    });

    update();

    const defaultBook = this.getDefaultBook(userId);
    if (!defaultBook) {
      throw new Error("Failed to set default book.");
    }

    return defaultBook;
  }

  recordBill(
    user: User,
    parsed: LedgerParseSuccess,
    occurredAt = new Date(),
  ): { bill: Bill; book: Book } {
    const book = parsed.bookName
      ? (this.findBookByName(user.id, parsed.bookName) ?? this.ensureDefaultBook(user.id))
      : this.ensureDefaultBook(user.id);
    return this.createBill(user, book, parsed.amount, parsed.purpose, occurredAt);
  }

  recordBillForBook(
    user: User,
    bookId: number,
    amount: number,
    purpose: string,
    occurredAt = new Date(),
  ): { bill: Bill; book: Book } {
    const book = this.getBook(user.id, bookId);
    if (!book) {
      throw new BookNotFoundError();
    }

    return this.createBill(user, book, amount, purpose, occurredAt);
  }

  getBill(billId: number): Bill | null {
    const row = this.db
      .prepare<[number], BillRow>(
        `
        SELECT bills.*, books.name AS book_name, books.currency
        FROM bills
        JOIN books ON books.id = bills.book_id
        WHERE bills.id = ?
      `,
      )
      .get(billId);
    return row ? mapBill(row) : null;
  }

  getMonthSummary(userId: number, bookId: number, range: MonthRange): MonthSummary {
    const book = this.getBook(userId, bookId);
    if (!book) {
      throw new Error("Book not found.");
    }

    const bills = this.listBillsForRange(userId, bookId, range);
    const expenseTotal = bills.reduce((sum, bill) => sum + (bill.amount > 0 ? bill.amount : 0), 0);
    const incomeTotal = bills.reduce(
      (sum, bill) => sum + (bill.amount < 0 ? Math.abs(bill.amount) : 0),
      0,
    );

    return {
      billCount: bills.length,
      bills,
      budgetRemaining: book.monthlyBudget === null ? null : book.monthlyBudget - expenseTotal,
      expenseTotal,
      incomeTotal,
      monthKey: range.key,
      netBalance: incomeTotal - expenseTotal,
    };
  }

  getCurrentMonthSummary(user: User, bookId: number, date = new Date()): MonthSummary {
    return this.getMonthSummary(user.id, bookId, getMonthRange(date, user.timezone));
  }

  listBillsForRange(userId: number, bookId: number, range: MonthRange): Bill[] {
    return this.db
      .prepare<[number, number, string, string], BillRow>(
        `
        SELECT bills.*, books.name AS book_name, books.currency
        FROM bills
        JOIN books ON books.id = bills.book_id
        WHERE bills.user_id = ?
          AND bills.book_id = ?
          AND bills.occurred_at >= ?
          AND bills.occurred_at < ?
        ORDER BY bills.occurred_at DESC, bills.id DESC
      `,
      )
      .all(userId, bookId, range.start.toISOString(), range.end.toISOString())
      .map(mapBill);
  }

  listBillsForRangePaginated(
    userId: number,
    bookId: number,
    range: MonthRange,
    page = 1,
    pageSize = 20,
  ): PaginatedBills {
    const safePageSize = [20, 50, 100].includes(pageSize) ? pageSize : 20;
    const total =
      this.db
        .prepare<[number, number, string, string], { count: number }>(
          `
        SELECT COUNT(*) AS count
        FROM bills
        WHERE user_id = ?
          AND book_id = ?
          AND occurred_at >= ?
          AND occurred_at < ?
      `,
        )
        .get(userId, bookId, range.start.toISOString(), range.end.toISOString())?.count ?? 0;
    const totalPages = Math.max(Math.ceil(total / safePageSize), 1);
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const offset = (safePage - 1) * safePageSize;

    const items = this.db
      .prepare<[number, number, string, string, number, number], BillRow>(
        `
        SELECT bills.*, books.name AS book_name, books.currency
        FROM bills
        JOIN books ON books.id = bills.book_id
        WHERE bills.user_id = ?
          AND bills.book_id = ?
          AND bills.occurred_at >= ?
          AND bills.occurred_at < ?
        ORDER BY bills.occurred_at DESC, bills.id DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(userId, bookId, range.start.toISOString(), range.end.toISOString(), safePageSize, offset)
      .map(mapBill);

    return {
      items,
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages,
    };
  }

  listPurposes(userId: number): string[] {
    return this.db
      .prepare<[number], { purpose: string }>(
        `
        SELECT DISTINCT purpose
        FROM bills
        WHERE user_id = ?
        ORDER BY purpose COLLATE NOCASE
      `,
      )
      .all(userId)
      .map((row) => row.purpose);
  }

  getSpendingCategories(userId: number, bookId: number, range: MonthRange): SpendingCategory[] {
    const rows = this.db
      .prepare<[number, number, string, string], SpendingCategoryRow>(
        `
        SELECT purpose, SUM(amount) AS amount
        FROM bills
        WHERE user_id = ?
          AND book_id = ?
          AND occurred_at >= ?
          AND occurred_at < ?
          AND amount > 0
        GROUP BY purpose
        ORDER BY amount DESC, purpose
      `,
      )
      .all(userId, bookId, range.start.toISOString(), range.end.toISOString());
    const total = rows.reduce((sum, row) => sum + row.amount, 0);

    if (total <= 0) {
      return [];
    }

    return rows.map((row) => ({
      amount: row.amount,
      percentage: (row.amount / total) * 100,
      purpose: row.purpose,
    }));
  }

  getHistory(user: User): { bills: Bill[]; monthKey: string }[] {
    const bills = this.db
      .prepare<[number], BillRow>(
        `
        SELECT bills.*, books.name AS book_name, books.currency
        FROM bills
        JOIN books ON books.id = bills.book_id
        WHERE bills.user_id = ?
        ORDER BY bills.occurred_at DESC, bills.id DESC
      `,
      )
      .all(user.id)
      .map(mapBill);

    const grouped = new Map<string, Bill[]>();
    for (const bill of bills) {
      const monthKey = getMonthRange(bill.occurredAt, user.timezone).key;
      grouped.set(monthKey, [...(grouped.get(monthKey) ?? []), bill]);
    }

    return [...grouped.entries()].map(([monthKey, monthBills]) => ({
      bills: monthBills,
      monthKey,
    }));
  }

  getSummaryForMonthKey(user: User, bookId: number, monthKey: string): MonthSummary {
    return this.getMonthSummary(user.id, bookId, monthRangeFromKey(monthKey, user.timezone));
  }

  private createBill(
    user: User,
    book: Book,
    amount: number,
    purpose: string,
    occurredAt: Date,
  ): { bill: Bill; book: Book } {
    const now = new Date().toISOString();
    const cleanedPurpose = cleanName(purpose);

    const create = this.db.transaction(() => {
      const result = this.db
        .prepare(
          `
          INSERT INTO bills (user_id, book_id, amount, purpose, occurred_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        )
        .run(user.id, book.id, amount, cleanedPurpose, occurredAt.toISOString(), now);

      if (book.currentBalance !== null) {
        this.db
          .prepare(
            "UPDATE books SET current_balance = current_balance - ?, updated_at = ? WHERE id = ?",
          )
          .run(amount, now, book.id);
      }

      return Number(result.lastInsertRowid);
    });

    const bill = this.getBill(create());
    const updatedBook = this.getBook(user.id, book.id);
    if (!bill || !updatedBook) {
      throw new Error("Failed to load created bill.");
    }

    return { bill, book: updatedBook };
  }
}

function cleanName(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) {
    throw new Error("Book name is required.");
  }

  return cleaned;
}

function cleanNullableText(value: string | null): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function mapBookWriteError(error: unknown): Error {
  if (isUniqueConstraintError(error)) {
    return new BookConflictError();
  }

  return error instanceof Error ? error : new Error(String(error));
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "SQLITE_CONSTRAINT_UNIQUE";
}

function mapUser(row: UserRow): User {
  return {
    firstName: row.first_name,
    id: row.id,
    lastName: row.last_name,
    photoUrl: row.photo_url,
    telegramId: row.telegram_id,
    timezone: row.timezone,
    username: row.username,
  };
}

function mapBook(row: BookRow): Book {
  return {
    currency: row.currency,
    currentBalance: row.current_balance,
    id: row.id,
    initialBalance: row.initial_balance,
    isDefault: row.is_default === 1,
    monthlyBudget: row.monthly_budget,
    name: row.name,
    userId: row.user_id,
  };
}

function mapBill(row: BillRow): Bill {
  return {
    amount: row.amount,
    bookId: row.book_id,
    bookName: row.book_name,
    currency: row.currency,
    id: row.id,
    occurredAt: new Date(row.occurred_at),
    purpose: row.purpose,
    userId: row.user_id,
  };
}
