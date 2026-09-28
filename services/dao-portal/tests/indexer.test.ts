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
        return { hash: hash(Number(blockNumber)) };
      },
      getLogs: async ({
        fromBlock,
        toBlock,
      }: {
        fromBlock: bigint;
        toBlock: bigint;
      }) => {
        if (fixture.failLogs) throw Error("interrupted");
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
  fixture.offline = false;
  fixture.failLogs = false;
  fixture.hashes.clear();
  fixture.value = 100n;
  env = {
    ...fixtureDb.bindings,
    ENVIRONMENT: "local",
    INDEX_BATCH_BLOCKS: "11",
    DEPLOYMENT_MANIFEST: JSON.stringify({
      chainId: 137,
      enabled: false,
      confirmations: 64,
      contracts: {
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
