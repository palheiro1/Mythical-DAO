import { env } from "cloudflare:workers";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { upsertProposal } from "../src/db";
import worker from "../src/index";
import { network } from "./network";

describe("HTTP interface", () => {
  it("exposes sanitized health without authentication", async () => {
    const response = await worker.fetch(new Request("https://worker.test/health"), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", pendingDeliveries: 0 });
  });

  it("protects administrative endpoints", async () => {
    const response = await worker.fetch(
      new Request("https://worker.test/admin/run", { method: "POST" }),
      env,
    );
    expect(response.status).toBe(401);
  });

  it("sends the protected staging test through the idempotent delivery pipeline", async () => {
    await upsertProposal(env.DB, {
      source: "snapshot",
      proposalId: "staging-test-proposal",
      title: "Staging test proposal",
      url: "https://snapshot.org/#/s:mythicalbeings.eth/proposal/test",
      state: "closed",
      createdAt: 1,
      startsAt: 1,
      endsAt: 2,
      startBlock: null,
      endBlock: null,
      choices: ["For", "Against"],
      scores: [1, 0],
      metadata: {},
      notificationsEnabled: false,
      firstSeenAt: 1,
      updatedAt: 1,
    });
    let telegramCalls = 0;
    network.use(
      http.post("https://api.telegram.org/bottest-token/sendMessage", () => {
        telegramCalls += 1;
        return HttpResponse.json({ ok: true, result: { message_id: 321 } });
      }),
    );
    const request = (): Request =>
      new Request("https://worker.test/admin/test-telegram", {
        method: "POST",
        headers: { authorization: "Bearer test-admin-token" },
      });

    const first = await worker.fetch(request(), env);
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ queued: true, sent: 1, failed: 0 });

    const repeated = await worker.fetch(request(), env);
    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toEqual({ queued: false, sent: 0, failed: 0 });
    expect(telegramCalls).toBe(1);
  });
});
