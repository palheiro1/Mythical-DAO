import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  expect,
  it,
  vi,
} from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  type PublicClient,
} from "viem";
import { database } from "./db-fixture";
import {
  GOVERNOR,
  MANA,
  PILOT_DEPLOYMENT,
  type PilotSnapshot,
} from "../shared/graph-pilot.mjs";
import { governorAbi } from "../shared/abis";
import { graphHistory } from "../worker/graph-history";
import {
  mergeHistoryRows,
  verifyGraphHistory,
} from "../worker/graph-history-model";
import { proposalDigest, runGraphComparison } from "../worker/graph-comparison";
import { config } from "../worker/config";
import worker from "../worker/index";
const indexChain = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../worker/indexer", () => ({ indexChain }));
const rpc = vi.hoisted(() => ({
  head: 50000000n,
  hash: `0x${"a".repeat(64)}` as `0x${string}`,
  getBlock: vi.fn(),
  readContract: vi.fn(),
  getLogs: vi.fn(),
}));
vi.mock("../worker/rpc", async (original) => ({
  ...(await original<typeof import("../worker/rpc")>()),
  clients: () => [rpc, rpc],
  commonHead: async () => ({ head: rpc.head + 64n, confirmed: rpc.head }),
}));
const member = "0xc4ccc6a11329558582c2da79c18a9aeac00f59f9";
const tx = `0x${"b".repeat(64)}` as const;
const zero = `0x${"0".repeat(40)}` as const;
let setup: Awaited<ReturnType<typeof database>>;
let env: Env & { GRAPH_API_KEY: string };
let snapshot: PilotSnapshot;
const pair = [rpc, rpc] as unknown as [PublicClient, PublicClient];
const claims = () => [
  {
    contract: GOVERNOR,
    name: "ProposalCreated",
    blockNumber: "49000000",
    blockHash: rpc.hash,
    transactionHash: tx,
    logIndex: "0",
  },
];
function fixture(): PilotSnapshot {
  const p: PilotSnapshot["proposals"][number] = {
    id: "p",
    proposalId: "1",
    governor: GOVERNOR,
    proposer: member,
    description: "Exact 0xABC description",
    targets: [MANA],
    values: ["0"],
    signatures: [""],
    calldatas: ["0x1234" as const],
    voteStart: "49900000",
    voteEnd: "51000000",
    againstVotes: "0",
    forVotes: "0",
    abstainVotes: "0",
    executed: false,
    canceled: false,
  };
  p.proposalId = proposalDigest(p);
  return {
    _meta: {
      deployment: PILOT_DEPLOYMENT,
      hasIndexingErrors: false,
      block: { number: 50000000, hash: rpc.hash },
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
      votes: "0",
      transfers: "3",
      delegationChanges: "1",
    },
    manaAccounts: [
      { id: GOVERNOR, balance: "9", votingPower: "0", delegate: zero },
      { id: member, balance: "1", votingPower: "1", delegate: member },
    ],
    proposals: [p],
  };
}
function log() {
  const p = fixture().proposals[0];
  return {
    address: GOVERNOR,
    removed: false,
    blockNumber: 49000000n,
    blockHash: rpc.hash,
    transactionHash: tx,
    transactionIndex: 0,
    logIndex: 0,
    topics: encodeEventTopics({
      abi: governorAbi,
      eventName: "ProposalCreated",
    }),
    data: encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "address[]" },
        { type: "uint256[]" },
        { type: "string[]" },
        { type: "bytes[]" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "string" },
      ],
      [
        BigInt(p.proposalId),
        p.proposer,
        p.targets,
        [0n],
        p.signatures,
        p.calldatas,
        BigInt(p.voteStart),
        BigInt(p.voteEnd),
        p.description,
      ],
    ),
  };
}
beforeAll(async () => {
  setup = await database();
});
afterAll(async () => {
  await setup.mf.dispose();
});
beforeEach(async () => {
  vi.clearAllMocks();
  for (const table of ["graph_comparison", "events", "cursors"])
    await setup.db.prepare(`DELETE FROM ${table}`).run();
  rpc.hash = `0x${"a".repeat(64)}`;
  snapshot = fixture();
  env = {
    ...setup.bindings,
    ENVIRONMENT: "local",
    DEPLOYMENT_MANIFEST: "",
    GRAPH_COMPARE_MODE: "shadow",
    GRAPH_SUBGRAPH_RESTRICTED: "true",
    GRAPH_READ_MODE: "verified",
    GRAPH_REORG_VERIFIED: "true",
    GRAPH_API_KEY: "test-only-query-credential",
  };
  rpc.getBlock.mockImplementation(async () => ({ hash: rpc.hash }));
  rpc.getLogs.mockImplementation(async () => [log()]);
  rpc.readContract.mockImplementation(async ({ functionName, args }) => {
    const p = snapshot.proposals[0];
    return (
      {
        totalSupply: 10n,
        balanceOf: args?.[0] === GOVERNOR ? 9n : 1n,
        getVotes: args?.[0] === GOVERNOR ? 0n : 1n,
        delegates: args?.[0] === GOVERNOR ? zero : member,
        allowance: 0n,
        state: 1,
        proposalSnapshot: BigInt(p.voteStart),
        proposalDeadline: BigInt(p.voteEnd),
        proposalVotes: [0n, 0n, 0n],
        quorum: 1n,
      } as Record<string, unknown>
    )[functionName];
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const { query } = JSON.parse(init.body);
      return Response.json({
        data: query.includes("pilotStats")
          ? snapshot
          : query.includes("eventRecords")
            ? { eventRecords: claims() }
            : { _meta: snapshot._meta },
      });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const read = () => graphHistory(env, config(env), pair, rpc.head);
const get = async (path: string) => {
  const r = await worker.fetch(new Request(`https://portal/api/${path}`), env);
  expect(r.status).toBe(200);
  return r.json() as Promise<Record<string, any>>;
};
it("serves verified data under the server-only exception and still rejects reorgs or withdrawn permission", async () => {
  env.GRAPH_SUBGRAPH_RESTRICTED = "false";
  env.GRAPH_ALLOW_UNRESTRICTED_SERVER_KEY = "true";
  await runGraphComparison(env);
  expect((await read()).status.status).toBe("ready");
  vi.mocked(fetch).mockClear();
  expect((await get("proposals?kind=executable")).items).toHaveLength(1);
  expect(fetch).not.toHaveBeenCalled();
  rpc.hash = `0x${"c".repeat(64)}`;
  expect((await read()).status).toMatchObject({
    status: "fallback",
    reason: "GRAPH_ANCHOR_CHANGED",
  });
  env.GRAPH_ALLOW_UNRESTRICTED_SERVER_KEY = "false";
  expect((await read()).status.status).toBe("disabled");
  expect(await get(`members/${member}`)).toMatchObject({
    balance: "1",
    votes: "1",
    delegate: member,
  });
});
it("verifies logs before publishing a fenced cache, with no index or cursor changes", async () => {
  await runGraphComparison(env);
  expect((await read()).status).toMatchObject({
    status: "ready",
    complete: false,
    asOfBlock: "50000000",
  });
  expect((await read()).data?.events[0]).toMatchObject({
    tx_hash: tx,
    event_name: "ProposalCreated",
  });
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(
    await setup.db
      .prepare("SELECT reserved_queries FROM graph_comparison")
      .first(),
  ).toEqual({ reserved_queries: 4 });
  for (const table of ["events", "cursors"])
    expect(
      (await setup.db.prepare(`SELECT * FROM ${table}`).all()).results,
    ).toEqual([]);
});
it("serves verified history on existing routes, live states/counts/power, and preserves direct links", async () => {
  await runGraphComparison(env);
  vi.mocked(fetch).mockClear();
  const proposals = await get("proposals?kind=executable");
  expect(proposals.items).toHaveLength(1);
  expect(proposals.items[0]).toMatchObject({
    id: snapshot.proposals[0].proposalId,
    description: snapshot.proposals[0].description,
    state: "Active",
  });
  expect(
    await get(`proposals/${GOVERNOR}/${snapshot.proposals[0].proposalId}`),
  ).toMatchObject({ state: "Active", transactionHash: tx });
  expect(await get("overview")).toMatchObject({
    activeVotes: 1,
    readyForExecution: 0,
    indexedProposals: 1,
    complete: false,
    countsVerified: true,
  });
  expect(await get("delegates")).toMatchObject({
    items: [{ address: member, votes: "1" }],
  });
  expect(await get("events")).toMatchObject({
    items: [{ event_name: "ProposalCreated", tx_hash: tx }],
  });
  expect(await get("ballots")).toMatchObject({ items: [] });
  expect(fetch).not.toHaveBeenCalled();
  expect(JSON.stringify(proposals)).not.toContain(env.GRAPH_API_KEY);
});
it("deduplicates D1/Graph rows and respects historical pagination", async () => {
  await runGraphComparison(env);
  const h = (await read()).data!;
  const e = h.events[0];
  await setup.db
    .prepare("INSERT INTO events VALUES(?,?,?,?,?,?,?,?)")
    .bind(
      e.chain_id,
      e.contract,
      e.block_number,
      e.block_hash,
      e.tx_hash,
      e.log_index,
      e.event_name,
      e.args_json,
    )
    .run();
  expect((await get("proposals")).items).toHaveLength(1);
  expect((await get("events")).items).toHaveLength(1);
  expect(
    (await get(`events?before=49000000.0.${GOVERNOR}`)).items,
  ).toHaveLength(0);
  expect(
    mergeHistoryRows(
      [e],
      [
        e,
        {
          ...e,
          tx_hash: `0x${"c".repeat(64)}`,
          block_number: e.block_number + 1,
        },
      ],
      1,
    )[0].block_number,
  ).toBe(e.block_number + 1);
});
it("fails back on missing scope, missing acceptance, stale/failed reports, future and reorg anchors", async () => {
  await runGraphComparison(env);
  for (const change of [
    { GRAPH_READ_MODE: "off" },
    { GRAPH_REORG_VERIFIED: "false" },
    { GRAPH_SUBGRAPH_RESTRICTED: "false" },
  ])
    expect(
      (await graphHistory({ ...env, ...change }, config(env), pair, rpc.head))
        .status.status,
    ).toBe("disabled");
  expect(
    (await graphHistory(env, config(env), pair, rpc.head - 1n)).data,
  ).toBeUndefined();
  rpc.getBlock.mockResolvedValue({ hash: `0x${"f".repeat(64)}` });
  expect((await read()).status).toMatchObject({
    status: "fallback",
    reason: "GRAPH_ANCHOR_CHANGED",
  });
  rpc.getBlock.mockResolvedValue({ hash: rpc.hash });
  await setup.db
    .prepare("UPDATE graph_comparison SET checked_at=?")
    .bind(Date.now() - 7200001)
    .run();
  expect((await read()).status.status).toBe("stale");
  await setup.db.prepare("UPDATE graph_comparison SET next_attempt=0").run();
  await runGraphComparison(env, async () => {
    throw Error("secret transport details");
  });
  expect((await read()).status.status).toBe("fallback");
  expect(
    await setup.db.prepare("SELECT history_json FROM graph_comparison").first(),
  ).toEqual({ history_json: null });
  expect(await get("members/" + member)).toMatchObject({
    balance: "1",
    votes: "1",
    delegate: member,
  });
});
it("rejects altered metadata, missing/duplicate logs, false proposer and incomplete event counters", async () => {
  for (const input of [
    [...claims(), ...claims()],
    [{ ...claims()[0], blockHash: `0x${"e".repeat(64)}` }],
    [{ ...claims()[0], logIndex: "2" }],
  ])
    await expect(
      verifyGraphHistory(snapshot, input, pair, () => {}),
    ).rejects.toThrow();
  rpc.getLogs.mockResolvedValue([]);
  await expect(
    verifyGraphHistory(snapshot, claims(), pair, () => {}),
  ).rejects.toThrow("LOG_MISMATCH");
  rpc.getLogs.mockImplementation(async () => [log()]);
  snapshot.proposals[0].proposer = GOVERNOR;
  await expect(
    verifyGraphHistory(snapshot, claims(), pair, () => {}),
  ).rejects.toThrow("PROPOSAL_MISMATCH");
  snapshot = fixture();
  snapshot.pilotStats.votes = "1";
  await expect(
    verifyGraphHistory(snapshot, claims(), pair, () => {}),
  ).rejects.toThrow("VOTE_COUNT");
  snapshot = fixture();
  snapshot.proposals[0].executed = true;
  await expect(
    verifyGraphHistory(snapshot, claims(), pair, () => {}),
  ).rejects.toThrow("STATE_MISMATCH");
});
it("clears history atomically on failure and reserves four calls at the quota boundary", async () => {
  await runGraphComparison(env);
  await setup.db
    .prepare("UPDATE graph_comparison SET next_attempt=0,reserved_queries=2997")
    .run();
  const compare = vi.fn();
  expect(await runGraphComparison(env, compare)).toBe(false);
  expect(compare).not.toHaveBeenCalled();
  await setup.db
    .prepare("UPDATE graph_comparison SET reserved_queries=2996")
    .run();
  rpc.getLogs.mockResolvedValue([]);
  await runGraphComparison(env);
  expect(
    await setup.db
      .prepare("SELECT reserved_queries,history_json FROM graph_comparison")
      .first(),
  ).toEqual({ reserved_queries: 3000, history_json: null });
});
it("continues the independent indexer when the supplemental scheduler fails", async () => {
  let pending: Promise<unknown> | undefined;
  const broken = {
    ...env,
    DAO_DB: {
      prepare() {
        throw Error("comparison storage unavailable");
      },
    },
  } as unknown as Env;
  worker.scheduled({} as ScheduledController, broken, {
    waitUntil(p: Promise<unknown>) {
      pending = p;
    },
  } as ExecutionContext);
  await pending;
  expect(indexChain).toHaveBeenCalledWith(broken);
});
