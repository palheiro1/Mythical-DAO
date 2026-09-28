import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { sendTelegramMessage, TelegramError } from "../src/telegram";
import { network } from "./network";

const endpoint = "https://api.telegram.org/bottest-token/sendMessage";

describe("Telegram delivery", () => {
  it("returns the Telegram message ID", async () => {
    network.use(
      http.post(endpoint, () => HttpResponse.json({ ok: true, result: { message_id: 123 } })),
    );
    await expect(sendTelegramMessage("test-token", "@channel", "Hello")).resolves.toBe(123);
  });

  it("honours Telegram retry_after metadata", async () => {
    network.use(
      http.post(endpoint, () =>
        HttpResponse.json(
          { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 12 } },
          { status: 429 },
        ),
      ),
    );
    const error = await sendTelegramMessage("test-token", "@channel", "Hello").catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(TelegramError);
    expect((error as TelegramError).retryAfterSeconds).toBe(12);
    expect((error as TelegramError).permanent).toBe(false);
  });

  it("classifies lost channel permissions as permanent", async () => {
    network.use(
      http.post(endpoint, () =>
        HttpResponse.json(
          { ok: false, error_code: 403, description: "Forbidden" },
          { status: 403 },
        ),
      ),
    );
    const error = await sendTelegramMessage("test-token", "@channel", "Hello").catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(TelegramError);
    expect((error as TelegramError).permanent).toBe(true);
  });
});
