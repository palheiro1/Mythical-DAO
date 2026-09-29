import { describe, it, expect, vi } from "vitest";
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
  it("preserves an unsupported simulation error carried by HTTP 503 without batching it", async () => {
    const bodies: unknown[] = [];
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        const result = {
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32601, message: "method ignored by upstream" },
        };
        return Response.json(Array.isArray(body) ? [result] : result, {
          status: 503,
        });
      });
    try {
      const [client] = clients({
        ENVIRONMENT: "local",
        RPC_PRIMARY_URL: "https://method.example",
        RPC_SECONDARY_URL: "https://independent.example",
      } as Env);
      await expect(
        client.transport.request({ method: "eth_simulateV1", params: [] }),
      ).rejects.toMatchObject({ code: -32601 });
      expect(bodies.every((body) => !Array.isArray(body))).toBe(true);
    } finally {
      fetcher.mockRestore();
    }
  });
  it("actually aborts a stalled fetch even with the per-request batch isolation signal", async () => {
    const signals: AbortSignal[] = [];
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_url, init) => {
        const signal = init!.signal!;
        signals.push(signal);
        return new Promise((_resolve, reject) => {
          const fallback = setTimeout(
            () => reject(new Error("upstream still stalled")),
            150,
          );
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(fallback);
              reject(signal.reason);
            },
            { once: true },
          );
        });
      });
    try {
      const [client] = clients(
        {
          ENVIRONMENT: "local",
          RPC_PRIMARY_URL: "https://stall.example",
          RPC_SECONDARY_URL: "https://independent.example",
        } as Env,
        { timeout: 20 },
      );
      await expect(client.getChainId()).rejects.toThrow();
      expect(signals.length).toBeGreaterThan(0);
      expect(signals.every((signal) => signal.aborted)).toBe(true);
    } finally {
      fetcher.mockRestore();
    }
  });
  it("reads a multi-asset basket through providers capped at three calls per batch", async () => {
    const sizes: number[] = [];
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, init) => {
        const requests = JSON.parse(String(init?.body));
        sizes.push(requests.length);
        if (requests.length > 3)
          return new Response("Batch limit exceeded", { status: 429 });
        return Response.json(
          requests.map((request: { id: number; params: string[] }) => ({
            jsonrpc: "2.0",
            id: request.id,
            result: request.params[1],
          })),
        );
      });
    try {
      const [client] = clients({
        ENVIRONMENT: "local",
        RPC_PRIMARY_URL: "https://batch-cap.example",
        RPC_SECONDARY_URL: "https://independent.example",
      } as Env);
      const blocks = Array.from(
        { length: 7 },
        (_, index) => `0x${index + 1}` as const,
      );
      const values = await Promise.all(
        blocks.map((block) =>
          client.getBalance({
            address: "0x0000000000000000000000000000000000000001",
            blockNumber: BigInt(block),
          }),
        ),
      );
      expect(values).toEqual(blocks.map(BigInt));
      expect(sizes.every((size) => size <= 3)).toBe(true);
      expect(sizes.reduce((total, size) => total + size, 0)).toBe(7);
    } finally {
      fetcher.mockRestore();
    }
  });
  it("batches concurrent reads and recovers from one transient HTTP failure", async () => {
    const batches: { id: number; method: string }[][] = [];
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, init) => {
        const requests = JSON.parse(String(init?.body));
        batches.push(requests);
        if (batches.length === 1)
          return new Response("Temporary upstream failure", { status: 502 });
        return Response.json(
          requests.map((request: { id: number; method: string }) => ({
            jsonrpc: "2.0",
            id: request.id,
            result: request.method === "eth_chainId" ? "0x89" : "0x64",
          })),
        );
      });
    try {
      const [client] = clients({
        ENVIRONMENT: "local",
        RPC_PRIMARY_URL: "https://retry.example",
        RPC_SECONDARY_URL: "https://independent.example",
      } as Env);
      expect(
        await Promise.all([
          client.getChainId(),
          client.getBlockNumber({ cacheTime: 0 }),
        ]),
      ).toEqual([137, 100n]);
      expect(batches).toHaveLength(2);
      expect(batches[0].map((r) => r.method).sort()).toEqual([
        "eth_blockNumber",
        "eth_chainId",
      ]);
    } finally {
      fetcher.mockRestore();
    }
  });
  it("stops after one retry when a provider stays unavailable", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response("Unavailable", { status: 502 }),
      );
    try {
      const [client] = clients({
        ENVIRONMENT: "local",
        RPC_PRIMARY_URL: "https://offline.example",
        RPC_SECONDARY_URL: "https://independent.example",
      } as Env);
      await expect(client.getChainId()).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      fetcher.mockRestore();
    }
  });
  it("does not share pending batches between independent Worker requests", async () => {
    const batches: { id: number; method: string }[][] = [];
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, init) => {
        const requests = JSON.parse(String(init?.body));
        batches.push(requests);
        return Response.json(
          requests.map((request: { id: number; method: string }) => ({
            jsonrpc: "2.0",
            id: request.id,
            result: request.method === "eth_chainId" ? "0x89" : "0x64",
          })),
        );
      });
    try {
      const env = {
        ENVIRONMENT: "local",
        RPC_PRIMARY_URL: "https://shared.example",
        RPC_SECONDARY_URL: "https://independent.example",
      } as Env;
      const [first] = clients(env),
        [second] = clients(env);
      await Promise.all(
        [first, second].flatMap((client) => [
          client.getChainId(),
          client.getBlockNumber({ cacheTime: 0 }),
        ]),
      );
      expect(batches.map((batch) => batch.length)).toEqual([2, 2]);
    } finally {
      fetcher.mockRestore();
    }
  });
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
