import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  acquireRunLock,
  enqueueNotification,
  getHealthSummary,
  upsertProposal,
} from "../src/db";
import type { NotificationEvent, ProposalRecord } from "../src/types";

const now = 1_700_000_000;

function proposal(): ProposalRecord {
  return {
    source: "snapshot",
    proposalId: "proposal-1",
    title: "Test",
    url: "https://snapshot.org/proposal-1",
    state: "active",
    createdAt: now,
    startsAt: now,
    endsAt: now + 86_400,
    startBlock: null,
    endBlock: null,
    choices: ["For", "Against"],
    scores: [1, 0],
    metadata: {},
    notificationsEnabled: true,
    firstSeenAt: now,
    updatedAt: now,
  };
}

describe("D1 idempotency", () => {
  it("creates one delivery when the same event is enqueued twice", async () => {
    await upsertProposal(env.DB, proposal());
    const event: NotificationEvent = {
      eventKey: "snapshot:proposal-1:active",
      source: "snapshot",
      proposalId: "proposal-1",
      eventType: "active",
      occurredAt: now,
      messageHtml: "Voting is open",
    };

    expect(await enqueueNotification(env.DB, event, "@channel", now)).toBe(true);
    expect(await enqueueNotification(env.DB, event, "@channel", now)).toBe(false);

    const events = await env.DB.prepare("SELECT COUNT(*) AS count FROM notification_events").first<{
      count: number;
    }>();
    const deliveries = await env.DB.prepare("SELECT COUNT(*) AS count FROM deliveries").first<{
      count: number;
    }>();
    expect(events?.count).toBe(1);
    expect(deliveries?.count).toBe(1);
  });

  it("allows only one active run lease", async () => {
    expect(await acquireRunLock(env.DB, now)).toBe(true);
    expect(await acquireRunLock(env.DB, now + 1)).toBe(false);
    expect(await acquireRunLock(env.DB, now + 601)).toBe(true);
  });

  it("returns a sanitized health summary", async () => {
    const health = await getHealthSummary(env.DB);
    expect(health.pendingDeliveries).toBe(0);
    expect(health.sources).toEqual([]);
  });
});
