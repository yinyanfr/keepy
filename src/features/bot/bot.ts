import { Bot, InlineKeyboard, type Context } from "grammy";

import type { AppConfig } from "../../configs/env.js";
import { isLedgerParseSuccess, parseLedgerMessage } from "../../lib/money.js";
import type { TelegramAuthUser } from "../../lib/telegramAuth.js";
import { BookNotFoundError } from "../../services/keepyService.js";
import type { KeepyService } from "../../services/keepyService.js";
import { billCreatedText, billsText, helpText, welcomeText } from "./replies.js";

const telegramMiniAppUrl = "https://t.me/bkpybot/keepy";

export function createKeepyBot(service: KeepyService, config: AppConfig): Bot {
  const bot = new Bot(config.botToken);

  bot.command("start", async (ctx) => {
    const profile = profileFromContext(ctx);
    if (!profile) {
      await ctx.reply("无法识别 Telegram 用户。");
      return;
    }

    const result = service.ensureUser(profile);
    await ctx.reply(welcomeText(result.created, config.publicUrl), miniAppReplyOptions());
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(helpText(config.publicUrl), miniAppReplyOptions());
  });

  bot.command("book", async (ctx) => {
    const profile = profileFromContext(ctx);
    if (!profile) {
      await ctx.reply("无法识别 Telegram 用户。");
      return;
    }

    const { user } = service.ensureUser(profile);
    const books = service.listBooks(user.id);
    const keyboard = new InlineKeyboard();

    for (const book of books) {
      keyboard.text(`${book.isDefault ? "✓ " : ""}${book.name}`, `book:set:${book.id}`).row();
    }

    await ctx.reply("选择默认账本：", { reply_markup: keyboard });
  });

  bot.command("bills", async (ctx) => {
    const profile = profileFromContext(ctx);
    if (!profile) {
      await ctx.reply("无法识别 Telegram 用户。");
      return;
    }

    const { user, defaultBook } = service.ensureUser(profile);
    const summary = service.getCurrentMonthSummary(user, defaultBook.id);
    await ctx.reply(
      billsText({
        book: defaultBook,
        summary,
        timezone: user.timezone,
      }),
    );
  });

  bot.callbackQuery(/^book:set:(\d+)$/, async (ctx) => {
    const profile = profileFromContext(ctx);
    const bookId = Number(ctx.match[1]);

    if (!profile || !Number.isInteger(bookId)) {
      await ctx.answerCallbackQuery("无法设置账本。");
      return;
    }

    const { user } = service.ensureUser(profile);
    let book;

    try {
      book = service.setDefaultBook(user.id, bookId);
    } catch (error) {
      if (error instanceof BookNotFoundError) {
        await ctx.answerCallbackQuery({ show_alert: true, text: "账本不存在。" });
        return;
      }

      throw error;
    }

    await ctx.answerCallbackQuery(`已设为默认账本：${book.name}`);
    await ctx.editMessageText(`默认账本已设置为：${book.name}`);
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) {
      return;
    }

    const profile = profileFromContext(ctx);
    if (!profile) {
      await ctx.reply("无法识别 Telegram 用户。");
      return;
    }

    const existingUser = service.getUserByTelegramId(profile.telegramId);
    const existingBookNames = existingUser
      ? service.listBooks(existingUser.id).map((book) => book.name)
      : [];
    const firstPass = parseLedgerMessage(text, existingBookNames);
    if (!isLedgerParseSuccess(firstPass)) {
      await ctx.reply(`${firstPass.error}\n\n${helpText(config.publicUrl)}`);
      return;
    }

    const { user } = service.ensureUser(profile);
    const bookNames = service.listBooks(user.id).map((book) => book.name);
    const parsed = parseLedgerMessage(text, bookNames);

    if (!isLedgerParseSuccess(parsed)) {
      await ctx.reply(`${parsed.error}\n\n${helpText(config.publicUrl)}`);
      return;
    }

    const { bill, book } = service.recordBill(user, parsed);
    const summary = service.getCurrentMonthSummary(user, book.id, bill.occurredAt);
    await ctx.reply(billCreatedText({ bill, book, summary, user }));
  });

  bot.catch((error) => {
    console.error("Bot error", error);
  });

  return bot;
}

function miniAppReplyOptions(): { reply_markup: InlineKeyboard } {
  return {
    reply_markup: new InlineKeyboard().webApp("打开 Mini App", telegramMiniAppUrl),
  };
}

function profileFromContext(ctx: Context): TelegramAuthUser | null {
  const from = ctx.from;
  if (!from) {
    return null;
  }

  return {
    firstName: from.first_name ?? null,
    lastName: from.last_name ?? null,
    photoUrl: null,
    telegramId: from.id,
    username: from.username ?? null,
  };
}
