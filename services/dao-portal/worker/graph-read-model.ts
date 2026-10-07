import { zeroAddress, type Address, type Hex } from "viem";
import {
  proposalHash,
  type ChainEvent,
  type PortalConfig,
  type Proposal,
} from "../shared/domain";
import {
  GOVERNOR,
  MANA,
  GATEWAY_URL,
  PILOT_DEPLOYMENT,
  graphQuery,
  validateMeta,
  validatePilotSnapshot,
  requireValue,
  type PilotAccount,
  type PilotProposal,
  type PilotSnapshot,
} from "../shared/graph-pilot.mjs";
import { cachedRead, reserveGraphRead } from "./read-cache";

type IndexedProposal = PilotProposal & {
  createdBlock: string;
  createdBlockHash: Hex;
  createdTransaction: Hex;
};
type RecordRow = {
  id: string;
  contract: Address;
  name: string;
  blockNumber: string;
  blockHash: Hex;
  transactionHash: Hex;
  logIndex: string;
  proposal: { proposalId: string } | null;
  voter: Address | null;
  support: number | null;
  weight: string | null;
  reason: string | null;
  from: Address | null;
  to: Address | null;
  owner: Address | null;
  spender: Address | null;
  value: string | null;
  account: Address | null;
  fromDelegate: Address | null;
  toDelegate: Address | null;
  previousVotes: string | null;
  newVotes: string | null;
};
type Meta = {
  deployment: string;
  hasIndexingErrors: boolean;
  block: { number: number; hash: Hex; timestamp: number };
};
type Snapshot = Omit<PilotSnapshot, "proposals"> & {
  _meta: Meta;
  proposals: IndexedProposal[];
  eventRecords: RecordRow[];
};
export interface GraphReadModel {
  deployment: string;
  block: number;
  hash: Hex;
  timestamp: number;
  supply: string;
  accounts: PilotAccount[];
  proposals: Proposal[];
  events: ChainEvent[];
}
const META_FIELDS = "deployment hasIndexingErrors block{number hash timestamp}";
const ACCOUNT_FIELDS = "id balance votingPower delegate";
const PROPOSAL_FIELDS =
  "id proposalId governor proposer description targets values signatures calldatas voteStart voteEnd createdBlock createdBlockHash createdTransaction againstVotes forVotes abstainVotes executed canceled";
const EVENT_FIELDS =
  "id contract name blockNumber blockHash transactionHash logIndex proposal{proposalId} voter support weight reason from to owner spender value account fromDelegate toDelegate previousVotes newVotes";
export const primarySnapshotQuery = `query PortalReadSnapshot($hash:Bytes!){
  _meta(block:{hash:$hash}){${META_FIELDS}}
  pilotStats(id:"137",block:{hash:$hash}){chainId governor mana governorStartBlock manaStartBlock totalSupply holders proposals votes transfers delegationChanges}
  manaAccounts(first:500,orderBy:id,orderDirection:asc,block:{hash:$hash}){${ACCOUNT_FIELDS}}
  proposals(first:100,orderBy:id,orderDirection:asc,block:{hash:$hash}){${PROPOSAL_FIELDS}}
  eventRecords(first:1000,orderBy:id,orderDirection:asc,block:{hash:$hash}){${EVENT_FIELDS}}
}`;
const hex32 = (value: unknown): value is Hex =>
  typeof value === "string" && /^0x[0-9a-f]{64}$/.test(value);
const uint = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(0|[1-9]\d{0,77})$/.test(value) &&
  BigInt(value) < 2n ** 256n;
const address = (value: unknown): value is Address =>
  typeof value === "string" && /^0x[0-9a-f]{40}$/.test(value);

export function primaryReadsEnabled(env: Env, cfg: PortalConfig) {
  return (
    env.GRAPH_READ_MODE === "primary" && cfg.enabled && cfg.chainId === 137
  );
}

export function normalizeGraphSnapshot(
  input: unknown,
  hash: Hex,
): GraphReadModel {
  const raw = input as Snapshot;
  const snapshot = validatePilotSnapshot(raw, raw?._meta?.block?.number, hash, {
    accounts: 5000,
    proposals: 500,
  });
  const meta = raw._meta;
  requireValue(
    Number.isSafeInteger(meta.block.timestamp) &&
      meta.block.timestamp > 0 &&
      meta.block.timestamp * 1000 <= Date.now() + 30_000,
    "GRAPH_TIMESTAMP_INVALID",
  );
  requireValue(
    Array.isArray(raw.eventRecords) && raw.eventRecords.length <= 10000,
    "GRAPH_EVENT_LIMIT",
  );
  const proposals: Proposal[] = raw.proposals.map((p) => {
    requireValue(
      uint(p.createdBlock) &&
        Number(p.createdBlock) >= 48674443 &&
        Number(p.createdBlock) <= meta.block.number &&
        hex32(p.createdBlockHash) &&
        hex32(p.createdTransaction),
      "GRAPH_PROPOSAL_ORIGIN_INVALID",
    );
    requireValue(
      proposalHash(
        p.targets.map((target, i) => ({
          target,
          value: p.values[i],
          data: p.calldatas[i],
        })),
        p.description,
      ) === p.proposalId,
      "GRAPH_PROPOSAL_CONTENT_MISMATCH",
    );
    return {
      chainId: 137,
      contract: GOVERNOR,
      id: p.proposalId,
      kind: "executable",
      description: p.description,
      proposer: p.proposer,
      targets: p.targets,
      values: p.values,
      calldatas: p.calldatas,
      signatures: p.signatures,
      options: [],
      snapshot: p.voteStart,
      deadline: p.voteEnd,
      blockNumber: p.createdBlock,
      transactionHash: p.createdTransaction,
      votes: [p.againstVotes, p.forVotes, p.abstainVotes],
      // The published schema does not contain historical quorum parameters.
      // An ended vote is never guessed to be approved/defeated from totals alone.
      state: p.executed
        ? "Executed"
        : p.canceled
          ? "Canceled"
          : BigInt(p.voteStart) >= BigInt(meta.block.number)
            ? "Pending"
            : BigInt(p.voteEnd) >= BigInt(meta.block.number)
              ? "Active"
              : "Ended",
    };
  });
  const seen = new Set<string>();
  let previous = "";
  const events = raw.eventRecords.map((e): ChainEvent => {
    requireValue(
      typeof e.id === "string" && /^0x[0-9a-f]+$/.test(e.id) && e.id > previous,
      "GRAPH_EVENT_ORDER_INVALID",
    );
    previous = e.id;
    requireValue(
      [GOVERNOR, MANA].includes(e.contract) &&
        uint(e.blockNumber) &&
        Number.isSafeInteger(Number(e.blockNumber)) &&
        Number(e.blockNumber) >= (e.contract === MANA ? 45785116 : 48674443) &&
        Number(e.blockNumber) <= meta.block.number &&
        uint(e.logIndex) &&
        Number.isSafeInteger(Number(e.logIndex)) &&
        hex32(e.blockHash) &&
        hex32(e.transactionHash),
      "GRAPH_EVENT_INVALID",
    );
    const key = `${e.transactionHash}:${e.logIndex}`;
    requireValue(!seen.has(key), "GRAPH_EVENT_DUPLICATE");
    seen.add(key);
    const args: Record<string, unknown> = {};
    if (e.contract === GOVERNOR) {
      const p = proposals.find((p) => p.id === e.proposal?.proposalId);
      requireValue(p, "GRAPH_EVENT_PROPOSAL_MISSING");
      args.proposalId = p.id;
      if (e.name === "ProposalCreated") {
        requireValue(
          p.transactionHash === e.transactionHash &&
            p.blockNumber === e.blockNumber,
          "GRAPH_PROPOSAL_EVENT_MISMATCH",
        );
        Object.assign(args, {
          proposer: p.proposer,
          targets: p.targets,
          values: p.values,
          signatures: p.signatures,
          calldatas: p.calldatas,
          voteStart: p.snapshot,
          voteEnd: p.deadline,
          description: p.description,
        });
      } else if (e.name === "VoteCast") {
        requireValue(
          address(e.voter) &&
            [0, 1, 2].includes(e.support!) &&
            uint(e.weight) &&
            (e.reason === null || typeof e.reason === "string"),
          "GRAPH_VOTE_INVALID",
        );
        Object.assign(args, {
          voter: e.voter,
          support: e.support,
          weight: e.weight,
          reason: e.reason ?? "",
        });
      } else
        requireValue(
          ["ProposalExecuted", "ProposalCanceled"].includes(e.name),
          "GRAPH_EVENT_NAME_INVALID",
        );
    } else if (e.name === "Transfer" || e.name === "Approval") {
      const a = e.name === "Transfer" ? e.from : e.owner;
      const b = e.name === "Transfer" ? e.to : e.spender;
      requireValue(
        address(a) && address(b) && uint(e.value),
        "GRAPH_TOKEN_EVENT_INVALID",
      );
      Object.assign(
        args,
        e.name === "Transfer"
          ? { from: a, to: b, value: e.value }
          : { owner: a, spender: b, value: e.value },
      );
    } else if (e.name === "DelegateChanged") {
      requireValue(
        address(e.account) && address(e.fromDelegate) && address(e.toDelegate),
        "GRAPH_DELEGATE_INVALID",
      );
      Object.assign(args, {
        delegator: e.account,
        fromDelegate: e.fromDelegate,
        toDelegate: e.toDelegate,
      });
    } else if (e.name === "DelegateVotesChanged") {
      requireValue(
        address(e.account) && uint(e.previousVotes) && uint(e.newVotes),
        "GRAPH_DELEGATE_INVALID",
      );
      Object.assign(args, {
        delegate: e.account,
        previousVotes: e.previousVotes,
        newVotes: e.newVotes,
      });
    } else throw Error("GRAPH_EVENT_NAME_INVALID");
    return {
      chain_id: 137,
      contract: e.contract,
      block_number: Number(e.blockNumber),
      block_hash: e.blockHash,
      tx_hash: e.transactionHash,
      log_index: Number(e.logIndex),
      event_name: e.name,
      args,
    };
  });
  for (const [name, count] of [
    ["ProposalCreated", snapshot.pilotStats.proposals],
    ["VoteCast", snapshot.pilotStats.votes],
    ["Transfer", snapshot.pilotStats.transfers],
    ["DelegateChanged", snapshot.pilotStats.delegationChanges],
  ])
    requireValue(
      String(events.filter((e) => e.event_name === name).length) === count,
      "GRAPH_EVENT_TOTALS_MISMATCH",
    );
  events.sort(
    (a, b) =>
      b.block_number - a.block_number ||
      b.log_index - a.log_index ||
      b.contract.localeCompare(a.contract),
  );
  proposals.sort((a, b) => Number(b.blockNumber) - Number(a.blockNumber));
  return {
    deployment: PILOT_DEPLOYMENT,
    block: meta.block.number,
    hash,
    timestamp: meta.block.timestamp * 1000,
    supply: snapshot.pilotStats.totalSupply,
    accounts: snapshot.manaAccounts,
    proposals,
    events,
  };
}

export async function graphReadModel(env: Env, cfg: PortalConfig) {
  requireValue(
    cfg.chainId === 137 &&
      cfg.contracts.governor?.address === GOVERNOR &&
      cfg.contracts.mana?.address === MANA,
    "GRAPH_CONFIG_MISMATCH",
  );
  return cachedRead(
    env,
    `graph-primary-v1:${PILOT_DEPLOYMENT}`,
    "The Graph",
    async () => {
      const key = "GRAPH_API_KEY" in env ? env.GRAPH_API_KEY : undefined;
      requireValue(
        typeof key === "string" && /^[a-zA-Z0-9_-]{16,256}$/.test(key),
        "GRAPH_KEY_MISSING",
      );
      requireValue(
        env.GRAPH_SUBGRAPH_RESTRICTED === "true" ||
          env.GRAPH_ALLOW_UNRESTRICTED_SERVER_KEY === "true",
        "GRAPH_KEY_RESTRICTION_PENDING",
      );
      const started = Date.now();
      const query = async <T>(
        q: string,
        variables: Record<string, unknown> = {},
      ) => {
        requireValue(Date.now() - started < 55_000, "GRAPH_REFRESH_TIMEOUT");
        await reserveGraphRead(env);
        return graphQuery<T>(GATEWAY_URL, q, variables, fetch, { apiKey: key });
      };
      const latest = await query<{ _meta: Meta }>(`{_meta{${META_FIELDS}}}`);
      validateMeta(latest._meta, PILOT_DEPLOYMENT);
      requireValue(hex32(latest._meta.block.hash), "GRAPH_BLOCK_HASH_MISSING");
      const hash = latest._meta.block.hash;
      const raw = await query<Snapshot>(primarySnapshotQuery, { hash });
      // Every page is pinned to the same hash; completeness never relies on the
      // first page being large enough. Limits bound CPU/memory and query spending.
      for (const [field, size, limit, fields, cursorType] of [
        ["manaAccounts", 500, 5000, ACCOUNT_FIELDS, "Bytes!"],
        ["proposals", 100, 500, PROPOSAL_FIELDS, "ID!"],
        ["eventRecords", 1000, 10000, EVENT_FIELDS, "Bytes!"],
      ] as const) {
        const rows = raw[field];
        requireValue(Array.isArray(rows), "GRAPH_COLLECTION_MISSING");
        let length = rows.length;
        while (length === size) {
          requireValue(rows.length < limit, "GRAPH_COLLECTION_LIMIT");
          const after = rows.at(-1)!.id;
          const next = await query<Record<string, { id: string }[]>>(
            `query($hash:Bytes!,$after:${cursorType}){${field}(first:${size},orderBy:id,orderDirection:asc,where:{id_gt:$after},block:{hash:$hash}){${fields}}}`,
            { hash, after },
          );
          const page = next[field];
          requireValue(
            Array.isArray(page) &&
              page.length <= size &&
              page.every(
                (r, i) =>
                  typeof r.id === "string" &&
                  r.id > (i ? page[i - 1].id : after),
              ),
            "GRAPH_PAGE_ORDER_INVALID",
          );
          // Collections are fully validated together before they reach storage.
          (rows as { id: string }[]).push(...page);
          length = page.length;
        }
      }
      const model = normalizeGraphSnapshot(raw, hash);
      return {
        data: model,
        block: String(model.block),
        blockTimestamp: model.timestamp,
      };
    },
  );
}

export function graphMember(model: GraphReadModel, account: string) {
  const row = model.accounts.find((a) => a.id === account.toLowerCase());
  return {
    balance: row?.balance ?? "0",
    votes: row?.votingPower ?? "0",
    delegate: row?.delegate ?? zeroAddress,
    supply: model.supply,
    allowance: null,
    asOfBlock: String(model.block),
  };
}
