import {
  decodeEventLog,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { governorAbi } from "../shared/abis";
import { stringify } from "../shared/domain";
import {
  GOVERNOR,
  requireValue,
  type PilotSnapshot,
} from "../shared/graph-pilot.mjs";
import type { EventRow } from "./data";
import { agreed, settledValues } from "./rpc";

export const historySnapshotQuery = `query($hash:Bytes!){
  eventRecords(first:101,orderBy:id,orderDirection:asc,block:{hash:$hash},where:{contract:"${GOVERNOR}"}){
    contract name blockNumber blockHash transactionHash logIndex
  }
}`;
export interface GraphHistory {
  anchor: number;
  hash: Hex;
  events: EventRow[];
  delegateCandidates: Address[];
  fullHistoryVerified: false;
}
const names = [
  "ProposalCreated",
  "VoteCast",
  "ProposalExecuted",
  "ProposalCanceled",
];
const hex32 = (x: unknown): x is Hex =>
  typeof x === "string" && /^0x[0-9a-f]{64}$/.test(x);

/** Graph discovers blocks; only independently agreed, decoded RPC logs reach the portal. */
export async function verifyGraphHistory(
  snapshot: PilotSnapshot,
  input: unknown,
  pair: [PublicClient, PublicClient],
  checkTime: () => void,
): Promise<GraphHistory> {
  requireValue(
    Array.isArray(input) && input.length <= 100,
    "GRAPH_HISTORY_EVENT_LIMIT",
  );
  const anchor = snapshot._meta.block.number;
  const keys = new Set<string>();
  for (const e of input) {
    requireValue(
      e &&
        e.contract === GOVERNOR &&
        names.includes(e.name) &&
        /^\d+$/.test(e.blockNumber) &&
        Number.isSafeInteger(Number(e.blockNumber)) &&
        Number(e.blockNumber) >= 48674443 &&
        Number(e.blockNumber) <= anchor &&
        hex32(e.blockHash) &&
        hex32(e.transactionHash) &&
        /^\d+$/.test(e.logIndex) &&
        Number.isSafeInteger(Number(e.logIndex)),
      "GRAPH_HISTORY_EVENT_INVALID",
    );
    const key = `${e.transactionHash}:${e.logIndex}`;
    requireValue(!keys.has(key), "GRAPH_HISTORY_DUPLICATE");
    keys.add(key);
  }
  const blocks = [...new Set<number>(input.map((e) => Number(e.blockNumber)))];
  requireValue(blocks.length <= 15, "GRAPH_HISTORY_BLOCK_LIMIT");
  const events: EventRow[] = [];
  // Three independent blocks per provider fit its existing JSON-RPC batch.
  // This saves HTTP subrequests without weakening either provider's checks.
  for (let offset = 0; offset < blocks.length; offset += 3) {
    const group = await settledValues(
      blocks.slice(offset, offset + 3).map(async (block) => {
        checkTime();
        const canonical = await agreed(pair, async (c) => {
          const logs = await c.getLogs({
            address: GOVERNOR,
            fromBlock: BigInt(block),
            toBlock: BigInt(block),
          });
          return logs.flatMap((log) => {
            let decoded;
            try {
              decoded = decodeEventLog({
                abi: governorAbi,
                data: log.data,
                topics: log.topics,
                strict: true,
              });
            } catch {
              return [];
            }
            if (!names.includes(decoded.eventName)) return [];
            requireValue(
              !log.removed &&
                log.blockNumber === BigInt(block) &&
                hex32(log.blockHash) &&
                hex32(log.transactionHash) &&
                log.logIndex !== null &&
                log.address.toLowerCase() === GOVERNOR,
              "GRAPH_HISTORY_RPC_LOG_INVALID",
            );
            return [
              {
                chain_id: 137,
                contract: GOVERNOR,
                block_number: block,
                block_hash: log.blockHash,
                tx_hash: log.transactionHash,
                log_index: log.logIndex,
                event_name: decoded.eventName,
                args_json: stringify(decoded.args),
              },
            ];
          });
        });
        const claimed = input.filter((e) => Number(e.blockNumber) === block);
        requireValue(
          canonical.length === claimed.length &&
            canonical.every((e) =>
              claimed.some(
                (x) =>
                  x.transactionHash === e.tx_hash &&
                  Number(x.logIndex) === e.log_index &&
                  x.blockHash === e.block_hash &&
                  x.name === e.event_name,
              ),
            ),
          "GRAPH_HISTORY_LOG_MISMATCH",
        );
        return canonical;
      }),
    );
    events.push(...group.flat());
  }
  const created = events.filter((e) => e.event_name === "ProposalCreated");
  requireValue(
    String(events.filter((e) => e.event_name === "VoteCast").length) ===
      snapshot.pilotStats.votes,
    "GRAPH_HISTORY_VOTE_COUNT_MISMATCH",
  );
  requireValue(
    created.length === snapshot.proposals.length,
    "GRAPH_HISTORY_PROPOSAL_MISMATCH",
  );
  for (const p of snapshot.proposals) {
    for (const [name, expected] of [
      ["ProposalExecuted", p.executed],
      ["ProposalCanceled", p.canceled],
    ] as const)
      requireValue(
        events.some(
          (e) =>
            e.event_name === name &&
            JSON.parse(e.args_json).proposalId === p.proposalId,
        ) === expected,
        "GRAPH_HISTORY_STATE_MISMATCH",
      );
    const e = created.find(
      (e) => JSON.parse(e.args_json).proposalId === p.proposalId,
    );
    requireValue(e, "GRAPH_HISTORY_PROPOSAL_MISMATCH");
    const args = JSON.parse(e.args_json);
    for (const key of [
      "proposer",
      "description",
      "targets",
      "values",
      "signatures",
      "calldatas",
      "voteStart",
      "voteEnd",
    ] as const) {
      // Normalize address/hex case, preserving description bytes.
      const normalize = (v: unknown): unknown =>
        key === "description"
          ? v
          : Array.isArray(v)
            ? v.map(normalize)
            : typeof v === "string" && v.startsWith("0x")
              ? v.toLowerCase()
              : v;
      requireValue(
        stringify(normalize(args[key])) === stringify(normalize(p[key])),
        "GRAPH_HISTORY_PROPOSAL_MISMATCH",
      );
    }
  }
  return {
    anchor,
    hash: snapshot._meta.block.hash,
    events,
    // Candidate discovery only. Displayed power is always read again from both RPCs.
    delegateCandidates: snapshot.manaAccounts
      .filter((a) => BigInt(a.votingPower) > 0n)
      .map((a) => a.id),
    fullHistoryVerified: false,
  };
}

export function mergeHistoryRows(
  a: EventRow[],
  b: EventRow[],
  limit: number,
): EventRow[] {
  const rows = new Map<string, EventRow>();
  // Canonical RPC-verified supplemental rows win for the same event identity.
  for (const e of [...a, ...b])
    rows.set(`${e.chain_id}:${e.contract}:${e.tx_hash}:${e.log_index}`, e);
  return [...rows.values()]
    .sort(
      (x, y) =>
        y.block_number - x.block_number ||
        y.log_index - x.log_index ||
        (x.contract < y.contract ? 1 : x.contract > y.contract ? -1 : 0),
    )
    .slice(0, limit);
}
