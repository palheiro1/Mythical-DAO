import {
  enqueueNotification,
  getFirstProposalIdentity,
  getHealthSummary,
  retryDelivery,
} from "./db";
import { runService } from "./service";
import { deliverPending } from "./telegram";
import { constantTimeEqual, logError, safeError } from "./utils";

const STAGING_TEST_MESSAGE = [
  "<b>Mythical DAO governance notifier — staging test</b>",
  "",
  "✅ Telegram delivery is configured correctly.",
  "",
  "No governance action is required.",
].join("\n");

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function isStagingEnvironment(environment: string): boolean {
  return environment === "staging";
}

async function authorized(request: Request, env: Env): Promise<boolean> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  return constantTimeEqual(authorization.slice("Bearer ".length), env.ADMIN_API_TOKEN);
}

async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    const health = await getHealthSummary(env.DB);
    const degraded = health.sources.some((source) => source.incidentOpen);
    return json({ status: degraded ? "degraded" : "ok", ...health }, degraded ? 503 : 200);
  }

  if (url.pathname.startsWith("/admin/") && !(await authorized(request, env))) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (request.method === "POST" && url.pathname === "/admin/run") {
    return json(await runService(env));
  }

  if (request.method === "POST" && url.pathname === "/admin/test-telegram") {
    if (!isStagingEnvironment(env.ENVIRONMENT)) return json({ error: "Not found" }, 404);
    const proposal = await getFirstProposalIdentity(env.DB);
    if (proposal === null) {
      return json({ error: "Run the initial staging import before testing Telegram" }, 409);
    }
    const now = Math.floor(Date.now() / 1000);
    const queued = await enqueueNotification(
      env.DB,
      {
        eventKey: "staging:telegram-delivery-test:v1",
        source: proposal.source,
        proposalId: proposal.proposalId,
        eventType: "created",
        occurredAt: now,
        messageHtml: STAGING_TEST_MESSAGE,
      },
      env.TELEGRAM_CHANNEL_ID,
      now,
    );
    const delivery = await deliverPending(env, now);
    return json({ queued, ...delivery });
  }

  if (request.method === "POST" && url.pathname.startsWith("/admin/retry/")) {
    const eventKey = decodeURIComponent(url.pathname.slice("/admin/retry/".length));
    if (eventKey.length === 0 || eventKey.length > 500) {
      return json({ error: "Invalid event key" }, 400);
    }
    const now = Math.floor(Date.now() / 1000);
    const found = await retryDelivery(env.DB, eventKey, now);
    if (!found) return json({ error: "Retryable delivery not found" }, 404);
    const delivery = await deliverPending(env, now);
    return json({ retried: true, ...delivery });
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleFetch(request, env);
    } catch (error) {
      logError({ event: "http_request_failed", error: safeError(error) });
      return json({ error: "Internal server error" }, 500);
    }
  },

  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(
      runService(env).catch((error: unknown) => {
        logError({ event: "scheduled_run_failed", error: safeError(error) });
      }),
    );
  },
} satisfies ExportedHandler<Env>;
