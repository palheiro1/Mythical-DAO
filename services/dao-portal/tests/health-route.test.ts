import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, toFunctionSelector } from "viem";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import sourceWorker from "../worker/index";
import { config } from "../worker/config";

// Run the same request-level regressions against the deployed artifact during
// incident repair, and against the maintained source in normal CI.
const worker = process.env.PORTAL_WORKER_UNDER_TEST
  ? (
      await import(
        /* @vite-ignore */ pathToFileURL(
          resolve(process.env.PORTAL_WORKER_UNDER_TEST),
        ).href
      )
    ).default
  : sourceWorker;

afterEach(() => vi.restoreAllMocks());

describe("live signing health is independent of proposal snapshots", () => {
  it.each([
    { snapshotAllowed: false, failure: undefined, allowed: true },
    { snapshotAllowed: true, failure: "chain", allowed: false },
    { snapshotAllowed: true, failure: "head", allowed: false },
    { snapshotAllowed: true, failure: "token", allowed: false },
    { snapshotAllowed: true, failure: "provider", allowed: false },
  ])(
    "checks live RPCs with $failure failure and snapshot signing=$snapshotAllowed",
    async ({ snapshotAllowed, failure, allowed }) => {
      const snapshotRead = vi.fn();
      const env = {
        ENVIRONMENT: "staging",
        RPC_PRIMARY_URL: "https://primary.example",
        RPC_SECONDARY_URL: "https://secondary.example",
        GRAPH_READ_MODE: "off",
        DAO_DB: {
          prepare: (sql: string) => {
            const statement = {
              bind: () => statement,
              all: async () => ({ results: [] }),
              first: async () => {
                if (sql.includes("public_proposal_snapshot")) {
                  snapshotRead();
                  return {
                    payload: JSON.stringify({
                      checkedAt: Date.now() - 600_000,
                      health: { signingAllowed: snapshotAllowed },
                      items: [],
                      rows: [],
                    }),
                  };
                }
                return null;
              },
            };
            return statement;
          },
        },
      } as unknown as Env;
      const cfg = config(env);
      const providers = new Set<string>();
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        providers.add(url);
        const secondary = url.includes("secondary");
        if (failure === "provider" && secondary)
          return new Response("unavailable", { status: 429 });
        const requests = JSON.parse(String(init?.body));
        const answer = (request: {
          id: number;
          method: string;
          params: [{ data?: string }];
        }) => {
          let result: unknown;
          switch (request.method) {
            case "eth_chainId":
              result = failure === "chain" && secondary ? "0x1" : "0x89";
              break;
            case "eth_blockNumber":
              result = "0x10000";
              break;
            case "eth_getBlockByNumber":
              result = {
                number: "0x10000",
                hash: `0x${"ab".repeat(32)}`,
                timestamp: `0x${(Math.floor(Date.now() / 1000) - (failure === "head" ? 300 : 0)).toString(16)}`,
                transactions: [],
              };
              break;
            case "eth_call":
              result =
                request.params[0].data === toFunctionSelector("token()")
                  ? encodeAbiParameters(
                      [{ type: "address" }],
                      [
                        failure === "token"
                          ? "0x0000000000000000000000000000000000000001"
                          : cfg.contracts.mana!.address,
                      ],
                    )
                  : encodeAbiParameters([{ type: "uint256" }], [100n]);
              break;
            default:
              throw Error(`Unexpected RPC: ${request.method}`);
          }
          return { jsonrpc: "2.0", id: request.id, result };
        };
        return Response.json(
          Array.isArray(requests) ? requests.map(answer) : answer(requests),
        );
      });
      const response = await worker.fetch(
        new Request("https://portal.example/api/health"),
        env,
        {} as ExecutionContext,
      );
      const health = await response.json();
      expect(response.status).toBe(200);
      expect(health.signingAllowed).toBe(allowed);
      expect(snapshotRead).not.toHaveBeenCalled();
      expect(providers.size).toBe(2);
      expect(Date.now() - Date.parse(health.checkedAt)).toBeLessThan(10_000);
      if (!allowed) expect(health.liveReason).toBeTruthy();
    },
  );
});
