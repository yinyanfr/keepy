export const clientSourceCookieName = "keepy_client";

export type ClientSource = "telegram" | "web";

export function isTelegramClientSource(value: unknown): boolean {
  return value === "telegram";
}
