import { appShell, loginPage } from "../../components/layout.js";
import { formatDateTime } from "../../lib/dates.js";
import { escapeAttribute, escapeHtml } from "../../lib/html.js";
import { currencySymbol, formatAmount } from "../../lib/money.js";
import type { AppConfig } from "../../configs/env.js";
import type { Bill, Book, MonthSummary, User } from "../../services/keepyService.js";

export function renderLogin(config: AppConfig): string {
  return loginPage(config.botUsername);
}

export function renderHome(input: { book: Book; summary: MonthSummary; user: User }): string {
  const { book, summary, user } = input;

  return appShell({
    active: "home",
    title: "Keepy 本月明细",
    user,
    body: `
      <section class="section-title">
        <h1>${escapeHtml(book.name)} · ${escapeHtml(summary.monthKey)}</h1>
        <span class="muted">${escapeHtml(currencySymbol(book.currency) || "无币种")}</span>
      </section>
      ${summaryPanel(book, summary)}
      <section class="section-title">
        <h2>明细</h2>
      </section>
      ${billList(summary.bills, user.timezone)}
    `,
  });
}

export function renderSettings(input: { book: Book; user: User }): string {
  const { book, user } = input;

  return appShell({
    active: "settings",
    title: "Keepy 账本设置",
    user,
    body: `
      <section class="section-title">
        <h1>账本设置</h1>
        ${book.isDefault ? '<span class="badge">默认账本</span>' : ""}
      </section>
      <form class="form-panel" method="post" action="/settings">
        <label>
          名字
          <input name="name" required value="${escapeAttribute(book.name)}" />
        </label>
        <label>
          币种
          <input name="currency" placeholder="例如 CNY、USD、¥" value="${escapeAttribute(
            book.currency ?? "",
          )}" />
        </label>
        <label>
          月预算
          <input name="monthlyBudget" inputmode="decimal" value="${escapeAttribute(
            book.monthlyBudget ?? "",
          )}" />
        </label>
        <div class="button-row">
          <button class="button" type="submit">保存</button>
          <a class="button secondary" href="/books">账本列表</a>
        </div>
      </form>
    `,
  });
}

export function renderBooks(input: { books: Book[]; user: User }): string {
  const { books, user } = input;
  const defaultBook = books.find((book) => book.isDefault) ?? books[0];

  return appShell({
    active: "books",
    title: "Keepy 账本列表",
    user,
    body: `
      <section class="section-title">
        <h1>账本列表</h1>
      </section>
      <form class="form-panel" method="post" action="/books/default">
        <label>
          当前默认账本
          <select name="bookId">
            ${books
              .map(
                (book) =>
                  `<option value="${book.id}" ${book.id === defaultBook?.id ? "selected" : ""}>${escapeHtml(
                    book.name,
                  )}</option>`,
              )
              .join("")}
          </select>
        </label>
        <button class="button" type="submit">设为默认</button>
      </form>

      <section class="section-title">
        <h2>全部账本</h2>
      </section>
      <div class="bill-list">
        ${books
          .map(
            (book) => `
              <a class="book-row" href="/books/${book.id}">
                <div>
                  <strong>${escapeHtml(book.name)}</strong>
                  <div class="bill-meta">${escapeHtml(book.currency || "无币种")}</div>
                </div>
                ${book.isDefault ? '<span class="badge">默认</span>' : ""}
              </a>
            `,
          )
          .join("")}
      </div>

      <section class="section-title">
        <h2>增加账本</h2>
      </section>
      <form class="form-panel" method="post" action="/books">
        <label>
          名字
          <input name="name" required />
        </label>
        <label>
          币种
          <input name="currency" placeholder="可留空" />
        </label>
        <label>
          月预算
          <input name="monthlyBudget" inputmode="decimal" />
        </label>
        <button class="button" type="submit">增加</button>
      </form>
    `,
  });
}

export function renderHistory(input: {
  book: Book;
  monthKey: string;
  summary: MonthSummary;
  user: User;
}): string {
  const { book, monthKey, summary, user } = input;

  return appShell({
    active: "history",
    title: "Keepy 历史记录",
    user,
    body: `
      <section class="section-title">
        <h1>历史记录</h1>
      </section>
      <form class="month-picker" method="get" action="/history">
        <label>
          月份
          <input type="month" name="month" value="${escapeAttribute(monthKey)}" onchange="this.form.submit()" />
        </label>
        <button class="button secondary" type="submit">查看</button>
      </form>
      <section class="section-title">
        <h2>${escapeHtml(book.name)} · ${escapeHtml(summary.monthKey)}</h2>
        <span class="muted">${escapeHtml(currencySymbol(book.currency) || "无币种")}</span>
      </section>
      ${summary.bills.length === 0 ? '<div class="empty">无数据</div>' : billList(summary.bills, user.timezone)}
    `,
  });
}

function summaryPanel(book: Book, summary: MonthSummary): string {
  const hasBudget = book.monthlyBudget !== null;
  const budgetRemaining =
    summary.budgetRemaining === null
      ? "未设置"
      : formatAmount(summary.budgetRemaining, book.currency);
  const progress =
    hasBudget && book.monthlyBudget && book.monthlyBudget > 0
      ? Math.min(Math.max((summary.expenseTotal / book.monthlyBudget) * 100, 0), 100)
      : null;

  return `
    <details class="summary-strip">
      <summary class="summary-mobile-trigger">
        <span class="summary-mobile-metrics">
          ${mobileSummaryItem("累计消费", formatAmount(summary.expenseTotal, book.currency))}
          ${hasBudget ? mobileSummaryItem("本月余额", budgetRemaining) : ""}
        </span>
        ${
          progress === null
            ? ""
            : `<span class="budget-progress" aria-label="预算使用进度">
                <span style="width: ${progress.toFixed(2)}%"></span>
              </span>`
        }
      </summary>
      <div class="summary-grid">
        ${summaryItem("累计消费", formatAmount(summary.expenseTotal, book.currency))}
        ${summaryItem("本月余额", budgetRemaining)}
        ${summaryItem("收入", formatAmount(summary.incomeTotal, book.currency))}
        ${summaryItem("净收支", formatAmount(summary.netBalance, book.currency))}
      </div>
    </details>
  `;
}

function summaryItem(label: string, value: string): string {
  return `<div class="summary-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(
    value,
  )}</strong></div>`;
}

function mobileSummaryItem(label: string, value: string): string {
  return `<span class="summary-mobile-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(
    value,
  )}</strong></span>`;
}

function billList(bills: Bill[], timezone: string): string {
  if (bills.length === 0) {
    return '<div class="empty">暂无明细</div>';
  }

  return `<div class="bill-list">
    ${bills
      .map(
        (bill) => `
          <div class="bill">
            <div>
              <div class="bill-purpose">${escapeHtml(bill.purpose)}</div>
              <div class="bill-meta">${escapeHtml(bill.bookName)} · ${formatDateTime(
                bill.occurredAt,
                timezone,
              )}</div>
            </div>
            <strong class="amount ${bill.amount > 0 ? "expense" : "income"}">${escapeHtml(
              formatAmount(bill.amount, bill.currency),
            )}</strong>
          </div>
        `,
      )
      .join("")}
  </div>`;
}
