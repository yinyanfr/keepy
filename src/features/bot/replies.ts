import { formatDateTime } from "../../lib/dates.js";
import { formatAmount } from "../../lib/money.js";
import type { Bill, Book, MonthSummary, User } from "../../services/keepyService.js";

export function helpText(miniAppUrl: string): string {
  const miniAppLine = miniAppUrl ? `\nMini App：${miniAppUrl}` : "";

  return `Keepy 记账格式：
数字 [用途] [账本]
数字 用途 账本1 账本2 ...（4 个及以上字段时同时记入多个账本）

示例：
12 午饭
59.9 咖啡 默认
59.9 咖啡 默认 旅行
-3000 工资

正数记为支出，负数记为收入。

命令：
/book 选择默认账本
/bills 查看默认账本本月账单
/help 查看帮助${miniAppLine}`;
}

export function welcomeText(created: boolean, miniAppUrl: string): string {
  const lead = created
    ? "欢迎使用 Keepy！已为你建立个人档案和默认账本「默认」。"
    : "欢迎回来，Keepy 已准备好。";
  const miniAppLine = miniAppUrl ? `\n\n管理账本和预算：${miniAppUrl}` : "";

  return `${lead}

直接发送「12 午饭」即可记账，也可以发送「12 午饭 默认」指定账本。${miniAppLine}`;
}

export function billCreatedText(input: {
  bill: Bill;
  book: Book;
  summary: MonthSummary;
  user: User;
}): string {
  const { bill, book, summary, user } = input;
  const budgetText =
    summary.budgetRemaining === null
      ? ""
      : `，预算余额${formatAmount(summary.budgetRemaining, book.currency)}`;

  return `成功于${formatDateTime(bill.occurredAt, user.timezone)}将用于${bill.purpose}的${formatAmount(
    bill.amount,
    book.currency,
  )}计入${book.name}，本月已于${book.name}计入${formatAmount(
    summary.expenseTotal,
    book.currency,
  )}${budgetText}`;
}

export function billsText(input: { book: Book; summary: MonthSummary; timezone: string }): string {
  const { book, summary, timezone } = input;
  const lines = [
    `${book.name} ${summary.monthKey}`,
    `本月余额：${formatAmount(summary.netBalance, book.currency)}`,
    `累计消费：${formatAmount(summary.expenseTotal, book.currency)}`,
  ];

  if (summary.budgetRemaining !== null) {
    lines.push(`预算余额：${formatAmount(summary.budgetRemaining, book.currency)}`);
  }

  if (summary.bills.length === 0) {
    lines.push("", "暂无明细。");
    return lines.join("\n");
  }

  lines.push("", "明细：");
  for (const bill of summary.bills.slice(0, 20)) {
    lines.push(
      `${formatDateTime(bill.occurredAt, timezone)} ${bill.purpose} ${formatAmount(
        bill.amount,
        bill.currency,
      )}`,
    );
  }

  if (summary.bills.length > 20) {
    lines.push(`还有 ${summary.bills.length - 20} 条，请在 Mini App 查看。`);
  }

  return lines.join("\n");
}
