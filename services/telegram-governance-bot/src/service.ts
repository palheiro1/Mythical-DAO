import {
  acquireRunLock,
  recordSourceFailure,
  recordSourceSuccess,
  releaseRunLock,
} from "./db";
import { readConfig } from "./config";
import { pollPortal } from "./portal";
import { pollGovernor } from "./governor";
import { pollSnapshot } from "./snapshot";
import { deliverPending, notifyOperator } from "./telegram";
import type { RunSummary } from "./types";
import { logError, logInfo, safeError } from "./utils";

async function runSource(
  env: Env,
  source: "snapshot" | "governor",
  now: number,
  operation: () => Promise<void>,
): Promise<"ok" | "failed"> {
  try {
    await operation();
    const health = await recordSourceSuccess(env.DB, source, now);
    if (health.recovered) {
      await notifyOperator(env, `${source} polling recovered.`);
    }
    return "ok";
  } catch (error) {
    const sanitized = safeError(error);
    const health = await recordSourceFailure(env.DB, source, sanitized, now);
    logError({ event: "source_poll_failed", source, error: sanitized, failures: health.failures });
    if (health.shouldAlert) {
      await notifyOperator(
        env,
        `${source} polling failed ${String(health.failures)} consecutive times: ${sanitized}`,
      );
    }
    return "failed";
  }
}

export async function runService(env: Env, now = Math.floor(Date.now() / 1000)): Promise<RunSummary> {
  const acquired = await acquireRunLock(env.DB, now);
  if (!acquired) {
    logInfo({ event: "run_skipped", reason: "lock_held" });
    return {
      acquired: false,
      snapshot: "skipped",
      governor: "skipped",
      deliveriesSent: 0,
      deliveriesFailed: 0,
    };
  }

  const runId = crypto.randomUUID();
  const startedAt = Date.now();
  logInfo({ event: "run_started", runId, environment: env.ENVIRONMENT });

  try {
    const config = readConfig(env);
    const snapshot = env.GOVERNANCE_MODE === "portal" ? "skipped" : await runSource(env, "snapshot", now, async () =>
      pollSnapshot(env, config, now),
    );
    const governor = await runSource(env, "governor", now, async () =>
      env.GOVERNANCE_MODE === "portal" ? pollPortal(env, now) : pollGovernor(env, config, now),
    );
    const deliveries = await deliverPending(env, now);
    const summary: RunSummary = {
      acquired: true,
      snapshot,
      governor,
      deliveriesSent: deliveries.sent,
      deliveriesFailed: deliveries.failed,
    };
    logInfo({
      event: "run_completed",
      runId,
      durationMs: Date.now() - startedAt,
      ...summary,
    });
    return summary;
  } finally {
    await releaseRunLock(env.DB, Math.floor(Date.now() / 1000));
  }
}
