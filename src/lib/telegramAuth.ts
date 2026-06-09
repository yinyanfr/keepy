import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramAuthUser {
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  telegramId: number;
  username: string | null;
}

const authMaxAgeSeconds = 24 * 60 * 60;

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function buildCheckString(entries: [string, string][]): string {
  return entries
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

export function verifyWebAppInitData(
  initData: string,
  botToken: string,
  now = new Date(),
): TelegramAuthUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const userJson = params.get("user");

  if (!hash || !userJson || !isFreshAuthDate(params.get("auth_date"), now)) {
    return null;
  }

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = createHmac("sha256", secret)
    .update(buildCheckString([...params.entries()]))
    .digest("hex");

  if (!safeEqualHex(calculated, hash)) {
    return null;
  }

  try {
    const user = JSON.parse(userJson) as Record<string, unknown>;
    return telegramUserFromRecord(user);
  } catch {
    return null;
  }
}

export function verifyLoginWidgetAuth(
  data: URLSearchParams,
  botToken: string,
  now = new Date(),
): TelegramAuthUser | null {
  const hash = data.get("hash");
  if (!hash || !isFreshAuthDate(data.get("auth_date"), now)) {
    return null;
  }

  const secret = createHash("sha256").update(botToken).digest();
  const calculated = createHmac("sha256", secret)
    .update(buildCheckString([...data.entries()]))
    .digest("hex");

  if (!safeEqualHex(calculated, hash)) {
    return null;
  }

  return telegramUserFromRecord(Object.fromEntries(data.entries()));
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isFreshAuthDate(authDate: string | null, now: Date): boolean {
  if (!authDate || !/^\d+$/.test(authDate)) {
    return false;
  }

  const timestampMs = Number(authDate) * 1000;
  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  const ageSeconds = (now.getTime() - timestampMs) / 1000;
  return ageSeconds >= 0 && ageSeconds <= authMaxAgeSeconds;
}

function telegramUserFromRecord(record: Record<string, unknown>): TelegramAuthUser | null {
  const id = Number(record.id);
  if (!Number.isInteger(id)) {
    return null;
  }

  return {
    firstName: nullableText(record.first_name),
    lastName: nullableText(record.last_name),
    photoUrl: nullableText(record.photo_url),
    telegramId: id,
    username: nullableText(record.username),
  };
}
