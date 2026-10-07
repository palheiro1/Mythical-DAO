import { readClients } from "./infura";
import {
  encodeAbiParameters,
  keccak256,
  stringToHex,
  type PublicClient,
} from "viem";
import { tokenAbi, governorAbi } from "../shared/abis";
import { stringify } from "../shared/domain";
import { config } from "./config";
import {
  historySnapshotQuery,
  verifyGraphHistory,
} from "./graph-history-model";
import { agreed, commonHead } from "./rpc";
import {
  GOVERNOR,
  MANA,
  GATEWAY_URL,
  PILOT_DEPLOYMENT,
  SUBGRAPH_ID,
  graphQuery,
  pilotMetaQuery,
  pilotSnapshotQuery,
  pilotAnchor,
  validatePilotSnapshot,
  validateMeta,
  verifyPilotEntities,
  requireValue,
  type PilotProposal,
} from "../shared/graph-pilot.mjs";

// The optional secret must not become a required deployment binding for governance.
function graphCredential(env: Env): string | undefined {
  const key = "GRAPH_API_KEY" in env ? env.GRAPH_API_KEY : undefined;
  return typeof key === "string" ? key : undefined;
}

// Comparisons never authorize a signature. Optional history reads have their own gate.
export function graphComparisonGate(env: Env): string | null {
  if (env.GRAPH_COMPARE_MODE !== "shadow") return "GRAPH_COMPARISON_OFF";
  // Provider scope remains a separate fact. The explicit server-only exception
  // accepts quota-abuse risk; it does not attest that the provider enforces scope.
  if (
    env.GRAPH_SUBGRAPH_RESTRICTED !== "true" &&
    env.GRAPH_ALLOW_UNRESTRICTED_SERVER_KEY !== "true"
  )
    return "GRAPH_KEY_RESTRICTION_PENDING";
  if (!/^[a-zA-Z0-9_-]{16,256}$/.test(graphCredential(env) ?? ""))
    return "GRAPH_KEY_MISSING";
  return null;
}
export function proposalDigest(p: PilotProposal): string {
  return String(
    BigInt(
      keccak256(
        encodeAbiParameters(
          [
            { type: "address[]" },
            { type: "uint256[]" },
            { type: "bytes[]" },
            { type: "bytes32" },
          ],
          [
            p.targets,
            p.values.map(BigInt),
            p.calldatas,
            keccak256(stringToHex(p.description)),
          ],
        ),
      ),
    ),
  );
}
export async function readPilotProposal(
  pair: [PublicClient, PublicClient],
  p: PilotProposal,
  blockNumber: bigint,
  checkTime = () => {},
) {
  const observation = await agreed(pair, async (c) => {
    const args = [BigInt(p.proposalId)] as const;
    checkTime();
    // Independent reads share the existing three-request RPC batch limit.
    const [state, voteStart, voteEnd, votes] = await Promise.all([
      c.readContract({
        address: GOVERNOR,
        abi: governorAbi,
        functionName: "state",
        args,
        blockNumber,
      }),
      c.readContract({
        address: GOVERNOR,
        abi: governorAbi,
        functionName: "proposalSnapshot",
        args,
        blockNumber,
      }),
      c.readContract({
        address: GOVERNOR,
        abi: governorAbi,
        functionName: "proposalDeadline",
        args,
        blockNumber,
      }),
      c.readContract({
        address: GOVERNOR,
        abi: governorAbi,
        functionName: "proposalVotes",
        args,
        blockNumber,
      }),
    ]);
    checkTime();
    return {
      proposalId: proposalDigest(p),
      voteStart: String(voteStart),
      voteEnd: String(voteEnd),
      votes: votes.map(String),
      executed: state === 7,
      canceled: state === 2,
    };
  });
  return observation;
}
export async function compareGraph(env: Env) {
  const deadline = Date.now() + 90000;
  const checkTime = () =>
    requireValue(Date.now() < deadline, "GRAPH_RUN_DEADLINE");
  const cfg = config(env);
  requireValue(
    cfg.chainId === 137 &&
      cfg.contracts.governor?.address === GOVERNOR &&
      cfg.contracts.mana?.address === MANA,
    "GRAPH_CONFIG_MISMATCH",
  );
  const pair = readClients(env),
    { confirmed } = await commonHead(pair, cfg);
  const query = <T = unknown>(q: string, v: Record<string, unknown> = {}) => {
    checkTime();
    return graphQuery<T>(GATEWAY_URL, q, v, fetch, {
      apiKey: graphCredential(env),
    });
  };
  const latest = await query<{ _meta: unknown }>(pilotMetaQuery);
  const anchor = pilotAnchor(latest._meta, Number(confirmed));
  const blockNumber = BigInt(anchor);
  const hashAt = () =>
    agreed(pair, async (c) => (await c.getBlock({ blockNumber })).hash);
  const hash = await hashAt();
  const snapshot = validatePilotSnapshot(
    await query(pilotSnapshotQuery, { hash }),
    anchor,
    hash,
  );
  const supply = await agreed(pair, (c) =>
    c.readContract({
      address: MANA,
      abi: tokenAbi,
      functionName: "totalSupply",
      blockNumber,
    }),
  );
  requireValue(
    String(supply) === snapshot.pilotStats.totalSupply,
    "GRAPH_SUPPLY_MISMATCH",
  );
  // Cron compares two known accounts. The manual acceptance command checks every account.
  const selected = snapshot.manaAccounts.filter((a) =>
    [GOVERNOR, "0xc4ccc6a11329558582c2da79c18a9aeac00f59f9"].includes(a.id),
  );
  requireValue(selected.length === 2, "GRAPH_SAMPLE_ACCOUNTS_MISSING");
  // Bound cron RPC work separately from the schema's larger offline limits.
  requireValue(snapshot.proposals.length <= 10, "GRAPH_CRON_PROPOSAL_LIMIT");
  const verified = await verifyPilotEntities(
    { ...snapshot, manaAccounts: selected },
    (id) => {
      checkTime();
      return agreed(pair, async (c) => {
        const [balance, votingPower, delegate] = await Promise.all([
          c.readContract({
            address: MANA,
            abi: tokenAbi,
            functionName: "balanceOf",
            args: [id],
            blockNumber,
          }),
          c.readContract({
            address: MANA,
            abi: tokenAbi,
            functionName: "getVotes",
            args: [id],
            blockNumber,
          }),
          c.readContract({
            address: MANA,
            abi: tokenAbi,
            functionName: "delegates",
            args: [id],
            blockNumber,
          }),
        ]);
        return {
          balance: String(balance),
          votingPower: String(votingPower),
          delegate,
        };
      });
    },
    (p) => readPilotProposal(pair, p, blockNumber, checkTime),
  );
  const rows = await env.DAO_DB.prepare(
    "SELECT args_json FROM events WHERE chain_id=137 AND contract=? AND event_name='ProposalCreated' AND block_number<=? LIMIT 51",
  )
    .bind(GOVERNOR, anchor)
    .all<{ args_json: string }>();
  requireValue(rows.results.length <= 50, "GRAPH_D1_PROPOSAL_LIMIT");
  for (const row of rows.results) {
    const local = JSON.parse(row.args_json) as Record<string, unknown>;
    const indexed = snapshot.proposals.find(
      (p) => p.proposalId === local.proposalId,
    );
    requireValue(indexed, "GRAPH_D1_PROPOSAL_MISSING");
    local.proposer =
      typeof local.proposer === "string"
        ? local.proposer.toLowerCase()
        : local.proposer;
    if (Array.isArray(local.targets))
      local.targets = local.targets.map((x) =>
        typeof x === "string" ? x.toLowerCase() : x,
      );
    if (Array.isArray(local.calldatas))
      local.calldatas = local.calldatas.map((x) =>
        typeof x === "string" ? x.toLowerCase() : x,
      );
    for (const field of [
      "proposer",
      "description",
      "targets",
      "values",
      "signatures",
      "calldatas",
      "voteStart",
      "voteEnd",
    ] as const)
      requireValue(
        stringify(indexed[field]) === stringify(local[field]),
        "GRAPH_D1_PROPOSAL_MISMATCH",
      );
  }
  const cursor = await env.DAO_DB.prepare(
    "SELECT block_number FROM cursors WHERE chain_id=137 AND contract=?",
  )
    .bind(GOVERNOR)
    .first<{ block_number: number }>();
  const d1Complete = (cursor?.block_number ?? 0) >= anchor;
  if (d1Complete)
    requireValue(
      rows.results.length === snapshot.proposals.length,
      "GRAPH_D1_PROPOSAL_COUNT_MISMATCH",
    );
  const history =
    env.GRAPH_READ_MODE === "verified" && env.GRAPH_REORG_VERIFIED === "true"
      ? await verifyGraphHistory(
          snapshot,
          (
            await query<{ eventRecords: unknown }>(historySnapshotQuery, {
              hash,
            })
          ).eventRecords,
          pair,
          checkTime,
        )
      : undefined;
  requireValue((await hashAt()) === hash, "GRAPH_ANCHOR_CHANGED");
  const final = await query<{ _meta: unknown }>(
    "query($hash:Bytes!){_meta(block:{hash:$hash}){deployment hasIndexingErrors block{number hash}}}",
    { hash },
  );
  validateMeta(final._meta, PILOT_DEPLOYMENT, anchor, hash);
  return {
    status: "compared" as const,
    anchor,
    hash,
    verified,
    d1: { matchedProposals: rows.results.length, historyComplete: d1Complete },
    fullHistoryVerified: false,
    history,
  };
}

// One run/hour, 3 (comparison) or 4 (with history) queries reserved, 3000/month.
// Atomic ownership fences late completions and survives cron retries/concurrency.
export async function runGraphComparison(env: Env, compare = compareGraph) {
  if (graphComparisonGate(env)) return false;
  const reserved =
    env.GRAPH_READ_MODE === "verified" && env.GRAPH_REORG_VERIFIED === "true"
      ? 4
      : 3;
  const now = Date.now(),
    owner = crypto.randomUUID(),
    month = new Date(now).toISOString().slice(0, 7);
  const lease = await env.DAO_DB.prepare(
    `INSERT INTO graph_comparison(id,owner,lease_until,next_attempt,month,reserved_queries) VALUES(1,?,?,?, ?,?)
    ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,lease_until=excluded.lease_until,next_attempt=excluded.next_attempt,month=excluded.month,
    reserved_queries=CASE WHEN graph_comparison.month=excluded.month THEN graph_comparison.reserved_queries+excluded.reserved_queries ELSE excluded.reserved_queries END
    WHERE graph_comparison.lease_until<? AND graph_comparison.next_attempt<=? AND (graph_comparison.month<>excluded.month OR graph_comparison.reserved_queries<=?)
    RETURNING id`,
  )
    .bind(
      owner,
      now + 180000,
      now + 3600000,
      month,
      reserved,
      now,
      now,
      3000 - reserved,
    )
    .first();
  if (!lease) return false;
  let report: unknown;
  let history: unknown;
  try {
    const result = await compare(env);
    ({ history, ...report } = result);
  } catch (error) {
    // Never serialize transport errors, URLs, headers or GraphQL response bodies.
    const reason =
      error instanceof Error &&
      /^(GRAPH|RPC|INDEXING|DEPLOYMENT|SOURCE|BLOCK_HASH|ANCHOR|CONFIRMED)_[A-Z_]+$/.test(
        error.message,
      )
        ? error.message
        : "GRAPH_COMPARISON_FAILED";
    report = { status: "failed", reason, fullHistoryVerified: false };
  }
  await env.DAO_DB.prepare(
    "UPDATE graph_comparison SET report_json=?,history_json=?,checked_at=?,lease_until=0 WHERE id=1 AND owner=? AND lease_until>?",
  )
    .bind(
      JSON.stringify(report),
      history ? JSON.stringify(history) : null,
      Date.now(),
      owner,
      Date.now(),
    )
    .run();
  return true;
}
export async function graphComparisonStatus(env: Env) {
  const reason = graphComparisonGate(env);
  const base = {
    mode: env.GRAPH_COMPARE_MODE === "shadow" ? "shadow" : "off",
    activeBackend: "D1/RPC",
    subgraphId: SUBGRAPH_ID,
    fullHistoryVerified: false,
    historyReadMode: env.GRAPH_READ_MODE === "verified" ? "verified" : "off",
    reorgAcceptance: env.GRAPH_REORG_VERIFIED === "true",
    keyPolicy: {
      subgraphRestricted: env.GRAPH_SUBGRAPH_RESTRICTED === "true",
      serverOnlyException: env.GRAPH_ALLOW_UNRESTRICTED_SERVER_KEY === "true",
    },
  };
  if (reason) return { ...base, status: "disabled", reason };
  const row = await env.DAO_DB.prepare(
    "SELECT report_json,checked_at FROM graph_comparison WHERE id=1",
  ).first<{ report_json: string | null; checked_at: number | null }>();
  if (!row?.report_json || !row.checked_at)
    return { ...base, status: "pending" };
  if (Date.now() - row.checked_at > 7200000)
    return { ...base, status: "stale", checkedAt: row.checked_at };
  return {
    ...base,
    checkedAt: row.checked_at,
    comparison: JSON.parse(row.report_json),
  };
}
