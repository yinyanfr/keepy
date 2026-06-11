import dotenv from "dotenv";

dotenv.config({ quiet: true });

function numberFromEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export interface AppConfig {
  botToken: string;
  botUsername: string;
  databasePath: string;
  isProduction: boolean;
  miniAppUrl: string;
  port: number;
  publicUrl: string;
  sessionSecret: string;
  webhookSecret: string;
}

export function loadConfig(): AppConfig {
  const isProduction = process.env.NODE_ENV === "production";
  const sessionSecret = process.env.SESSION_SECRET;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (isProduction && !sessionSecret) {
    throw new Error("Missing SESSION_SECRET in production.");
  }

  if (isProduction && !webhookSecret) {
    throw new Error("Missing WEBHOOK_SECRET in production.");
  }

  return {
    botToken: process.env.BOT_TOKEN ?? process.env.BOTTOKEN ?? "",
    botUsername: (process.env.BOT_USERNAME ?? "").replace(/^@/, ""),
    databasePath: process.env.DATABASE_PATH ?? "data/keepy.sqlite",
    isProduction,
    miniAppUrl: resolveMiniAppUrl(
      (process.env.MINI_APP_URL ?? "").trim(),
      (process.env.BOT_USERNAME ?? "").replace(/^@/, ""),
    ),
    port: numberFromEnv(process.env.PORT, 3000),
    publicUrl: stripTrailingSlash(process.env.PUBLIC_URL ?? ""),
    sessionSecret: sessionSecret ?? "dev-session-secret-change-me",
    webhookSecret: webhookSecret ?? "dev-webhook-secret-change-me",
  };
}

export function requireBotToken(config: AppConfig): string {
  if (!config.botToken) {
    throw new Error("Missing BOTTOKEN or BOT_TOKEN in environment.");
  }

  return config.botToken;
}

function resolveMiniAppUrl(configuredUrl: string, botUsername: string): string {
  if (configuredUrl) {
    return configuredUrl;
  }

  return botUsername ? `https://t.me/${botUsername}/keepy` : "";
}
