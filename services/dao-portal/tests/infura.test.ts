import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPublicClient } from "viem";
import { database } from "./db-fixture";
import {
  InfuraQuota,
  infuraFailure,
  infuraDailyLimit,
  infuraTransport,
  infuraUrl,
  indexClients,
} from "../worker/infura";
import { settledValues } from "../worker/rpc";

let fixture: Awaited<ReturnType<typeof database>>;
let now: number;
const time = {
  now: () => now,
  sleep: async (ms: number) => {
    now += ms;
  },
};
const owner = "infura-test";
const key = "private-test-key-never-log";
const state = () =>
  fixture.db.prepare("SELECT * FROM rpc_quota WHERE provider='infura'").first<{
    day: string;
    credits: number;
    requests: number;
    not_before: number;
    blocked_until: number;
  }>();
const quota = (limit = 2_400_000, background = () => false) =>
  new InfuraQuota(fixture.db, owner, limit, time, background);
const client = (budget = quota()) =>
  createPublicClient({ transport: infuraTransport(infuraUrl(key), budget) });

beforeEach(async () => {
  fixture = await database();
  now = Date.parse("2026-09-29T00:00:00Z");
  await fixture.db
    .prepare("INSERT INTO index_lock VALUES(1,?,unixepoch()+240)")
    .bind(owner)
    .run();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fixture.mf.dispose();
});

it("persists daily consumption across clients and resets at UTC midnight", async () => {
  await quota(510).reserve("eth_getLogs");
  await quota(510).reserve("eth_getLogs");
  await expect(quota(510).reserve("eth_chainId")).rejects.toThrow(
    "INFURA_DAILY_BUDGET_EXHAUSTED",
  );
  expect(await state()).toMatchObject({
    credits: 510,
    requests: 2,
    day: "2026-09-29",
  });
  now = Date.parse("2026-09-30T00:00:00Z");
  await quota(510).reserve("eth_chainId");
  expect(await state()).toMatchObject({
    credits: 5,
    requests: 1,
    day: "2026-09-30",
  });
});

it("atomically reserves quota when concurrent callers compete for the last request", async () => {
  const results = await Promise.allSettled([
    quota(255).reserve("eth_getLogs"),
    quota(255).reserve("eth_getLogs"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await state()).toMatchObject({ credits: 255, requests: 1 });
});

it("rechecks a cached quota's lease and other clients' cooldown before every dispatch", async () => {
  const cached = quota();
  await cached.reserve("eth_chainId");
  await quota().block(false);
  await expect(cached.reserve("eth_chainId")).rejects.toThrow(
    "INFURA_PROVIDER_COOLDOWN",
  );
  now += 60_001;
  await fixture.db.prepare("UPDATE index_lock SET expires_at=0").run();
  await expect(cached.reserve("eth_chainId")).rejects.toThrow(
    "INDEX_LEASE_EXPIRED",
  );
  expect((await state())?.requests).toBe(1);
});

it("serializes concurrent RPC reads, disables batching and prices each actual request", async () => {
  const starts: number[] = [];
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_input, init) => {
      starts.push(now);
      const body = JSON.parse(String(init?.body));
      expect(Array.isArray(body)).toBe(false);
      return Response.json({ jsonrpc: "2.0", id: body.id, result: [] });
    });
  const rpc = client();
  await Promise.all([rpc.getLogs(), rpc.getLogs(), rpc.getLogs()]);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1100);
  expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(1100);
  expect(await state()).toMatchObject({ credits: 765, requests: 3 });
});

it.each([402, 429])(
  "stops on HTTP %s without retrying or advancing requests in the queue",
  async (status) => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("limit", { status }));
    const rpc = client();
    const results = await Promise.allSettled([rpc.getLogs(), rpc.getLogs()]);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await state()).toMatchObject({ credits: 255, requests: 1 });
    expect((await state())!.blocked_until).toBe(
      status === 402 ? Date.parse("2026-09-30T00:00:00Z") : now + 60_000,
    );
    for (const r of results)
      if (r.status === "rejected") expect(String(r.reason)).not.toContain(key);
  },
);

it.each([-33000, -33200])(
  "handles Infura JSON-RPC quota code %s like its HTTP equivalent",
  async (code) => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          error: { code, message: `Limit at ${infuraUrl(key)}` },
        });
      });
    await expect(client().getLogs()).rejects.toThrow(
      code === -33000
        ? "INFURA_PROVIDER_DAILY_LIMIT"
        : "INFURA_PROVIDER_RATE_LIMIT",
    );
    await expect(client().getLogs()).rejects.toThrow(
      "INFURA_PROVIDER_COOLDOWN",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it("resumes after cooldown and never sends a key-bearing upstream error to callers", async () => {
  const logs = vi.spyOn(console, "error").mockImplementation(() => {});
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error(infuraUrl(key)));
  await expect(client().getLogs()).rejects.toThrow("INFURA_REQUEST_FAILED");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(logs.mock.calls)).not.toContain(key);
  const budget = quota();
  await budget.block(false);
  await expect(budget.reserve("eth_getLogs")).rejects.toThrow(
    "INFURA_PROVIDER_COOLDOWN",
  );
  now += 60_000;
  await budget.reserve("eth_getLogs");
  expect(await state()).toMatchObject({ credits: 510, requests: 2 });
});

it("distinguishes upstream timeouts and preserves safe nested error evidence", () => {
  const diagnostic = infuraFailure(
    {
      name: "RpcRequestError",
      cause: {
        name: "TimeoutError",
        status: 504,
        code: -32002,
        message: `Request timed out at ${infuraUrl(key)} (key=${key})\nRequest body: secret`,
      },
    },
    infuraUrl(key),
  );
  expect(diagnostic.reason).toBe("INFURA_REQUEST_TIMEOUT");
  expect(diagnostic.causes[1]).toMatchObject({ status: 504, code: -32002 });
  expect(JSON.stringify(diagnostic)).not.toContain(key);
  expect(JSON.stringify(diagnostic)).not.toContain("Request body");
});

it("reserves the remaining day's governance allowance before indexing optional asset history", async () => {
  await quota().reserve("eth_getLogs");
  await fixture.db.prepare("UPDATE rpc_quota SET credits=600000").run();
  now += 1100;
  await expect(
    quota(2_400_000, () => true).reserve("eth_getLogs"),
  ).rejects.toThrow("INFURA_GOVERNANCE_BUDGET_RESERVED");
  await quota().reserve("eth_getLogs");
  expect((await state())!.credits).toBe(600255);
});

it("refuses expired leases and unknown methods before spending credits", async () => {
  await expect(quota().reserve("eth_sendRawTransaction")).rejects.toThrow(
    "INFURA_UNBUDGETED_METHOD",
  );
  await fixture.db.prepare("DELETE FROM index_lock").run();
  await expect(quota().reserve("eth_getLogs")).rejects.toThrow(
    "INDEX_LEASE_EXPIRED",
  );
  expect(await state()).toBeNull();
});

it("fails closed for missing keys, invalid budgets and a second Infura endpoint", () => {
  expect(() => infuraUrl(undefined)).toThrow(
    "INFURA_API_KEY_MISSING_OR_INVALID",
  );
  expect(() => infuraUrl("https://example.com/secret")).toThrow();
  for (const value of ["0", "-1", "NaN", "3000001", "2400001"])
    expect(() => infuraDailyLimit(value)).toThrow(
      "INFURA_INVALID_DAILY_BUDGET",
    );
  expect(infuraDailyLimit()).toBe(2_400_000);
  expect(() =>
    indexClients(
      {
        ...fixture.bindings,
        ENVIRONMENT: "staging",
        INDEX_RPC_MODE: "infura-free",
        INFURA_API_KEY: key,
        INDEX_RPC_SECONDARY_URL: "https://another.infura.io/v3/other-key",
      } as Env,
      owner,
    ),
  ).toThrow("RPC_PROVIDERS_MUST_BE_INDEPENDENT");
});

it("waits for the other provider to finish before allowing the lease to be released", async () => {
  let done = false;
  await expect(
    settledValues([
      Promise.reject(new Error("provider failure")),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          done = true;
          resolve();
        }, 10),
      ),
    ]),
  ).rejects.toThrow("provider failure");
  expect(done).toBe(true);
});

it("charges raw transport methods too and refuses an unbudgeted raw method", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      return Response.json({ jsonrpc: "2.0", id: body.id, result: [] });
    });
  const rpc = client();
  await rpc.transport.request({ method: "eth_getLogs", params: [{}] });
  expect(await state()).toMatchObject({ credits: 255, requests: 1 });
  await expect(
    rpc.transport.request({ method: "eth_simulateV1", params: [] }),
  ).rejects.toThrow("INFURA_UNBUDGETED_METHOD");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("retains range-limit classification without exposing provider credentials", () => {
  const d = infuraFailure(
    { message: `block range too large at ${infuraUrl(key)}` },
    infuraUrl(key),
  );
  expect(d.reason).toBe("INFURA_LOG_RANGE_LIMIT");
  expect(JSON.stringify(d)).not.toContain(key);
});

it("preserves a bounded-response overflow as a resizable log failure", () => {
  const error = Object.assign(new Error("RPC_RESPONSE_TOO_LARGE"), {
    code: "RPC_RESPONSE_TOO_LARGE",
  });
  expect(infuraFailure(error, infuraUrl(key)).reason).toBe(
    "INFURA_LOG_RANGE_LIMIT",
  );
});
