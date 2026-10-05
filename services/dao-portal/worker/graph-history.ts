import type { PublicClient } from "viem";
import type { PortalConfig, GraphHistoryStatus } from "../shared/domain";
import { GOVERNOR, MANA } from "../shared/graph-pilot.mjs";
import { graphComparisonGate } from "./graph-comparison";
import type { GraphHistory } from "./graph-history-model";
import { agreed } from "./rpc";

export async function graphHistory(
  env: Env,
  cfg: PortalConfig,
  pair: [PublicClient, PublicClient],
  confirmed: bigint,
): Promise<{ status: GraphHistoryStatus; data?: GraphHistory }> {
  const base = { source: "The Graph + RPC" as const, complete: false as const };
  if (
    env.GRAPH_READ_MODE !== "verified" ||
    env.GRAPH_REORG_VERIFIED !== "true" ||
    graphComparisonGate(env)
  )
    return { status: { ...base, status: "disabled" } };
  if (
    cfg.chainId !== 137 ||
    cfg.contracts.governor?.address !== GOVERNOR ||
    cfg.contracts.mana?.address !== MANA
  )
    return {
      status: { ...base, status: "fallback", reason: "GRAPH_CONFIG_MISMATCH" },
    };
  try {
    const row = await env.DAO_DB.prepare(
      "SELECT history_json,report_json,checked_at FROM graph_comparison WHERE id=1",
    ).first<{
      history_json: string | null;
      report_json: string | null;
      checked_at: number | null;
    }>();
    if (!row?.checked_at || !row.report_json)
      return { status: { ...base, status: "pending" } };
    if (Date.now() - row.checked_at > 7200000 || row.checked_at > Date.now())
      return {
        status: { ...base, status: "stale", checkedAt: row.checked_at },
      };
    const report = JSON.parse(row.report_json);
    if (report.status !== "compared" || !row.history_json)
      return {
        status: {
          ...base,
          status: "fallback",
          reason: "GRAPH_COMPARISON_UNAVAILABLE",
        },
      };
    const data: GraphHistory = JSON.parse(row.history_json);
    if (
      !Number.isSafeInteger(data.anchor) ||
      data.anchor > Number(confirmed) ||
      data.anchor !== report.anchor ||
      data.hash !== report.hash ||
      !Array.isArray(data.events) ||
      !Array.isArray(data.delegateCandidates) ||
      data.events.length > 100 ||
      data.delegateCandidates.length > 100 ||
      data.fullHistoryVerified !== false
    )
      throw Error("Invalid cache");
    if (
      (await agreed(
        pair,
        async (c) =>
          (await c.getBlock({ blockNumber: BigInt(data.anchor) })).hash,
      )) !== data.hash
    )
      return {
        status: { ...base, status: "fallback", reason: "GRAPH_ANCHOR_CHANGED" },
      };
    return {
      status: {
        ...base,
        status: "ready",
        checkedAt: row.checked_at,
        asOfBlock: String(data.anchor),
      },
      data,
    };
  } catch {
    return {
      status: {
        ...base,
        status: "fallback",
        reason: "GRAPH_HISTORY_UNAVAILABLE",
      },
    };
  }
}
