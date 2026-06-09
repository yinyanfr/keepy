export interface LedgerParseSuccess {
  amount: number;
  bookName: string | null;
  purpose: string;
  rawAmount: string;
}

export interface LedgerParseFailure {
  error: string;
}

export type LedgerParseResult = LedgerParseSuccess | LedgerParseFailure;

const amountPattern = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

export function isLedgerParseSuccess(result: LedgerParseResult): result is LedgerParseSuccess {
  return "amount" in result;
}

export function parseLedgerMessage(text: string, knownBookNames: string[]): LedgerParseResult {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { error: "请输入记账内容。" };
  }

  const [rawAmount, ...parts] = normalized.split(" ");
  if (!rawAmount || !amountPattern.test(rawAmount)) {
    return { error: "记账格式应为：数字 [用途] [账本]" };
  }

  const amount = Number(rawAmount);
  if (!Number.isFinite(amount)) {
    return { error: "金额无效。" };
  }

  if (parts.length === 0) {
    return {
      amount,
      bookName: null,
      purpose: "默认",
      rawAmount,
    };
  }

  if (parts.length === 1) {
    return {
      amount,
      bookName: null,
      purpose: parts[0] ?? "默认",
      rawAmount,
    };
  }

  const lastPart = parts.at(-1);
  const matchedBookName = knownBookNames.find((name) => name === lastPart);

  if (matchedBookName) {
    return {
      amount,
      bookName: matchedBookName,
      purpose: parts.slice(0, -1).join(" ") || "默认",
      rawAmount,
    };
  }

  return {
    amount,
    bookName: null,
    purpose: parts.join(" ") || "默认",
    rawAmount,
  };
}

export function formatAmount(amount: number, currency: string | null): string {
  const formatted = new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);

  return currency ? `${formatted}${currency}` : formatted;
}
