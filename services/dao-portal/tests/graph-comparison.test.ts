import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { database } from "./db-fixture";
import {
  GOVERNOR,
  MANA,
  PILOT_DEPLOYMENT,
  GATEWAY_URL,
  validatePilotSnapshot,
  pilotAnchor,
  verifyPilotEntities,
  graphQuery,
  type PilotSnapshot,
} from "../shared/graph-pilot.mjs";
import {
  compareGraph,
  graphComparisonGate,
  graphComparisonStatus,
  proposalDigest,
  runGraphComparison,
} from "../worker/graph-comparison";
import worker from "../worker/index";
const rpc = vi.hoisted(() => ({
  head: 50000000n,
  hash: `0x${"a".repeat(64)}`,
  getBlock: vi.fn(),
  readContract: vi.fn(),
}));
vi.mock("../worker/rpc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../worker/rpc")>()),
  clients: () => [
    { getBlock: rpc.getBlock, readContract: rpc.readContract },
    { getBlock: rpc.getBlock, readContract: rpc.readContract },
  ],
  commonHead: async () => ({ head: rpc.head + 64n, confirmed: rpc.head }),
}));
const member = "0xc4ccc6a11329558582c2da79c18a9aeac00f59f9";
const zero = `0x${"0".repeat(40)}` as const;
function fixture(): PilotSnapshot {
  const p = {
    id: "p",
    proposalId: "1",
    governor: GOVERNOR,
    proposer: GOVERNOR,
    description: "0xABC exact description\nSecond line",
    targets: [MANA],
    values: ["0"],
    signatures: [""],
    calldatas: ["0x1234" as const],
    voteStart: "49000000",
    voteEnd: "49900000",
    againstVotes: "0",
    forVotes: "9",
    abstainVotes: "0",
    executed: true,
    canceled: false,
  };
  p.proposalId = proposalDigest(p);
  return {
    _meta: {
      deployment: PILOT_DEPLOYMENT,
      hasIndexingErrors: false,
      block: { number: 50000000, hash: rpc.hash as `0x${string}` },
    },
    pilotStats: {
      chainId: 137,
      governor: GOVERNOR,
      mana: MANA,
      governorStartBlock: "48674443",
      manaStartBlock: "45785116",
      totalSupply: "10",
      holders: "2",
      proposals: "1",
      votes: "1",
      transfers: "3",
      delegationChanges: "0",
    },
    manaAccounts: [
      { id: GOVERNOR, balance: "9", votingPower: "0", delegate: zero },
      { id: member, balance: "1", votingPower: "0", delegate: zero },
    ],
    proposals: [p],
  };
}
let setup: Awaited<ReturnType<typeof database>>;
let env: Env & { GRAPH_API_KEY: string };
let snapshot: PilotSnapshot;
let requests: { url: string; init: RequestInit }[];
beforeAll(async () => {
  setup = await database();
});
afterAll(async () => {
  await setup.mf.dispose();
});
beforeEach(async () => {
  vi.clearAllMocks();
  await setup.db.prepare("DELETE FROM graph_comparison").run();
  await setup.db.prepare("DELETE FROM events").run();
  await setup.db.prepare("DELETE FROM cursors").run();
  env = {
    ...setup.bindings,
    ENVIRONMENT: "local",
    DEPLOYMENT_MANIFEST: "",
    GRAPH_COMPARE_MODE: "shadow",
    GRAPH_SUBGRAPH_RESTRICTED: "true",
    GRAPH_API_KEY: "test-only-query-credential",
  };
  rpc.hash = `0x${"a".repeat(64)}`;
  snapshot = fixture();
  requests = [];
  rpc.getBlock.mockImplementation(async () => ({ hash: rpc.hash }));
  rpc.readContract.mockImplementation(
    async ({
      functionName,
      args,
    }: {
      functionName: string;
      args: unknown[];
    }) => {
      if (functionName === "totalSupply") return 10n;
      if (functionName === "balanceOf") return args[0] === GOVERNOR ? 9n : 1n;
      if (functionName === "getVotes") return 0n;
      if (functionName === "delegates") return zero;
      if (functionName === "state") return 7;
      if (functionName === "proposalSnapshot") return 49000000n;
      if (functionName === "proposalDeadline") return 49900000n;
      if (functionName === "proposalVotes") return [0n, 9n, 0n];
      throw Error("unexpected method");
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      const { query, variables } = JSON.parse(init.body as string);
      if (variables.hash) expect(variables.hash).toBe(rpc.hash);
      return Response.json({
        data: query.includes("pilotStats")
          ? snapshot
          : { _meta: snapshot._meta },
      });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("keeps Graph off by default and requires both scope attestation and a private key", async () => {
  const compare = vi.fn();
  for (const overrides of [
    { GRAPH_COMPARE_MODE: "off" },
    { GRAPH_SUBGRAPH_RESTRICTED: "false" },
    { GRAPH_API_KEY: "" },
  ]) {
    const disabled = { ...env, ...overrides };
    expect(graphComparisonGate(disabled)).not.toBeNull();
    await runGraphComparison(disabled, compare);
    const response = await worker.fetch(
      new Request("https://portal/api/graph-status"),
      disabled,
    );
    expect(await response.json()).toMatchObject({
      status: "disabled",
      activeBackend: "D1/RPC",
      fullHistoryVerified: false,
    });
  }
  expect(compare).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(
    await setup.db.prepare("SELECT * FROM graph_comparison").all(),
  ).toMatchObject({ results: [] });
  const cfg = await (
    await worker.fetch(new Request("https://portal/api/config"), env)
  ).json();
  expect(JSON.stringify(cfg)).not.toContain(env.GRAPH_API_KEY);
  expect(cfg).toMatchObject({
    capabilities: { governance: "existing-governor", ragequit: false },
  });
});
it("compares anchored entities and D1 without editing history or querying from status requests", async () => {
  const p = snapshot.proposals[0];
  await setup.db
    .prepare(
      "INSERT INTO events VALUES(137,?,49000000,?,?,0,'ProposalCreated',?)",
    )
    .bind(
      GOVERNOR,
      rpc.hash,
      `0x${"b".repeat(64)}`,
      JSON.stringify({
        ...p,
        proposer: p.proposer.toUpperCase().replace("0X", "0x"),
        targets: p.targets.map((x) => x.toUpperCase().replace("0X", "0x")),
      }),
    )
    .run();
  const before = await setup.db.prepare("SELECT * FROM events").all();
  await runGraphComparison(env);
  const result = await graphComparisonStatus(env);
  expect(result).toMatchObject({
    mode: "shadow",
    activeBackend: "D1/RPC",
    comparison: {
      status: "compared",
      verified: { accounts: 2, proposals: 1, fullHistoryVerified: false },
      d1: { matchedProposals: 1, historyComplete: false },
    },
  });
  expect(requests).toHaveLength(3);
  for (const r of requests) {
    expect(r.url).toBe(GATEWAY_URL);
    expect(r.init.headers).toMatchObject({
      Authorization: `Bearer ${env.GRAPH_API_KEY}`,
      Origin: "https://dao-preview.mythicalbeings.io",
    });
    expect(r.init.redirect).toBe("error");
  }
  expect(
    (await setup.db.prepare("SELECT * FROM events").all()).results,
  ).toEqual(before.results);
  expect(await setup.db.prepare("SELECT * FROM cursors").all()).toMatchObject({
    results: [],
  });
});
it("rejects altered proposal bytes and missing indexed D1 proposals", async () => {
  snapshot.proposals[0].description += " changed";
  await expect(compareGraph(env)).rejects.toThrow(
    "GRAPH_PROPOSAL_RPC_MISMATCH",
  );
  snapshot = fixture();
  await setup.db
    .prepare(
      "INSERT INTO events VALUES(137,?,49000000,?,?,0,'ProposalCreated',?)",
    )
    .bind(
      GOVERNOR,
      rpc.hash,
      `0x${"b".repeat(64)}`,
      JSON.stringify({ proposalId: "404" }),
    )
    .run();
  await expect(compareGraph(env)).rejects.toThrow("GRAPH_D1_PROPOSAL_MISSING");
});
it("fails on a reorg during comparison and accepts a fresh canonical comparison", async () => {
  rpc.getBlock
    .mockImplementationOnce(async () => ({ hash: rpc.hash }))
    .mockImplementationOnce(async () => ({ hash: rpc.hash }))
    .mockImplementation(async () => ({ hash: `0x${"c".repeat(64)}` }));
  await expect(compareGraph(env)).rejects.toThrow("GRAPH_ANCHOR_CHANGED");
  rpc.hash = `0x${"c".repeat(64)}`;
  snapshot = fixture();
  rpc.getBlock.mockImplementation(async () => ({ hash: rpc.hash }));
  expect(await compareGraph(env)).toMatchObject({
    status: "compared",
    hash: rpc.hash,
    fullHistoryVerified: false,
  });
});
it("rejects final Graph metadata changing after successful RPC reads", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const { query } = JSON.parse(init.body);
      return Response.json({
        data: query.includes("pilotStats")
          ? snapshot
          : {
              _meta: {
                ...snapshot._meta,
                ...(query.includes("$hash") ? { deployment: "wrong" } : {}),
              },
            },
      });
    }),
  );
  await expect(compareGraph(env)).rejects.toThrow("DEPLOYMENT_MISMATCH");
});
it("replaces previous success with sanitized failures and marks old reports stale", async () => {
  await runGraphComparison(env);
  await setup.db.prepare("UPDATE graph_comparison SET next_attempt=0").run();
  await runGraphComparison(env, async () => {
    throw Error(`provider URL ${env.GRAPH_API_KEY}`);
  });
  const result = await graphComparisonStatus(env);
  expect(result).toMatchObject({
    comparison: { status: "failed", reason: "GRAPH_COMPARISON_FAILED" },
  });
  expect(JSON.stringify(result)).not.toContain(env.GRAPH_API_KEY);
  await setup.db
    .prepare("UPDATE graph_comparison SET checked_at=?")
    .bind(Date.now() - 7200001)
    .run();
  expect(await graphComparisonStatus(env)).toMatchObject({ status: "stale" });
});
it("reserves quota once for concurrent attempts and enforces hourly/monthly limits", async () => {
  const compare = vi.fn(compareGraph);
  await Promise.all([
    runGraphComparison(env, compare),
    runGraphComparison(env, compare),
  ]);
  await runGraphComparison(env, compare);
  expect(compare).toHaveBeenCalledTimes(1);
  expect(
    await setup.db
      .prepare("SELECT reserved_queries FROM graph_comparison")
      .first(),
  ).toEqual({ reserved_queries: 3 });
  await setup.db
    .prepare("UPDATE graph_comparison SET next_attempt=0,reserved_queries=3000")
    .run();
  await runGraphComparison(env, compare);
  expect(compare).toHaveBeenCalledTimes(1);
  await setup.db.prepare("UPDATE graph_comparison SET month='2000-01'").run();
  await runGraphComparison(env, compare);
  expect(compare).toHaveBeenCalledTimes(2);
  expect(
    await setup.db
      .prepare("SELECT reserved_queries FROM graph_comparison")
      .first(),
  ).toEqual({ reserved_queries: 3 });
});
it("fences a late completion whose lease was replaced", async () => {
  await runGraphComparison(env, async (e) => {
    await e.DAO_DB.prepare(
      "UPDATE graph_comparison SET owner='replacement',report_json='{}'",
    ).run();
    return compareGraph(e);
  });
  expect(
    await setup.db.prepare("SELECT report_json FROM graph_comparison").first(),
  ).toEqual({ report_json: "{}" });
});
describe("snapshot validation", () => {
  it("rejects stale heads, wrong CID, incomplete pages, duplicate accounts and incorrect totals", () => {
    expect(pilotAnchor(snapshot._meta, 50000001)).toBe(50000000);
    expect(() => pilotAnchor(snapshot._meta, 50000300)).toThrow("STALE");
    for (const mutate of [
      (x: PilotSnapshot) => {
        x._meta.deployment = "wrong";
      },
      (x: PilotSnapshot) => {
        x._meta.hasIndexingErrors = true;
      },
      (x: PilotSnapshot) => {
        x.manaAccounts = Array(201).fill(x.manaAccounts[0]);
      },
      (x: PilotSnapshot) => {
        x.manaAccounts[1] = x.manaAccounts[0];
      },
      (x: PilotSnapshot) => {
        x.pilotStats.totalSupply = "11";
      },
      (x: PilotSnapshot) => {
        x.pilotStats.holders = "1";
      },
      (x: PilotSnapshot) => {
        x.proposals = Array(51).fill(x.proposals[0]);
      },
      (x: PilotSnapshot) => {
        x.proposals[0].signatures = ["transfer()"];
      },
      (x: PilotSnapshot) => {
        x.proposals = [];
      },
    ]) {
      const changed = fixture();
      mutate(changed);
      expect(() =>
        validatePilotSnapshot(changed, 50000000, rpc.hash),
      ).toThrow();
    }
    expect(validatePilotSnapshot(snapshot, 50000000, rpc.hash)).toBe(snapshot);
  });
  it("checks every supplied account, including zero-balance delegates", async () => {
    const read = vi.fn(async (id) => ({
      balance: id === GOVERNOR ? "9" : "2",
      votingPower: "0",
      delegate: zero,
    }));
    await expect(verifyPilotEntities(snapshot, read, vi.fn())).rejects.toThrow(
      "ACCOUNT_RPC_MISMATCH",
    );
    expect(read).toHaveBeenCalledTimes(2);
  });
});
it("bounds slow Graph requests and body reads without leaking upstream details", async () => {
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  const deadline = vi
    .spyOn(AbortSignal, "timeout")
    .mockImplementation(() => nativeTimeout(20));
  try {
    await expect(
      graphQuery(
        GATEWAY_URL,
        "{}",
        {},
        async (_u, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => reject(Error("private upstream URL")),
              { once: true },
            );
          }),
        { apiKey: env.GRAPH_API_KEY },
      ),
    ).rejects.toThrow("GRAPH_REQUEST_FAILED");
    await expect(
      graphQuery(
        GATEWAY_URL,
        "{}",
        {},
        async (_u, options) =>
          new Response(
            new ReadableStream({
              start(controller) {
                options?.signal?.addEventListener(
                  "abort",
                  () => controller.error(Error("private upstream URL")),
                  { once: true },
                );
              },
            }),
          ),
        { apiKey: env.GRAPH_API_KEY },
      ),
    ).rejects.toThrow("GRAPH_BODY_READ_FAILED");
    expect(deadline).toHaveBeenCalledWith(30000);
  } finally {
    deadline.mockRestore();
  }
});
