import assert from "node:assert/strict";
import test from "node:test";

import { validateTelegramWebhookRequest } from "../routes/telegram.js";

test("accepts telegram webhook requests with the path secret only", () => {
  assert.equal(validateTelegramWebhookRequest("secret", undefined, "secret"), null);
});

test("accepts telegram webhook requests only when path and header secrets match", () => {
  assert.equal(validateTelegramWebhookRequest("wrong", "secret", "secret"), 404);
  assert.equal(validateTelegramWebhookRequest("secret", "wrong", "secret"), 403);
  assert.equal(validateTelegramWebhookRequest("secret", "secret", "secret"), null);
});
