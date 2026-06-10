import { Bot, InlineKeyboard, type Context } from "grammy";

import type { AppConfig } from "../../configs/env.js";
import {
  isLedgerParseSuccess,
  parseLedgerMessage,
  type LedgerParseSuccess,
} from "../../lib/money.js";
import type { TelegramAuthUser } from "../../lib/telegramAuth.js";
import {
  BookNotFoundError,
  type BotBillInput,
  type Book,
  type User,
} from "../../services/keepyService.js";
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
    const categories = service.getCurrentMonthSpendingCategories(user, defaultBook.id);
    await ctx.reply(
      billsText({
        book: defaultBook,
        categories,
        summary,
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
    await handleLedgerText(
      ctx,
      {
        chatId: String(ctx.message.chat.id),
        messageId: ctx.message.message_id,
        occurredAt: telegramDate(ctx.message.date),
        text: ctx.message.text,
      },
      service,
      config,
      false,
    );
  });

  bot.on("edited_message:text", async (ctx) => {
    const message = ctx.update.edited_message;
    if (!message?.text) {
      return;
    }

    await handleLedgerText(
      ctx,
      {
        chatId: String(message.chat.id),
        messageId: message.message_id,
        occurredAt: telegramDate(message.date),
        text: message.text,
      },
      service,
      config,
      true,
    );
  });

  bot.catch((error) => {
    console.error("Bot error", error);
  });

  return bot;
}

interface LedgerTextEvent {
  chatId: string;
  messageId: number;
  occurredAt: Date;
  text: string;
}

async function handleLedgerText(
  ctx: Context,
  event: LedgerTextEvent,
  service: KeepyService,
  config: AppConfig,
  edited: boolean,
): Promise<void> {
  const text = event.text.trim();
  if (!text || text.startsWith("/")) {
    return;
  }

  const profile = profileFromContext(ctx);
  if (!profile) {
    await ctx.reply("无法识别 Telegram 用户。");
    return;
  }

  const { user } = service.ensureUser(profile);
  const previousEntry = service.getBotEntry(user.id, event.chatId, event.messageId);
  const bookNames = service.listBooks(user.id).map((book) => book.name);
  const parsed = parseLedgerMessage(text, bookNames);

  if (!isLedgerParseSuccess(parsed)) {
    const entry = service.upsertBotEntry({
      chatId: event.chatId,
      lastError: parsed.error,
      messageId: event.messageId,
      rawText: text,
      status: "invalid",
      userId: user.id,
    });
    const hadBills = service.countBotEntryBills(entry.id) > 0;

    if (edited && hadBills) {
      await ctx.reply(
        `修改后的格式无效：${parsed.error}\n已保留此前记录。如需删除，请在 Mini App 中删除记录。`,
        miniAppReplyOptions(),
      );
      return;
    }

    await ctx.reply(
      `${parsed.error}\n可以直接编辑这条消息为正确格式。\n\n${helpText(config.publicUrl)}`,
      miniAppReplyOptions(),
    );
    return;
  }

  const billInputs = botBillInputs(service, user, parsed);
  const entry = service.upsertBotEntry({
    chatId: event.chatId,
    messageId: event.messageId,
    rawText: text,
    status: "valid",
    userId: user.id,
  });
  const billTime = previousEntry?.firstBillAt ?? previousEntry?.createdAt ?? event.occurredAt;
  const result = service.replaceBotEntryBills(entry.id, text, billInputs, billTime);
  const replies = result.bills.map(({ bill, book }) => {
    const summary = service.getCurrentMonthSummary(user, book.id, bill.occurredAt);
    return billCreatedText({ bill, book, summary, user });
  });

  await ctx.reply(`${edited ? "已更新这条记账：\n" : ""}${replies.join("\n\n")}`);
}

function botBillInputs(
  service: KeepyService,
  user: User,
  parsed: LedgerParseSuccess,
): BotBillInput[] {
  if (parsed.bookNames && parsed.bookNames.length > 0) {
    return parsed.bookNames.map((bookName) => {
      const book = service.findBookByName(user.id, bookName);
      if (!book) {
        throw new BookNotFoundError(`Book not found: ${bookName}`);
      }

      return billInputForBook(book, parsed);
    });
  }

  const book = parsed.bookName
    ? (service.findBookByName(user.id, parsed.bookName) ?? service.ensureDefaultBook(user.id))
    : service.ensureDefaultBook(user.id);
  return [billInputForBook(book, parsed)];
}

function billInputForBook(book: Book, parsed: LedgerParseSuccess): BotBillInput {
  return {
    amount: parsed.amount,
    bookId: book.id,
    purpose: parsed.purpose,
  };
}

function telegramDate(timestamp: number | undefined): Date {
  return timestamp ? new Date(timestamp * 1000) : new Date();
}

function miniAppReplyOptions(): { reply_markup: InlineKeyboard } {
  return {
    reply_markup: new InlineKeyboard().url("打开 Mini App", telegramMiniAppUrl),
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
