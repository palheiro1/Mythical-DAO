import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  createPublicClient,
  http,
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
  type PublicClient,
} from "viem";
import { database } from "./db-fixture";
const fixture = vi.hoisted(() => ({
  offline: false,
  hashes: new Map<number, string>(),
  value: 100n,
  failLogs: false,
  approvalMode: false,
  quotaAfterLogs: false,
  quotaNextHash: false,
  maxLogSpan: Infinity,
  timeoutAddress: "",
  afterLogs: undefined as (() => Promise<void>) | undefined,
  queries: [] as {
    address: string;
    event?: { name: string };
    args?: unknown;
    fromBlock: bigint;
    toBlock: bigint;
  }[],
}));
vi.mock("../worker/rpc", async (importOriginal) => {
  const original = await importOriginal<typeof import("../worker/rpc")>();
  const hash = (n: number) =>
    fixture.hashes.get(n) ?? "0x" + n.toString(16).padStart(64, "0");
  const client = Object.assign(
    createPublicClient({ transport: http("http://127.0.0.1:1") }),
    {
      getChainId: async () => 137,
      getBlockNumber: async () => 100n,
      getBlock: async ({ blockNumber }: { blockNumber: bigint }) => {
        if (fixture.offline) throw Error("offline");
        if (fixture.quotaNextHash)
          throw new original.RpcFault("INFURA_DAILY_BUDGET_EXHAUSTED");
        return { hash: hash(Number(blockNumber)) };
      },
      getLogs: async ({
        fromBlock,
        toBlock,
        address,
        event,
        args,
      }: {
        fromBlock: bigint;
        toBlock: bigint;
        address: string;
        event?: { name: string };
        args?: unknown;
      }) => {
        fixture.queries.push({ address, event, args, fromBlock, toBlock });
        if (Number(toBlock - fromBlock + 1n) > fixture.maxLogSpan)
          throw new original.RpcFault("INFURA_LOG_RANGE_LIMIT");
        if (address === fixture.timeoutAddress)
          throw new original.RpcFault("RPC_SECONDARY_TIMEOUT");
        await fixture.afterLogs?.();
        if (fixture.failLogs) throw Error("interrupted");
        if (fixture.quotaAfterLogs) fixture.quotaNextHash = true;
        if (fixture.approvalMode) {
          if (event?.name !== "Approval" || fromBlock > 12n || toBlock < 12n)
            return [];
          return [
            {
              address,
              blockNumber: 12n,
              blockHash: hash(12),
              transactionHash: "0x" + "c".repeat(64),
              logIndex: 1,
              data: encodeAbiParameters([{ type: "uint256" }], [fixture.value]),
              topics: encodeEventTopics({
                abi: [
                  parseAbiItem(
                    "event Approval(address indexed owner,address indexed spender,uint256 value)",
                  ),
                ],
                eventName: "Approval",
                args: {
                  owner: "0x0000000000000000000000000000000000000002",
                  spender: "0x0000000000000000000000000000000000000008",
                },
              }),
            },
          ];
        }
        if (fromBlock > 12n || toBlock < 12n) return [];
        return [
          {
            address: "0x0000000000000000000000000000000000000001",
            blockNumber: 12n,
            blockHash: hash(12),
            transactionHash: "0x" + "a".repeat(64),
            logIndex: 0,
            data: encodeAbiParameters([{ type: "uint256" }], [fixture.value]),
            topics: encodeEventTopics({
              abi: [
                parseAbiItem(
                  "event Transfer(address indexed from,address indexed to,uint256 value)",
                ),
              ],
              eventName: "Transfer",
              args: {
                from: "0x0000000000000000000000000000000000000002",
                to: "0x0000000000000000000000000000000000000003",
              },
            }),
          },
        ];
      },
    },
  );
  return { ...original, clients: () => [client, client] };
});
import { indexChain } from "../worker/indexer";
import { indexHealth } from "../worker/data";
import { clients } from "../worker/rpc";
import { config } from "../worker/config";
let fixtureDb: Awaited<ReturnType<typeof database>>, env: Env;
beforeEach(async () => {
  fixtureDb = await database();
  fixture.approvalMode = false;
  fixture.quotaAfterLogs = false;
  fixture.quotaNextHash = false;
  fixture.maxLogSpan = Infinity;
  fixture.timeoutAddress = "";
  fixture.afterLogs = undefined;
  fixture.queries = [];
  fixture.offline = false;
  fixture.failLogs = false;
  fixture.hashes.clear();
  fixture.value = 100n;
  env = {
    ...fixtureDb.bindings,
    ENVIRONMENT: "local",
    INDEX_BATCH_BLOCKS: "11",
    DEPLOYMENT_MANIFEST: JSON.stringify({
      schemaVersion: 2,
      architecture: "existing-governor",
      snapshotUrl: "https://snapshot.box/#/s:mythicalbeings.eth",
      chainId: 137,
      enabled: false,
      confirmations: 64,
      contracts: {
        governor: {
          address: "0x0000000000000000000000000000000000000001",
          startBlock: "10",
        },
        treasury: {
          address: "0x0000000000000000000000000000000000000001",
          startBlock: "10",
        },
        usdcNative: {
          address: "0x0000000000000000000000000000000000000004",
          startBlock: "1000",
        },
        usdcBridged: {
          address: "0x0000000000000000000000000000000000000005",
          startBlock: "1000",
        },
        mana: {
          address: "0x0000000000000000000000000000000000000001",
          startBlock: "10",
        },
      },
    }),
  } as Env;
});
afterEach(async () => {
  await fixtureDb.mf.dispose();
});
it("does not commit a partial batch if the Infura quota ends after the log query", async () => {
  fixture.quotaAfterLogs = true;
  expect(await indexChain(env)).toHaveProperty(
    "error",
    "INFURA_DAILY_BUDGET_EXHAUSTED",
  );
  for (const table of ["events", "cursors", "checkpoints", "index_lock"])
    expect(
      await fixtureDb.db.prepare(`SELECT * FROM ${table}`).first(),
    ).toBeNull();
  fixture.quotaAfterLogs = false;
  fixture.quotaNextHash = false;
  await indexChain(env);
  expect(
    (
      await fixtureDb.db
        .prepare("SELECT COUNT(*) AS n FROM events")
        .first<{ n: number }>()
    )?.n,
  ).toBe(1);
  expect(
    (
      await fixtureDb.db
        .prepare("SELECT block_number FROM cursors")
        .first<{ block_number: number }>()
    )?.block_number,
  ).toBe(20);
});
it("resumes after interruption without skipping events or duplicating them", async () => {
  fixture.failLogs = true;
  expect(await indexChain(env)).toHaveProperty("error");
  expect(
    await fixtureDb.db.prepare("SELECT * FROM cursors").first(),
  ).toBeNull();
  fixture.failLogs = false;
  await indexChain(env);
  await indexChain(env);
  expect(
    (
      await fixtureDb.db
        .prepare("SELECT COUNT(*) AS n FROM events")
        .first<{ n: number }>()
    )?.n,
  ).toBe(1);
  expect(
    (
      await fixtureDb.db
        .prepare("SELECT block_number FROM cursors")
        .first<{ block_number: number }>()
    )?.block_number,
  ).toBe(31);
});
it("replays orphaned history from a common ancestor or source start", async () => {
  await indexChain(env);
  fixture.hashes.set(20, "0x" + "f".repeat(64));
  fixture.value = 250n;
  await indexChain(env);
  const row = await fixtureDb.db
    .prepare("SELECT args_json FROM events")
    .first<{ args_json: string }>();
  expect(JSON.parse(row!.args_json).value).toBe("250");
});
it("rejects overlapping index runs while a live lease exists", async () => {
  await fixtureDb.db
    .prepare("INSERT INTO index_lock VALUES(1,'other',unixepoch()+120)")
    .run();
  expect(await indexChain(env)).toEqual({ skipped: true });
});
it("health fails closed on RPC failure and after index anchors change", async () => {
  await indexChain(env);
  await indexChain(env);
  await indexChain(env);
  fixture.offline = true;
  expect(
    (await indexHealth(env, config(env), clients(env))).signingAllowed,
  ).toBe(false);
  fixture.offline = false;
  fixture.hashes.set(36, "0x" + "e".repeat(64));
  expect((await indexHealth(env, config(env), clients(env))).reason).toBe(
    "INDEX_REORG_DETECTED",
  );
});

it("backfills Approval with an independent cursor and preserves Transfer history during an approval reorg", async () => {
  const raw = JSON.parse(env.DEPLOYMENT_MANIFEST);
  const address = (n: number) => "0x" + String(n).padStart(40, "0");
  raw.contracts.governor = { address: address(2), startBlock: "10" };
  raw.contracts.treasury = raw.contracts.governor;
  raw.contracts.gem = { address: address(4), startBlock: "10" };
  raw.contracts.weth = { address: address(5), startBlock: "10" };
  raw.contracts.usdcNative = { address: address(6), startBlock: "10" };
  raw.contracts.usdcBridged = { address: address(7), startBlock: "10" };
  raw.contracts.ragequitModule = { address: address(8), startBlock: "10" };
  env.DEPLOYMENT_MANIFEST = JSON.stringify(raw);
  fixture.approvalMode = true;
  const hash = "0x" + (36).toString(16).padStart(64, "0");
  for (const n of [4, 5, 6])
    await fixtureDb.db
      .prepare("INSERT INTO cursors VALUES(?,?,?,?,?)")
      .bind(137, address(n), 36, hash, Date.now())
      .run();
  await fixtureDb.db
    .prepare("INSERT INTO events VALUES(?,?,?,?,?,?,?,?)")
    .bind(137, address(4), 12, "0x12", "0xhistorical", 0, "Transfer", "{}")
    .run();
  await indexChain(env);
  const approvals = await fixtureDb.db
    .prepare("SELECT * FROM events WHERE event_name='Approval'")
    .all();
  expect(approvals.results).toHaveLength(3);
  const queries = fixture.queries.filter((q) => q.event?.name === "Approval");
  expect(queries).toHaveLength(6);
  expect(
    queries.every(
      (q) =>
        JSON.stringify(q.args) ===
        JSON.stringify({ owner: address(2), spender: address(8) }),
    ),
  ).toBe(true);
  expect(
    (
      await fixtureDb.db
        .prepare("SELECT * FROM cursors WHERE contract LIKE '%:approval:%'")
        .all()
    ).results,
  ).toHaveLength(3);
  await fixtureDb.db
    .prepare("INSERT INTO events VALUES(?,?,?,?,?,?,?,?)")
    .bind(
      137,
      address(4),
      15,
      "0x15",
      "0xoldermodule",
      0,
      "Approval",
      JSON.stringify({ owner: address(2), spender: address(9), value: "55" }),
    )
    .run();
  fixture.hashes.set(20, "0x" + "f".repeat(64));
  fixture.value = 999n;
  await indexChain(env);
  expect(
    (
      await fixtureDb.db
        .prepare("SELECT * FROM events WHERE event_name='Transfer'")
        .all()
    ).results,
  ).toHaveLength(1);
  const replayed = await fixtureDb.db
    .prepare(
      "SELECT args_json FROM events WHERE event_name='Approval' AND tx_hash!='0xoldermodule'",
    )
    .all<{ args_json: string }>();
  expect(
    await fixtureDb.db
      .prepare("SELECT * FROM events WHERE tx_hash='0xoldermodule'")
      .first(),
  ).not.toBeNull();
  expect(
    replayed.results.every((r) => JSON.parse(r.args_json).value === "999"),
  ).toBe(true);
  expect(
    (
      await fixtureDb.db
        .prepare("SELECT * FROM cursors WHERE contract=?")
        .bind(address(2))
        .all()
    ).results,
  ).toHaveLength(1);
});

it("halves an explicit capacity-limited range, persists learning and resumes every pending block without duplicates", async () => {
  fixture.maxLogSpan = 5;
  await indexChain(env);
  expect(fixture.queries.map((q) => [q.fromBlock, q.toBlock])).toEqual([
    [10n, 20n],
    [10n, 20n],
    [10n, 14n],
    [10n, 14n],
  ]);
  expect(
    await fixtureDb.db.prepare("SELECT block_number FROM cursors").first(),
  ).toEqual({ block_number: 14 });
  expect(
    await fixtureDb.db.prepare("SELECT span FROM index_adaptive").first(),
  ).toEqual({ span: 5 });
  fixture.maxLogSpan = Infinity;
  fixture.queries = [];
  await indexChain(env);
  expect(fixture.queries[0].fromBlock).toBe(15n);
  expect(fixture.queries[0].toBlock).toBe(19n);
  await indexChain(env);
  expect(
    await fixtureDb.db.prepare("SELECT span FROM index_adaptive").first(),
  ).toEqual({ span: 10 });
  await indexChain(env);
  await indexChain(env);
  await indexChain(env);
  expect(
    await fixtureDb.db.prepare("SELECT block_number FROM cursors").first(),
  ).toEqual({ block_number: 36 });
  expect(
    await fixtureDb.db.prepare("SELECT COUNT(*) AS n FROM events").first(),
  ).toEqual({ n: 1 });
});

it("bounds retries, preserves a failed source cursor and allows another source to progress", async () => {
  const raw = JSON.parse(env.DEPLOYMENT_MANIFEST);
  raw.contracts.usdcNative.startBlock = "10";
  env.DEPLOYMENT_MANIFEST = JSON.stringify(raw);
  fixture.timeoutAddress = raw.contracts.governor.address;
  expect(await indexChain(env)).toHaveProperty("error", "INDEX_LOG_TIMEOUT");
  expect(
    fixture.queries.filter((q) => q.address === fixture.timeoutAddress),
  ).toHaveLength(2);
  expect(
    await fixtureDb.db
      .prepare("SELECT * FROM cursors WHERE contract=?")
      .bind(fixture.timeoutAddress)
      .first(),
  ).toBeNull();
  expect(
    await fixtureDb.db
      .prepare("SELECT block_number FROM cursors WHERE contract=?")
      .bind(raw.contracts.usdcNative.address)
      .first(),
  ).toEqual({ block_number: 20 });
  const state = await fixtureDb.db
    .prepare("SELECT span,last_reason FROM index_adaptive WHERE source_key=?")
    .bind(fixture.timeoutAddress)
    .first();
  expect(state).toEqual({ span: 11, last_reason: "INDEX_LOG_TIMEOUT" });
});

it("does not adapt or retry after an exhausted quota", async () => {
  fixture.quotaAfterLogs = true;
  expect(await indexChain(env)).toHaveProperty(
    "error",
    "INFURA_DAILY_BUDGET_EXHAUSTED",
  );
  expect(fixture.queries).toHaveLength(2);
  expect(
    await fixtureDb.db.prepare("SELECT * FROM index_adaptive").first(),
  ).toBeNull();
});

it("bounds a cron to one source and rotates a failed source without skipping its pending blocks", async () => {
  const raw = JSON.parse(env.DEPLOYMENT_MANIFEST);
  raw.contracts.usdcNative.startBlock = "10";
  env.DEPLOYMENT_MANIFEST = JSON.stringify(raw);
  env.INDEX_SOURCES_PER_RUN = "1";
  fixture.timeoutAddress = raw.contracts.governor.address;
  expect(await indexChain(env)).toHaveProperty("error", "INDEX_LOG_TIMEOUT");
  expect(new Set(fixture.queries.map((q) => q.address)).size).toBe(1);
  fixture.queries = [];
  fixture.timeoutAddress = "";
  await indexChain(env);
  expect(
    fixture.queries.every(
      (q) => q.address === raw.contracts.usdcNative.address,
    ),
  ).toBe(true);
  expect(
    await fixtureDb.db
      .prepare("SELECT * FROM cursors WHERE contract=?")
      .bind(raw.contracts.governor.address)
      .first(),
  ).toBeNull();
  const attempts = await fixtureDb.db
    .prepare(
      "SELECT source_key,finished_at,reason FROM index_source_runs ORDER BY source_key",
    )
    .all();
  expect(attempts.results).toHaveLength(2);
  expect(attempts.results.every((r) => r.finished_at !== null)).toBe(true);
});

it("rolls back tuning, events and cursor together if its lease expires before commit", async () => {
  fixture.afterLogs = async () => {
    await fixtureDb.db.prepare("UPDATE index_lock SET expires_at=0").run();
  };
  expect(await indexChain(env)).toHaveProperty("error");
  for (const table of [
    "index_adaptive",
    "events",
    "cursors",
    "checkpoints",
    "index_health",
  ])
    expect(
      await fixtureDb.db.prepare(`SELECT * FROM ${table}`).first(),
    ).toBeNull();
});
