import { createHmac, timingSafeEqual } from "node:crypto";

const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;

export const sessionCookieName = "keepy_session";

interface SessionPayload {
  expiresAt: number;
  telegramId: number;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

export function createSessionValue(telegramId: number, secret: string): string {
  const payload: SessionPayload = {
    expiresAt: Date.now() + sessionTtlMs,
    telegramId,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function readSessionValue(value: string | undefined, secret: string): number | null {
  if (!value) {
    return null;
  }

  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature || !safeEqual(signature, sign(encodedPayload, secret))) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;

    if (
      typeof payload.telegramId !== "number" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt < Date.now()
    ) {
      return null;
    }

    return payload.telegramId;
  } catch {
    return null;
  }
}
