import { it, expect, vi } from "vitest";
import type { PublicClient } from "viem";
import type { PortalConfig } from "../shared/domain";
import { indexHealth } from "../worker/data";
import { rpcFailureCode, RpcFault } from "../worker/rpc";

it("classifies nested transport faults without exposing provider details", () => {
  expect(
    rpcFailureCode(
      { cause: { cause: new RpcFault("RPC_SECONDARY_TIMEOUT") } },
      "UNKNOWN",
    ),
  ).toBe("RPC_SECONDARY_TIMEOUT");
  expect(
    rpcFailureCode({ cause: { status: 429, message: "secret" } }, "UNKNOWN"),
  ).toBe("RPC_RATE_LIMITED");
  expect(
    rpcFailureCode(new Error("https://provider/key"), "RPC_UNAVAILABLE"),
  ).toBe("RPC_UNAVAILABLE");
});
it("reuses a verified request head but still rejects a live contract mismatch", async () => {
  const cfg = {
    enabled: true,
    chainId: 137,
    confirmations: 64,
    contracts: {
      governor: {
        address: "0x0000000000000000000000000000000000000001",
        startBlock: 0,
      },
      mana: {
        address: "0x0000000000000000000000000000000000000002",
        startBlock: 0,
      },
    },
  } as unknown as PortalConfig;
  const env = {
    DAO_DB: {
      prepare: () => ({
        bind: () => ({ all: async () => ({ results: [] }) }),
        first: async () => null,
      }),
    },
  } as unknown as Env;
  const getChainId = vi.fn(async () => 137),
    getBlockNumber = vi.fn(async () => 100n);
  const readContract = vi.fn(
    async ({ functionName }: { functionName: string }) =>
      functionName === "token"
        ? "0x0000000000000000000000000000000000000003"
        : 100n,
  );
  const client = {
    getChainId,
    getBlockNumber,
    getBlock: async () => ({ hash: "0xabc" }),
    readContract,
  } as unknown as PublicClient;
  const result = await indexHealth(env, cfg, [client, client], {
    head: 100n,
    confirmed: 36n,
  });
  expect(getChainId).not.toHaveBeenCalled();
  expect(getBlockNumber).not.toHaveBeenCalled();
  expect(readContract).toHaveBeenCalledTimes(4);
  expect(result.signingAllowed).toBe(false);
  expect(result.liveReason).toBe("GOVERNOR_TOKEN_MISMATCH");
});
