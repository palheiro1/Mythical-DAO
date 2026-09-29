import { toHex, type PublicClient } from "viem";
import { stringify, type Action, type PortalConfig } from "../shared/domain";
import { agreed, RpcFault } from "./rpc";
interface SimulatedCall {
  status: string;
  returnData: string;
  gasUsed: string;
  logs?: { address: string; data: string; topics: string[] }[];
}
const unsupported = (error: unknown) => {
  for (
    let depth = 0;
    error && typeof error === "object" && depth < 8;
    depth++
  ) {
    if ((error as { code?: number }).code === -32601) return true;
    error = (error as { cause?: unknown }).cause;
  }
  return false;
};
export async function simulateActions(
  pair: [PublicClient, PublicClient],
  cfg: PortalConfig,
  head: bigint,
  actions: Action[],
) {
  const governor = cfg.contracts.governor!.address;
  const results = await Promise.allSettled(
    pair.map(async (c) => {
      const result = (await c.transport.request({
        method: "eth_simulateV1",
        params: [
          {
            blockStateCalls: [
              {
                calls: actions.map((a) => ({
                  from: governor,
                  to: a.target,
                  data: a.data,
                  value: toHex(BigInt(a.value)),
                  gas: "0x989680",
                })),
              },
            ],
            validation: false,
            traceTransfers: false,
          },
          toHex(head),
        ],
      })) as { calls: SimulatedCall[] }[];
      // Provider-specific block hashes, key order and simulated transaction IDs are not call outcomes.
      if (
        !Array.isArray(result?.[0]?.calls) ||
        result[0].calls.length !== actions.length
      )
        throw new RpcFault("INVALID_SIMULATION_RESPONSE");
      return result[0].calls.map((call) => {
        if (
          !["0x0", "0x1"].includes(call.status) ||
          !/^0x[0-9a-f]*$/i.test(call.returnData)
        )
          throw new RpcFault("INVALID_SIMULATION_RESPONSE");
        return {
          status: call.status,
          returnData: call.returnData.toLowerCase(),
          gasUsed: toHex(BigInt(call.gasUsed)),
          logs: (call.logs ?? []).map((log) => ({
            address: log.address.toLowerCase(),
            data: log.data.toLowerCase(),
            topics: log.topics.map((t) => t.toLowerCase()),
          })),
        };
      });
    }),
  );
  for (const r of results)
    if (r.status === "rejected" && !unsupported(r.reason)) throw r.reason;
  const available = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);
  if (available.length === 2) {
    if (stringify(available[0]) !== stringify(available[1]))
      throw new RpcFault("RPC_DIVERGENCE");
    const ok = available[0].every((c) => c.status === "0x1");
    return {
      ok,
      complete: true,
      block: String(head),
      calls: available[0],
      warning: ok
        ? "Current-state simulation passed. Future balances and state may change."
        : "Some proposed actions revert in the current state. Governance-only parameter changes require the approved execution context. Publication does not guarantee that this proposal can execute.",
    };
  }
  // One action has no inter-action state dependencies, so standard eth_call can verify it independently.
  if (actions.length === 1 && available[0]?.[0]?.status === "0x1") {
    const action = actions[0];
    const data = await agreed(
      pair,
      async (c) =>
        (
          await c.call({
            account: governor,
            to: action.target,
            data: action.data,
            value: BigInt(action.value),
            blockNumber: head,
          })
        ).data ?? "0x",
    );
    if (data.toLowerCase() !== available[0][0].returnData)
      throw new RpcFault("RPC_DIVERGENCE");
    return {
      ok: true,
      complete: true,
      block: String(head),
      calls: available[0],
      warning:
        "The single action was verified from the Governor by both data providers. Future balances and state may change.",
    };
  }
  // This is advisory review of FUTURE actions, never an authorization to send the publication.
  // The real propose() transaction still requires its own two-provider preflight, twice.
  return {
    ok: false,
    complete: false,
    block: String(head),
    calls: available[0] ?? [],
    warning:
      "The combined actions could not be verified by both data providers. Review every action carefully. Publication does not guarantee execution; execution must pass a separate simulation.",
  };
}
