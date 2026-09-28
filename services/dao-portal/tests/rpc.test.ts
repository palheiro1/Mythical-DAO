import { describe, it, expect } from "vitest";
import { agreed, commonHead, clients } from "../worker/rpc";
import { rewindPoint } from "../worker/indexer";
import type { PublicClient } from "viem";
import type { PortalConfig } from "../shared/domain";
const hash = "0x" + "1".repeat(64);
const fake = (head = 100n, chain = 137, blockHash = hash, age = 0) =>
  ({
    getBlockNumber: async () => head,
    getChainId: async () => chain,
    getBlock: async () => ({
      hash: blockHash,
      timestamp: BigInt(Math.floor(Date.now() / 1000) - age),
    }),
  }) as PublicClient;
const cfg = { chainId: 137, confirmations: 64 } as PortalConfig;
describe("two-provider safety", () => {
  it("uses the lower head and 64 confirmations", async () => {
    expect(await commonHead([fake(100n), fake(103n)], cfg)).toEqual({
      head: 100n,
      confirmed: 36n,
    });
  });
  it("rejects the wrong network, large lag and divergent hashes", async () => {
    await expect(commonHead([fake(), fake(100n, 1)], cfg)).rejects.toThrow(
      "RPC_WRONG_CHAIN",
    );
    await expect(commonHead([fake(), fake(120n)], cfg)).rejects.toThrow(
      "RPC_HEAD_DIVERGENCE",
    );
    await expect(
      commonHead([fake(), fake(100n, 137, "other")], cfg),
    ).rejects.toThrow("RPC_DIVERGENCE");
  });
  it("rejects agreeing providers with stale or future timestamps", async () => {
    for (const age of [181, -31]) {
      await expect(
        commonHead(
          [fake(100n, 137, hash, age), fake(100n, 137, hash, age)],
          cfg,
        ),
      ).rejects.toThrow("RPC_STALE_HEAD");
    }
  });
  it("rejects divergent data and provider failure", async () => {
    await expect(
      agreed([fake(1n), fake(2n)], (c) => c.getBlockNumber()),
    ).rejects.toThrow("RPC_DIVERGENCE");
    await expect(
      agreed([fake(), fake()], async () => {
        throw Error("offline");
      }),
    ).rejects.toThrow("offline");
  });
  it("requires independent secure production providers", () => {
    expect(() =>
      clients({
        ENVIRONMENT: "production",
        RPC_PRIMARY_URL: "https://same.example/a",
        RPC_SECONDARY_URL: "https://same.example/b",
      } as Env),
    ).toThrow();
  });
  it("rewinds to the newest common anchor, or replays from deployment", () => {
    const points = [
      { block_number: 30, block_hash: "orphan" },
      { block_number: 20, block_hash: "common" },
      { block_number: 10, block_hash: "old" },
    ];
    expect(
      rewindPoint(
        points,
        new Map([
          [30, "new"],
          [20, "common"],
        ]),
      )?.block_number,
    ).toBe(20);
    expect(rewindPoint(points, new Map())).toBeUndefined();
  });
});
