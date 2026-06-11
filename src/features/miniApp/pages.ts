import { appShell, loginPage } from "../../components/layout.js";
import { formatMonthDay, formatTime } from "../../lib/dates.js";
import { escapeAttribute, escapeHtml } from "../../lib/html.js";
import { currencySymbol, formatAmount } from "../../lib/money.js";
import { commonTimeZones, timeZoneLabel } from "../../lib/timezones.js";
import type { AppConfig } from "../../configs/env.js";
import type {
  Bill,
  Book,
  MonthSummary,
  PaginatedBills,
  SpendingCategory,
  User,
} from "../../services/keepyService.js";

interface BookListItem {
  book: Book;
  summary: MonthSummary;
}

export function renderLogin(config: AppConfig): string {
  return loginPage(config.botUsername);
}

export function renderHome(input: {
  billSubmissionKey: string;
  bills: PaginatedBills;
  book: Book;
  isTelegramMiniApp?: boolean;
  purposes: string[];
  summary: MonthSummary;
  user: User;
}): string {
  const {
    billSubmissionKey,
    bills,
    book,
    isTelegramMiniApp = false,
    purposes,
    summary,
    user,
  } = input;
  const bookUrl = `/books/${book.id}`;
  const settingsUrl = `${bookUrl}/settings`;
  const historyUrl = `/history?bookId=${book.id}&month=${encodeURIComponent(summary.monthKey)}`;

  return appShell({
    active: "home",
    isTelegramMiniApp,
    title: "Keepy 本月明细",
    user,
    body: `
      <section class="section-title title-row">
        <h1>${escapeHtml(book.name)}</h1>
        <span class="title-actions">
          <a class="icon-button" href="${historyUrl}" aria-label="历史记录">${chartIcon()}</a>
          <a class="icon-button" href="/books" aria-label="切换账本">${switchIcon()}</a>
          <a class="icon-button" href="${settingsUrl}" aria-label="编辑账本">${editIcon()}</a>
        </span>
      </section>
      ${summaryPanel(book, summary, settingsUrl)}
      <section class="section-title details-title">
        <h2>明细</h2>
        <span class="title-actions">
          <button class="icon-button" type="button" data-delete-toggle aria-label="编辑明细" aria-pressed="false">${editIcon()}</button>
        </span>
      </section>
      ${billList(bills.items, user.timezone, bookUrl)}
      ${pagination(bookUrl, bills)}
      ${fabDrawer(book, purposes, billSubmissionKey)}
    `,
  });
}

export function renderSettings(input: {
  book: Book;
  bookCount: number;
  isTelegramMiniApp?: boolean;
  user: User;
}): string {
  const { book, bookCount, isTelegramMiniApp = false, user } = input;
  const deleteDisabled = book.isDefault || bookCount <= 1;
  const deleteHint = book.isDefault
    ? "默认账本不能删除。"
    : bookCount <= 1
      ? "至少需要保留一个账本。"
      : "";

  return appShell({
    active: "settings",
    isTelegramMiniApp,
    title: "Keepy 账本设置",
    user,
    body: `
      <section class="section-title">
        <h1>账本设置</h1>
        ${book.isDefault ? '<span class="badge">默认账本</span>' : ""}
      </section>
      <form class="form-panel" method="post" action="/books/${book.id}/settings">
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
          <a class="button secondary" href="/books/${book.id}">返回明细</a>
        </div>
      </form>

      <section class="danger-zone">
        <h2>删除账本</h2>
        ${
          deleteDisabled
            ? `<p class="muted">${escapeHtml(deleteHint)}</p>`
            : `<button class="button danger" type="button" data-dialog-open="delete-book-dialog">删除账本</button>`
        }
      </section>
      ${
        deleteDisabled
          ? ""
          : `<dialog class="confirm-dialog" id="delete-book-dialog">
              <form method="dialog" class="dialog-card">
                <h2>删除「${escapeHtml(book.name)}」？</h2>
                <p>此账本里的明细会一起删除，操作无法撤销。</p>
                <div class="button-row">
                  <button class="button secondary" value="cancel">取消</button>
                  <button class="button danger" form="delete-book-form" type="submit">确认删除</button>
                </div>
              </form>
              <form id="delete-book-form" method="post" action="/books/${book.id}/delete"></form>
            </dialog>`
      }
    `,
  });
}

export function renderBooks(input: {
  books: BookListItem[];
  isTelegramMiniApp?: boolean;
  user: User;
}): string {
  const { books, isTelegramMiniApp = false, user } = input;
  const defaultBook = books.find(({ book }) => book.isDefault)?.book ?? books[0]?.book;

  return appShell({
    active: "books",
    isTelegramMiniApp,
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
                ({ book }) =>
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
            ({ book, summary }) => `
              <a class="book-row" href="/books/${book.id}">
                <div class="book-row-main">
                  <strong>${escapeHtml(book.name)}</strong>
                  <div class="bill-meta">${escapeHtml(currencyLabel(book))}</div>
                  <div class="book-row-metrics">
                    <span>
                      <small>累计消费</small>
                      <strong>${escapeHtml(formatAmount(summary.expenseTotal, book.currency))}</strong>
                    </span>
                    ${
                      summary.budgetRemaining === null
                        ? ""
                        : `<span>
                            <small>本月余额</small>
                            <strong>${escapeHtml(formatAmount(summary.budgetRemaining, book.currency))}</strong>
                          </span>`
                    }
                  </div>
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
  categories: SpendingCategory[];
  isTelegramMiniApp?: boolean;
  monthKey: string;
  summary: MonthSummary;
  user: User;
}): string {
  const { book, categories, isTelegramMiniApp = false, monthKey, summary, user } = input;

  return appShell({
    active: "history",
    isTelegramMiniApp,
    title: "Keepy 历史记录",
    user,
    body: `
      <section class="section-title">
        <h1>历史记录</h1>
      </section>
      ${monthPicker(book.id, monthKey)}
      <section class="section-title">
        <h2>${escapeHtml(book.name)} · ${escapeHtml(summary.monthKey)}</h2>
      </section>
      ${chartCarousel(categories, summary.bills, user.timezone, book.currency)}
      ${
        summary.bills.length === 0
          ? '<div class="empty">无数据</div>'
          : billList(
              summary.bills,
              user.timezone,
              historyUrl(book.id, ...monthParts(summary.monthKey)),
            )
      }
    `,
  });
}

export function renderUserSettings(input: { isTelegramMiniApp: boolean; user: User }): string {
  const { isTelegramMiniApp, user } = input;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const displayName = fullName || (user.username ? `@${user.username}` : "Keepy");
  const username = user.username ? `@${user.username}` : "";
  const fallback = (user.firstName?.[0] ?? user.username?.[0] ?? "K").toUpperCase();

  return appShell({
    active: "user",
    isTelegramMiniApp,
    title: "Keepy 用户设置",
    user,
    body: `
      <section class="section-title">
        <h1>用户设置</h1>
      </section>
      <section class="form-panel user-settings-panel">
        <div class="user-settings-profile">
          <span class="avatar-stack large-avatar">
            <img src="/auth/avatar" alt="" data-avatar-img />
            <span class="avatar-fallback" data-avatar-fallback hidden>${escapeHtml(fallback)}</span>
          </span>
          <div>
            <strong>${escapeHtml(displayName)}</strong>
            ${username ? `<span class="muted">${escapeHtml(username)}</span>` : ""}
          </div>
        </div>
        <button class="button secondary" type="button" data-refresh-avatar data-online-only>刷新头像</button>
      </section>
      <form class="form-panel" method="post" action="/user/settings">
        <label>
          时区
          <select name="timezone" required>
            ${commonTimeZones
              .map(
                (option) =>
                  `<option value="${escapeAttribute(option.value)}" ${
                    option.value === user.timezone ? "selected" : ""
                  }>${escapeHtml(option.label)}</option>`,
              )
              .join("")}
          </select>
        </label>
        <p class="muted">当前：${escapeHtml(timeZoneLabel(user.timezone))}</p>
        <button class="button" type="submit">保存</button>
      </form>
      ${
        isTelegramMiniApp
          ? ""
          : `<section class="danger-zone">
              <h2>退出登录</h2>
              <form method="post" action="/auth/logout">
                <button class="button danger" type="submit">退出登录</button>
              </form>
            </section>`
      }
    `,
  });
}

function monthPicker(bookId: number, monthKey: string): string {
  const { month, year } = parseMonthKey(monthKey);
  const dialogId = `month-picker-${bookId}`;

  return `
    <section class="month-picker">
      <span>
        <span>月份</span>
        <button class="month-picker-button" type="button" data-dialog-open="${dialogId}">
          <strong>${year}年${month}月</strong>
          <span>选择月份</span>
        </button>
      </span>
      <a class="button secondary" href="/history?bookId=${bookId}&month=${escapeAttribute(monthKey)}">查看</a>
    </section>
    <dialog class="month-dialog" id="${dialogId}">
      <div class="dialog-card month-dialog-card">
        <div class="month-dialog-head">
          <a class="icon-button" href="${historyUrl(bookId, year - 1, month)}" aria-label="上一年">‹</a>
          <strong>${year}年</strong>
          <a class="icon-button" href="${historyUrl(bookId, year + 1, month)}" aria-label="下一年">›</a>
        </div>
        <div class="month-grid" role="list">
          ${Array.from({ length: 12 }, (_, index) => {
            const itemMonth = index + 1;
            const active = itemMonth === month;
            return `<a class="${active ? "active" : ""}" href="${historyUrl(
              bookId,
              year,
              itemMonth,
            )}" role="listitem">${itemMonth}月</a>`;
          }).join("")}
        </div>
        <button class="button secondary" type="button" data-dialog-close="${dialogId}">取消</button>
      </div>
    </dialog>
  `;
}

function parseMonthKey(monthKey: string): { month: number; year: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  }

  return {
    month: Number(match[2]),
    year: Number(match[1]),
  };
}

function historyUrl(bookId: number, year: number, month: number): string {
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  return `/history?bookId=${bookId}&month=${encodeURIComponent(monthKey)}`;
}

function monthParts(monthKey: string): [number, number] {
  const { month, year } = parseMonthKey(monthKey);
  return [year, month];
}

function summaryPanel(book: Book, summary: MonthSummary, settingsUrl: string): string {
  const hasBudget = book.monthlyBudget !== null;
  const budgetRemaining =
    summary.budgetRemaining === null
      ? `<a href="${settingsUrl}">点击设置</a>`
      : escapeHtml(formatAmount(summary.budgetRemaining, book.currency));
  const progress =
    hasBudget && book.monthlyBudget && book.monthlyBudget > 0
      ? Math.min(Math.max((summary.expenseTotal / book.monthlyBudget) * 100, 0), 100)
      : null;

  return `
    <details class="summary-strip" data-summary-strip
      data-currency="${escapeAttribute(book.currency ?? "")}"
      data-monthly-budget="${escapeAttribute(book.monthlyBudget ?? "")}"
      data-month-key="${escapeAttribute(summary.monthKey)}"
      data-base-expense="${escapeAttribute(summary.expenseTotal)}"
      data-base-income="${escapeAttribute(summary.incomeTotal)}"
      data-base-net="${escapeAttribute(summary.netBalance)}">
      <summary class="summary-mobile-trigger">
        <span class="summary-mobile-metrics">
          ${mobileSummaryItem("累计消费", escapeHtml(formatAmount(summary.expenseTotal, book.currency)), "expense")}
          ${mobileSummaryItem("本月余额", budgetRemaining, "budget")}
        </span>
        ${
          progress === null
            ? ""
            : `<span class="budget-progress" aria-label="预算使用进度">
                <span data-budget-progress style="width: ${progress.toFixed(2)}%"></span>
              </span>`
        }
      </summary>
      <div class="summary-grid">
        ${summaryItem("累计消费", escapeHtml(formatAmount(summary.expenseTotal, book.currency)), "expense")}
        ${summaryItem("本月余额", budgetRemaining, "budget")}
        ${summaryItem("收入", escapeHtml(formatAmount(summary.incomeTotal, book.currency)), "income")}
        ${summaryItem("净收支", escapeHtml(formatAmount(summary.netBalance, book.currency)), "net")}
      </div>
    </details>
  `;
}

function summaryItem(label: string, valueHtml: string, key?: string): string {
  const data = key ? ` data-summary-item="${escapeAttribute(key)}"` : "";
  return `<div class="summary-item"${data}><span>${escapeHtml(label)}</span><strong>${valueHtml}</strong></div>`;
}

function mobileSummaryItem(label: string, valueHtml: string, key?: string): string {
  const data = key ? ` data-summary-item="${escapeAttribute(key)}"` : "";
  return `<span class="summary-mobile-item"${data}><span>${escapeHtml(label)}</span><strong>${valueHtml}</strong></span>`;
}

function billList(bills: Bill[], timezone: string, returnTo: string): string {
  if (bills.length === 0) {
    return '<div class="empty">暂无明细</div>';
  }

  const groups = new Map<string, Bill[]>();
  for (const bill of bills) {
    const label = formatMonthDay(bill.occurredAt, timezone);
    groups.set(label, [...(groups.get(label) ?? []), bill]);
  }

  return `<div class="day-groups">
    ${[...groups.entries()]
      .map(([label, groupBills]) => {
        const dayExpense = groupBills.reduce(
          (total, bill) => total + (bill.amount > 0 ? bill.amount : 0),
          0,
        );
        const currency = groupBills[0]?.currency ?? null;

        return `
          <section class="day-group" data-day-group="${escapeAttribute(label)}" data-base-day-expense="${escapeAttribute(dayExpense)}" data-currency="${escapeAttribute(currency ?? "")}">
            <h3 class="day-group-header">
              <span>${escapeHtml(label)}</span>
              <span class="day-total">${escapeHtml(formatAmount(dayExpense, currency))}</span>
            </h3>
            <div class="bill-list compact">
              ${groupBills
                .map(
                  (bill) => `
                    <div class="bill compact-bill">
                      <strong class="bill-purpose">${escapeHtml(bill.purpose)}</strong>
                      <span class="bill-time">${escapeHtml(formatTime(bill.occurredAt, timezone))}</span>
                      <strong class="amount ${bill.amount > 0 ? "expense" : "income"}">${escapeHtml(
                        formatAmount(bill.amount, bill.currency),
                      )}</strong>
                      <form class="bill-delete-form" method="post" action="/bills/${bill.id}/delete"
                        data-confirm="删除这条记录？" data-once-form>
                        <input type="hidden" name="returnTo" value="${escapeAttribute(returnTo)}" />
                        <button class="icon-button bill-delete" type="submit" aria-label="删除记录">${trashIcon()}</button>
                      </form>
                    </div>
                  `,
                )
                .join("")}
            </div>
          </section>
        `;
      })
      .join("")}
  </div>`;
}

function pagination(basePath: string, bills: PaginatedBills): string {
  return `
    <nav class="pagination" aria-label="明细分页">
      <span>${bills.total === 0 ? "0" : `${bills.page}/${bills.totalPages}`} 页 · ${bills.total} 条</span>
      <form method="get" action="${basePath}">
        <label>
          每页
          <select name="pageSize" onchange="this.form.submit()">
            ${[20, 50, 100]
              .map(
                (size) =>
                  `<option value="${size}" ${size === bills.pageSize ? "selected" : ""}>${size}</option>`,
              )
              .join("")}
          </select>
        </label>
      </form>
      <span class="pager-buttons">
        ${pageLink(basePath, "上一页", bills.page - 1, bills.pageSize, bills.page <= 1)}
        ${pageLink(basePath, "下一页", bills.page + 1, bills.pageSize, bills.page >= bills.totalPages)}
      </span>
    </nav>
  `;
}

function pageLink(
  basePath: string,
  label: string,
  page: number,
  pageSize: number,
  disabled: boolean,
): string {
  if (disabled) {
    return `<span class="button secondary disabled">${escapeHtml(label)}</span>`;
  }

  return `<a class="button secondary" href="${basePath}?page=${page}&pageSize=${pageSize}">${escapeHtml(
    label,
  )}</a>`;
}

function fabDrawer(book: Book, purposes: string[], idempotencyKey: string): string {
  const datalistId = `purposes-${book.id}`;
  return `
    <button class="fab" type="button" data-dialog-open="bill-drawer" aria-label="新增记账">${plusIcon()}</button>
    <dialog class="drawer" id="bill-drawer">
      <form class="drawer-panel" method="post" action="/books/${book.id}/bills" data-bill-form data-book-id="${book.id}" data-currency="${escapeAttribute(book.currency ?? "")}" data-once-form>
        <input type="hidden" name="idempotencyKey" value="${escapeAttribute(idempotencyKey)}" />
        <div class="drawer-handle"></div>
        <section class="section-title">
          <h2>新增记账</h2>
          <button class="icon-button" type="button" data-dialog-close="bill-drawer" aria-label="关闭">×</button>
        </section>
        <label>
          金额
          <input name="amount" inputmode="decimal" required placeholder="例如 12 或 -3000" />
        </label>
        <label>
          类型
          <input name="purpose" list="${datalistId}" required placeholder="例如 饮料" />
          <datalist id="${datalistId}">
            ${purposes.map((purpose) => `<option value="${escapeAttribute(purpose)}"></option>`).join("")}
          </datalist>
        </label>
        <button class="button" type="submit">保存</button>
      </form>
    </dialog>
  `;
}

function chartCarousel(
  categories: SpendingCategory[],
  bills: Bill[],
  timezone: string,
  currency: string | null,
): string {
  if (categories.length === 0) {
    return '<div class="chart-panel empty">无数据</div>';
  }

  return `
    <section class="chart-panel chart-carousel" data-chart-carousel>
      <button class="icon-button chart-nav prev" type="button" data-chart-prev aria-label="上一张图">‹</button>
      <div class="chart-slides">
        <div class="chart-slide active" data-chart-slide>
          ${pieChartContent(categories, currency)}
        </div>
        <div class="chart-slide" data-chart-slide aria-hidden="true">
          ${dailyBarChart(bills, timezone, currency)}
        </div>
      </div>
      <button class="icon-button chart-nav next" type="button" data-chart-next aria-label="下一张图">›</button>
    </section>
  `;
}

function pieChartContent(categories: SpendingCategory[], currency: string | null): string {
  const colors = ["#68c59c", "#ff8f8f", "#e5b567", "#7aa7ff", "#c99cff", "#72d6d0"];
  let cursor = 0;
  const slices = categories
    .map((category, index) => {
      const start = cursor;
      const end = cursor + category.percentage / 100;
      cursor = end;
      const color = colors[index % colors.length];
      return `<path class="pie-slice" d="${pieSlicePath(70, 70, 58, start, end)}" fill="${color}"
        tabindex="0" data-pie-slice data-label="${escapeAttribute(category.purpose)}"
        data-value="${escapeAttribute(formatAmount(category.amount, currency))}"
        data-percent="${category.percentage.toFixed(1)}%"></path>`;
    })
    .join("");

  return `
    <div class="pie-layout">
      <svg class="pie-chart" viewBox="0 0 140 140" role="img" aria-label="支出分类图">
        ${slices}
      </svg>
      <div>
        <p class="pie-focus" data-pie-focus>点击分类查看占比</p>
        <div class="pie-legend">
          ${categories
            .map(
              (category, index) => `
                <button type="button" data-pie-legend="${index}" data-label="${escapeAttribute(
                  category.purpose,
                )}" data-value="${escapeAttribute(formatAmount(category.amount, currency))}"
                  data-percent="${category.percentage.toFixed(1)}%">
                  <span style="background:${colors[index % colors.length]}"></span>
                  ${escapeHtml(category.purpose)}
                  <strong>${escapeHtml(formatAmount(category.amount, currency))}</strong>
                </button>
              `,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function dailyBarChart(bills: Bill[], timezone: string, currency: string | null): string {
  const rows = dailyExpenseRows(bills, timezone);
  const maxAmount = Math.max(...rows.map((row) => row.amount), 0);

  if (maxAmount <= 0) {
    return '<div class="empty chart-empty">无数据</div>';
  }

  const width = 360;
  const chartLeft = 60;
  const chartWidth = 210;
  const valueX = 346;
  const top = 36;
  const rowHeight = 20;
  const height = top + rows.length * rowHeight + 10;
  const grid = [0.25, 0.5, 0.75, 1]
    .map((step) => {
      const x = chartLeft + chartWidth * step;
      return `<line class="daily-chart-grid" x1="${x.toFixed(1)}" y1="${top - 10}" x2="${x.toFixed(1)}" y2="${
        height - 6
      }"></line>`;
    })
    .join("");

  return `
    <div class="daily-chart" role="img" aria-label="每日总消费柱状图">
      <svg class="daily-chart-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true">
        <text class="daily-chart-title" x="0" y="18">每日总消费</text>
        ${grid}
        ${rows
          .map((row, index) => {
            const y = top + index * rowHeight;
            const barWidth = Math.max((row.amount / maxAmount) * chartWidth, 3);
            return `
              <g class="daily-chart-row">
                <text class="daily-chart-day" x="0" y="${y + 11}">${escapeHtml(row.label)}</text>
                <rect class="daily-chart-track" x="${chartLeft}" y="${y}" width="${chartWidth}" height="10" rx="5"></rect>
                <rect class="daily-chart-bar" x="${chartLeft}" y="${y}" width="${barWidth.toFixed(1)}" height="10" rx="5"></rect>
                <text class="daily-chart-value" x="${valueX}" y="${y + 11}">${escapeHtml(formatAmount(row.amount, currency))}</text>
              </g>
            `;
          })
          .join("")}
      </svg>
    </div>
  `;
}

function dailyExpenseRows(
  bills: Bill[],
  timezone: string,
): Array<{ amount: number; label: string }> {
  const groups = new Map<string, number>();
  for (const bill of bills) {
    if (bill.amount <= 0) {
      continue;
    }

    const label = formatMonthDay(bill.occurredAt, timezone);
    groups.set(label, (groups.get(label) ?? 0) + bill.amount);
  }

  return [...groups.entries()].map(([label, amount]) => ({ amount, label }));
}

function pieSlicePath(cx: number, cy: number, radius: number, start: number, end: number): string {
  if (end - start >= 0.9999) {
    return `M ${cx} ${cy} m -${radius} 0 a ${radius} ${radius} 0 1 0 ${
      radius * 2
    } 0 a ${radius} ${radius} 0 1 0 -${radius * 2} 0`;
  }

  const startAngle = start * Math.PI * 2 - Math.PI / 2;
  const endAngle = end * Math.PI * 2 - Math.PI / 2;
  const x1 = cx + Math.cos(startAngle) * radius;
  const y1 = cy + Math.sin(startAngle) * radius;
  const x2 = cx + Math.cos(endAngle) * radius;
  const y2 = cy + Math.sin(endAngle) * radius;
  const largeArc = end - start > 0.5 ? 1 : 0;

  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(
    2,
  )} ${y2.toFixed(2)} Z`;
}

function currencyLabel(book: Book): string {
  return currencySymbol(book.currency) || "无币种";
}

function editIcon(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5-4-4L4 16v4Z"></path><path d="m13.5 6.5 4 4"></path></svg>`;
}

function chartIcon(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5"></path><path d="M4 19h16"></path><path d="M8 16v-5"></path><path d="M13 16V8"></path><path d="M18 16v-3"></path></svg>`;
}

function switchIcon(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h13"></path><path d="m17 4 3 3-3 3"></path><path d="M17 17H4"></path><path d="m7 14-3 3 3 3"></path></svg>`;
}

function plusIcon(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>`;
}

function trashIcon(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M6 6l1 14h10l1-14"></path><path d="M10 11v5"></path><path d="M14 11v5"></path></svg>`;
}
