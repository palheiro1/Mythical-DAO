import {
  claimDelivery,
  listDueDeliveries,
  markDeliveryFailed,
  markDeliverySent,
  recordSourceFailure,
  recordSourceSuccess,
} from "./db";
import { renderOperatorMessage } from "./messages";
import { logError, logInfo, safeError } from "./utils";

interface TelegramSuccess {
  ok: true;
  result: { message_id: number };
}

interface TelegramFailure {
  ok: false;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
}

export class TelegramError extends Error {
  readonly permanent: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(message: string, permanent: boolean, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "TelegramError";
    this.permanent = permanent;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function isTelegramResponse(value: unknown): value is TelegramSuccess | TelegramFailure {
  if (typeof value !== "object" || value === null || !("ok" in value)) return false;
  const response = value as Record<string, unknown>;
  if (response.ok === true) {
    const result = response.result;
    return (
      typeof result === "object" &&
      result !== null &&
      "message_id" in result &&
      typeof result.message_id === "number"
    );
  }
  return response.ok === false;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  messageHtml: string,
): Promise<number> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageHtml,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new TelegramError("Telegram network request failed", false);
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > 100_000) {
    throw new TelegramError("Telegram returned an oversized response", false);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new TelegramError(
      `Telegram returned invalid JSON (${String(response.status)})`,
      response.status === 401,
    );
  }
  if (!isTelegramResponse(payload)) {
    throw new TelegramError(`Telegram returned an invalid response (${String(response.status)})`, false);
  }
  if (payload.ok) {
    if (!Number.isSafeInteger(payload.result.message_id)) {
      throw new TelegramError("Telegram response did not include a valid message ID", false);
    }
    return payload.result.message_id;
  }

  const code = payload.error_code ?? response.status;
  const retryAfter = payload.parameters?.retry_after ?? null;
  const permanent = code === 400 || code === 401 || code === 403;
  throw new TelegramError(
    payload.description ?? `Telegram request failed (${String(code)})`,
    permanent,
    retryAfter,
  );
}

export async function notifyOperator(env: Env, summary: string): Promise<void> {
  try {
    await sendTelegramMessage(
      env.TELEGRAM_BOT_TOKEN,
      env.ADMIN_CHAT_ID,
      renderOperatorMessage(env.ENVIRONMENT, summary),
    );
  } catch (error) {
    logError({ event: "operator_notification_failed", error: safeError(error) });
  }
}

function retryDelay(attempt: number, requestedSeconds: number | null): number {
  if (requestedSeconds !== null) return Math.max(1, Math.min(requestedSeconds, 21_600));
  return Math.min(21_600, 60 * 2 ** Math.max(0, attempt - 1));
}

export async function deliverPending(
  env: Env,
  now: number,
): Promise<{ sent: number; failed: number }> {
  const deliveries = await listDueDeliveries(env.DB, now);
  let sent = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    const claimed = await claimDelivery(env.DB, delivery.eventKey, delivery.targetChatId, now);
    if (!claimed) continue;
    const attempt = delivery.attempts + 1;

    try {
      const messageId = await sendTelegramMessage(
        env.TELEGRAM_BOT_TOKEN,
        delivery.targetChatId,
        delivery.messageHtml,
      );
      await markDeliverySent(env.DB, delivery.eventKey, delivery.targetChatId, messageId, now);
      const health = await recordSourceSuccess(env.DB, "telegram", now);
      if (health.recovered) {
        await notifyOperator(env, "Telegram delivery recovered.");
      }
      sent += 1;
      logInfo({ event: "delivery_sent", eventKey: delivery.eventKey, messageId });
    } catch (error) {
      const telegramError =
        error instanceof TelegramError ? error : new TelegramError(safeError(error), false);
      const isDead = telegramError.permanent || attempt >= 8;
      const nextAttemptAt = now + retryDelay(attempt, telegramError.retryAfterSeconds);
      const sanitized = safeError(telegramError);
      await markDeliveryFailed(
        env.DB,
        delivery.eventKey,
        delivery.targetChatId,
        isDead ? "dead" : "failed",
        nextAttemptAt,
        sanitized,
        now,
      );
      const health = await recordSourceFailure(
        env.DB,
        "telegram",
        sanitized,
        now,
        telegramError.permanent,
      );
      if (health.shouldAlert) {
        await notifyOperator(
          env,
          `Telegram delivery incident after ${String(health.failures)} failure(s): ${sanitized}`,
        );
      }
      failed += 1;
      logError({ event: "delivery_failed", eventKey: delivery.eventKey, attempt, dead: isDead, error: sanitized });
    }
  }

  return { sent, failed };
}
