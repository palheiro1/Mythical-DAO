import { proposalTotals } from "./proposal-totals";
import { readClients } from "./infura";
import type { Proposal, PortalConfig, Health } from "../shared/domain";
import { eventProposal, indexHealth, type EventRow } from "./data";
import { agreed, commonHead, settledValues } from "./rpc";
import { graphHistory } from "./graph-history";
import { mergeHistoryRows } from "./graph-history-model";

// Presentation cache only. Preflight, simulation and signing never read this table.
export const PROPOSAL_FRESH_MS = 180_000;
export interface ProposalSnapshot {
  checkedAt: number;
  block: string;
  rows: EventRow[];
  items: Proposal[];
  health?: Health;
}
export function presentSnapshot(snapshot: ProposalSnapshot, now = Date.now()) {
  const fresh =
    now >= snapshot.checkedAt && now - snapshot.checkedAt <= PROPOSAL_FRESH_MS;
  return snapshot.items.map((p) => ({
    ...p,
    ...(fresh ? {} : { state: "Unknown" }),
    results: {
      source: "Governor · two RPC providers" as const,
      block: snapshot.block,
      checkedAt: snapshot.checkedAt,
      fresh,
    },
  }));
}
export async function readProposalSnapshot(
  env: Env,
): Promise<ProposalSnapshot | undefined> {
  const row = await env.DAO_DB.prepare(
    "SELECT payload FROM public_proposal_snapshot WHERE id=1",
  ).first<{ payload: string }>();
  return row ? JSON.parse(row.payload) : undefined;
}
export async function refreshProposalSnapshot(env: Env, cfg: PortalConfig) {
  const pair = readClients(env),
    { head, confirmed } = await commonHead(pair, cfg);
  const initialHash = await agreed(
    pair,
    async (c) => (await c.getBlock({ blockNumber: head })).hash,
  );
  const graph = await graphHistory(env, cfg, pair, confirmed);
  const indexed = await env.DAO_DB.prepare(
    "SELECT * FROM events WHERE chain_id=? AND contract=? AND event_name='ProposalCreated' AND block_number<=? ORDER BY block_number DESC LIMIT 100",
  )
    .bind(cfg.chainId, cfg.contracts.governor!.address, Number(confirmed))
    .all<EventRow>();
  const previous = await readProposalSnapshot(env);
  // Retain previously discovered proposals if a supplemental provider is down.
  // Revalidate their publication block on each refresh, including after a reorg.
  const rows = mergeHistoryRows(
    indexed.results,
    mergeHistoryRows(
      graph.data?.events.filter((e) => e.event_name === "ProposalCreated") ??
        [],
      previous?.rows ?? [],
      100,
    ),
    20,
  );
  const confirmedRows = rows.filter(
    (row) => row.block_number <= Number(confirmed),
  );
  // Parallel reads let the independent provider batch publication headers.
  const hashes = await settledValues(
    confirmedRows.map((row) =>
      agreed(
        pair,
        async (c) =>
          (await c.getBlock({ blockNumber: BigInt(row.block_number) })).hash,
      ),
    ),
  );
  const canonical = confirmedRows.filter(
    (row, i) => row.block_hash === hashes[i],
  );
  const items = await proposalTotals(
    canonical.map((row) => eventProposal(row, cfg)),
    pair,
    head,
  );
  const hash = await agreed(
    pair,
    async (c) => (await c.getBlock({ blockNumber: head })).hash,
  );
  if (!hash || hash !== initialHash) throw Error("SNAPSHOT_HEAD_UNAVAILABLE");
  const health = await indexHealth(env, cfg, pair, { head, confirmed });
  health.graphHistory = graph.status;
  const snapshot: ProposalSnapshot = {
    checkedAt: Date.now(),
    block: String(head),
    rows: canonical,
    items,
    health,
  };
  await env.DAO_DB.prepare(
    "INSERT INTO public_proposal_snapshot(id,payload,block_number) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,block_number=excluded.block_number WHERE excluded.block_number>=public_proposal_snapshot.block_number",
  )
    .bind(JSON.stringify(snapshot), Number(head))
    .run();
}
