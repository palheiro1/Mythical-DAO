import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { encodeFunctionData, zeroAddress } from "viem";
import worker from "../worker/index";
import { config } from "../worker/config";
import { database } from "./db-fixture";
import { cachedRead, reserveGraphRead } from "../worker/read-cache";
import { normalizeGraphSnapshot } from "../worker/graph-read-model";
import {
  GOVERNOR,
  MANA,
  GATEWAY_URL,
  PILOT_DEPLOYMENT,
} from "../shared/graph-pilot.mjs";
import { proposalHash } from "../shared/domain";
import { tokenAbi } from "../shared/abis";

const hash = `0x${"ab".repeat(32)}` as const;
const account = "0x0000000000000000000000000000000000000001";
function snapshot() {
  const description = "Test governance read";
  const proposalId = proposalHash(
    [{ target: MANA, value: "0", data: "0x" }],
    description,
  );
  const p = {
    id: proposalId,
    proposalId,
    governor: GOVERNOR,
    proposer: account,
    description,
    targets: [MANA],
    values: ["0"],
    signatures: [""],
    calldatas: ["0x"],
    voteStart: "49900000",
    voteEnd: "49910000",
    createdBlock: "49800000",
    createdBlockHash: hash,
    createdTransaction: hash,
    againstVotes: "0",
    forVotes: "0",
    abstainVotes: "0",
    executed: false,
    canceled: false,
  };
  return {
    _meta: {
      deployment: PILOT_DEPLOYMENT,
      hasIndexingErrors: false,
      block: {
        number: 50000000,
        hash,
        timestamp: Math.floor(Date.now() / 1000),
      },
    },
    pilotStats: {
      chainId: 137,
      governor: GOVERNOR,
      mana: MANA,
      governorStartBlock: "48674443",
      manaStartBlock: "45785116",
      totalSupply: "10",
      holders: "1",
      proposals: "1",
      votes: "0",
      transfers: "1",
      delegationChanges: "0",
    },
    manaAccounts: [
      { id: account, balance: "10", votingPower: "10", delegate: account },
    ],
    proposals: [p],
    eventRecords: [
      {
        id: "0x01",
        contract: GOVERNOR,
        name: "ProposalCreated",
        blockNumber: p.createdBlock,
        blockHash: hash,
        transactionHash: hash,
        logIndex: "0",
        proposal: { proposalId },
      },
      {
        id: "0x02",
        contract: MANA,
        name: "Transfer",
        blockNumber: "49800000",
        blockHash: hash,
        transactionHash: hash,
        logIndex: "1",
        from: zeroAddress,
        to: account,
        value: "10",
      },
    ],
  };
}
let fixture: Awaited<ReturnType<typeof database>>;
let env: Env;
let data: ReturnType<typeof snapshot>;
let calls: string[];
let unavailable = false;
const get = (path: string) =>
  worker.fetch(new Request(`https://portal.example/api/${path}`), env);
beforeEach(async () => {
  fixture = await database();
  env = {
    ...fixture.bindings,
    ENVIRONMENT: "staging",
    GRAPH_READ_MODE: "primary",
    GRAPH_API_KEY: "server-only-secret-test-key",
    GRAPH_ALLOW_UNRESTRICTED_SERVER_KEY: "true",
  } as Env;
  data = snapshot();
  calls = [];
  unavailable = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    calls.push(String(input));
    expect(String(input)).toBe(GATEWAY_URL);
    if (unavailable) return new Response("unavailable", { status: 503 });
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer server-only-secret-test-key",
    );
    const body = JSON.parse(String(init?.body));
    return Response.json({
      data: body.query.includes("PortalReadSnapshot")
        ? data
        : { _meta: data._meta },
    });
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fixture.mf.dispose();
});

it("serves all indexed routes with no RPC configured and shares one snapshot", async () => {
  for (const path of [
    "health",
    "delegates",
    `members/${account}`,
    "overview",
    "proposals?kind=executable",
    `proposals/${GOVERNOR}/${data.proposals[0].proposalId}`,
    "events",
    "ballots",
  ]) {
    const response = await get(path);
    expect(response.status, path).toBe(200);
    const body = (await response.json()) as any;
    expect(body.read.source).toBe("The Graph");
    expect(body.read.status).toBe("fresh");
    expect(JSON.stringify(body)).not.toContain("server-only-secret");
    if (path === "health")
      expect(body).toMatchObject({
        signingAllowed: false,
        operationVerification: "on-demand",
      });
    if (path === "delegates")
      expect(body.items).toEqual([{ address: account, votes: "10" }]);
    if (path === "overview") expect(body.readyForExecution).toBeNull();
  }
  expect(calls).toHaveLength(2);
  const detail = (await (
    await get(`proposals/${GOVERNOR}/${data.proposals[0].proposalId}`)
  ).json()) as any;
  expect(detail.state).toBe("Ended"); // No quorum data: never invent approval.
  expect(
    ((await (await get(`members/${zeroAddress}`)).json()) as any).balance,
  ).toBe("0");
});

it("keeps live preflight mandatory when indexed data is available", async () => {
  await get("delegates");
  const response = await worker.fetch(
    new Request("https://portal.example/api/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account,
        to: MANA,
        value: "0",
        data: encodeFunctionData({
          abi: tokenAbi,
          functionName: "delegate",
          args: [account],
        }),
      }),
    }),
    env,
  );
  expect(response.ok).toBe(false);
  expect(calls).toHaveLength(2);
});

it("coalesces simultaneous visitors and falls back to marked stale data on failure", async () => {
  const responses = await Promise.all([
    get("delegates"),
    get("proposals"),
    get("health"),
  ]);
  expect(responses.every((r) => r.ok)).toBe(true);
  expect(calls).toHaveLength(2);
  await fixture.db
    .prepare("UPDATE public_read_cache SET checked_at=?")
    .bind(Date.now() - 61_000)
    .run();
  unavailable = true;
  const stale = (await (await get("delegates")).json()) as any;
  expect(stale.items).toHaveLength(1);
  expect(stale.read).toMatchObject({ status: "stale", cached: true });
  expect(calls).toHaveLength(3);
  await get("delegates");
  expect(calls).toHaveLength(3);
});

it("preserves the last valid snapshot when the new deployment has indexing errors", async () => {
  await get("delegates");
  await fixture.db
    .prepare("UPDATE public_read_cache SET checked_at=?")
    .bind(Date.now() - 61_000)
    .run();
  data._meta.hasIndexingErrors = true;
  expect(((await (await get("delegates")).json()) as any).read).toMatchObject({
    status: "stale",
    reason: "INDEXING_ERRORS",
  });
});

it("rejects mismatched content, missing rows, wrong deployment and block hash", () => {
  for (const corrupt of [
    (d: typeof data) => {
      d.proposals[0].description = "tampered";
    },
    (d: typeof data) => {
      d.eventRecords.pop();
    },
    (d: typeof data) => {
      d.manaAccounts = [];
    },
    (d: typeof data) => {
      d._meta.deployment = "wrong";
    },
    (d: typeof data) => {
      d._meta.block.hash = `0x${"cd".repeat(32)}`;
    },
  ]) {
    const d = snapshot();
    corrupt(d);
    expect(() => normalizeGraphSnapshot(d, hash)).toThrow();
  }
});

it("serves the treasury cache during RPC outages and rejects expired saved data", async () => {
  const cfg = config(env);
  const key = `/api/treasury:${cfg.chainId}:${JSON.stringify(cfg.contracts)}`;
  await cachedRead(env, key, "RPC", async () => ({
    data: {
      accounts: [{ role: "treasury", assets: [] }],
      asOfBlock: "50000000",
    },
    block: "50000000",
  }));
  await fixture.db
    .prepare("UPDATE public_read_cache SET checked_at=?")
    .bind(Date.now() - 61_000)
    .run();
  const saved = (await (await get("treasury")).json()) as any;
  expect(saved.accounts).toHaveLength(1);
  expect(saved.read).toMatchObject({ source: "RPC", status: "stale" });
  expect(calls).toHaveLength(0);
  await fixture.db
    .prepare("UPDATE public_read_cache SET checked_at=?,retry_after=0")
    .bind(Date.now() - 8 * 86_400_000)
    .run();
  expect((await get("treasury")).ok).toBe(false);
});

it("enforces the persistent monthly Graph request budget before dispatch", async () => {
  await reserveGraphRead(env);
  await fixture.db
    .prepare("UPDATE public_read_budget SET requests=89999")
    .run();
  const results = await Promise.allSettled([
    reserveGraphRead(env),
    reserveGraphRead(env),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await get("delegates")).ok).toBe(false);
  expect(calls).toHaveLength(0);
});

it("marks an old indexed head as stale without pretending it is live", async () => {
  data._meta.block.timestamp -= 600;
  expect((await (await get("health")).json()) as any).toMatchObject({
    status: "degraded",
    signingAllowed: false,
    read: { status: "stale" },
  });
});

it("pins additional account pages to the same hash and does not silently truncate", async () => {
  data.manaAccounts = Array.from({ length: 500 }, (_, i) => ({
    id: `0x${(i + 1).toString(16).padStart(40, "0")}`,
    balance: i ? "0" : "10",
    votingPower: i ? "0" : "10",
    delegate: account,
  }));
  const fetcher = vi.mocked(fetch);
  const existing = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async (input, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.query.includes("id_gt:$after")) {
      calls.push(String(input));
      expect(body.variables).toEqual({
        hash,
        after: data.manaAccounts.at(-1)!.id,
      });
      expect(body.query).toContain("block:{hash:$hash}");
      return Response.json({
        data: {
          manaAccounts: [
            {
              id: `0x${"1f5".padStart(40, "0")}`,
              balance: "0",
              votingPower: "0",
              delegate: account,
            },
          ],
        },
      });
    }
    return existing(input, init);
  });
  const response = await get("delegates");
  expect(response.ok).toBe(true);
  expect(((await response.json()) as any).items).toHaveLength(1);
  expect(calls).toHaveLength(3);
  const row = await fixture.db
    .prepare("SELECT payload FROM public_read_cache")
    .first<{ payload: string }>();
  expect(JSON.parse(row!.payload).data.accounts).toHaveLength(501);
});
