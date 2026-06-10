import assert from "node:assert/strict";
import test from "node:test";

import { handleLedgerText } from "../features/bot/bot.js";
import type { KeepyService } from "../services/keepyService.js";

test("does not record edited messages without an existing bot entry", async () => {
  const replies: string[] = [];
  let wroteEntry = false;
  let replacedBills = false;
  const user = {
    firstName: "Yan",
    id: 1,
    lastName: null,
    photoUrl: null,
    telegramId: 42,
    timezone: "Asia/Shanghai",
    username: "yan",
  };
  const defaultBook = {
    currency: null,
    currentBalance: null,
    id: 1,
    initialBalance: null,
    isDefault: true,
    monthlyBudget: null,
    name: "默认",
    userId: 1,
  };
  const service = {
    ensureUser: () => ({ created: false, defaultBook, user }),
    getBotEntry: () => null,
    listBooks: () => [defaultBook],
    replaceBotEntryBills: () => {
      replacedBills = true;
      throw new Error("Should not replace bills for an unknown edited message.");
    },
    upsertBotEntry: () => {
      wroteEntry = true;
      throw new Error("Should not create an entry for an unknown edited message.");
    },
  } as unknown as KeepyService;
  const ctx = {
    from: {
      first_name: "Yan",
      id: 42,
      username: "yan",
    },
    reply: async (text: string) => {
      replies.push(text);
    },
  };

  await handleLedgerText(
    ctx as never,
    {
      chatId: "100",
      messageId: 9,
      occurredAt: new Date("2026-06-10T04:00:00.000Z"),
      text: "12 午饭",
    },
    service,
    {
      botToken: "test-token",
      botUsername: "keepy_bot",
      databasePath: ":memory:",
      isProduction: false,
      port: 3000,
      publicUrl: "",
      sessionSecret: "session-secret",
      webhookSecret: "webhook-secret",
    },
    true,
  );

  assert.equal(wroteEntry, false);
  assert.equal(replacedBills, false);
  assert.deepEqual(replies, ["这条旧消息没有可同步的记账记录。请重新发送一条新的记账消息。"]);
});
