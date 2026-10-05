import { type Address } from "viem";
import { tokenAbi, governorAbi } from "../shared/abis";
import { stringify, type Health, type PortalConfig } from "../shared/domain";
import { eventCursor, parseCursor } from "../shared/pagination";
import {
  graphReadModel,
  graphMember,
  primaryReadsEnabled,
} from "./graph-read-model";
import { cachedRead } from "./read-cache";
import { agreed, commonHead } from "./rpc";
import { readClients } from "./infura";
import { treasury } from "./data";

const json = (value: unknown, status = 200) =>
  new Response(stringify(value), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
const beforeRow = (
  before: ReturnType<typeof parseCursor>,
  row: { block_number: number; log_index: number; contract: string },
) =>
  row.block_number < before.block ||
  (row.block_number === before.block &&
    (row.log_index < before.log ||
      (row.log_index === before.log && row.contract < before.contract)));

export async function governanceParameters(env: Env, cfg: PortalConfig) {
  const pair = readClients(env);
  const { confirmed } = await commonHead(pair, cfg);
  const [
    votingDelay,
    votingPeriod,
    proposalThreshold,
    quorumNumerator,
    quorumDenominator,
    countingMode,
  ] = await agreed(pair, (c) =>
    Promise.all([
      c.readContract({
        address: cfg.contracts.governor!.address,
        abi: governorAbi,
        functionName: "votingDelay",
        blockNumber: confirmed,
      }),
      c.readContract({
        address: cfg.contracts.governor!.address,
        abi: governorAbi,
        functionName: "votingPeriod",
        blockNumber: confirmed,
      }),
      c.readContract({
        address: cfg.contracts.governor!.address,
        abi: governorAbi,
        functionName: "proposalThreshold",
        blockNumber: confirmed,
      }),
      c.readContract({
        address: cfg.contracts.governor!.address,
        abi: governorAbi,
        functionName: "quorumNumerator",
        blockNumber: confirmed,
      }),
      c.readContract({
        address: cfg.contracts.governor!.address,
        abi: governorAbi,
        functionName: "quorumDenominator",
        blockNumber: confirmed,
      }),
      c.readContract({
        address: cfg.contracts.governor!.address,
        abi: governorAbi,
        functionName: "COUNTING_MODE",
        blockNumber: confirmed,
      }),
    ]),
  );
  return {
    votingDelay: String(votingDelay),
    votingPeriod: String(votingPeriod),
    proposalThreshold: String(proposalThreshold),
    quorumNumerator: String(quorumNumerator),
    quorumDenominator: String(quorumDenominator),
    countingMode,
    block: String(confirmed),
    timelock: false,
  };
}

/** These routes run before RPC construction: viewing data never needs an RPC. */
export async function publicReads(
  request: Request,
  env: Env,
  cfg: PortalConfig,
): Promise<Response | null> {
  if (request.method !== "GET" || !primaryReadsEnabled(env, cfg)) return null;
  const url = new URL(request.url),
    path = url.pathname;
  const detail = path.match(
    /^\/api\/proposals\/(0x[0-9a-fA-F]{40})\/(\d{1,78})$/,
  );
  const member = path.match(/^\/api\/members\/(0x[0-9a-fA-F]{40})$/);
  if (member && url.searchParams.get("live") === "true") return null;
  if (path === "/api/treasury" || path === "/api/governance-parameters") {
    const key = `${path}:${cfg.chainId}:${JSON.stringify(cfg.contracts)}`;
    if (path === "/api/governance-parameters") {
      const result = await cachedRead(env, key, "RPC", async () => {
        const data = await governanceParameters(env, cfg);
        return { data, block: data.block };
      });
      return json({ ...result.data, read: result.read });
    }
    const result = await cachedRead(env, key, "RPC", async () => {
      const pair = readClients(env),
        { confirmed } = await commonHead(pair, cfg);
      const data = {
        accounts: await treasury(cfg, pair, confirmed),
        asOfBlock: String(confirmed),
        unpaidFundsRemainRedeemable: true,
      };
      return { data, block: String(confirmed) };
    });
    return json({ ...result.data, read: result.read });
  }
  if (
    !detail &&
    !member &&
    ![
      "/api/health",
      "/api/delegates",
      "/api/proposals",
      "/api/ballots",
      "/api/events",
      "/api/overview",
    ].includes(path)
  )
    return null;
  try {
    const { data: model, read } = await graphReadModel(env, cfg);
    if (path === "/api/health")
      return json({
        status: read.status === "fresh" ? "ok" : "degraded",
        signingAllowed: false,
        operationVerification: "on-demand",
        historyComplete: false,
        head: String(model.block),
        confirmedHead: null,
        checkedAt: new Date(read.checkedAt).toISOString(),
        sources: [],
        read,
        reason:
          read.status === "stale"
            ? (read.reason ?? "READ_DATA_STALE")
            : undefined,
      } satisfies Health);
    if (member) return json({ ...graphMember(model, member[1]), read });
    if (path === "/api/delegates") {
      const active = model.accounts
        .filter((a) => BigInt(a.votingPower) > 0n)
        .sort((a, b) =>
          BigInt(a.votingPower) > BigInt(b.votingPower)
            ? -1
            : BigInt(a.votingPower) < BigInt(b.votingPower)
              ? 1
              : a.id.localeCompare(b.id),
        );
      return json({
        items: active
          .slice(0, 100)
          .map((a) => ({ address: a.id, votes: a.votingPower })),
        total: active.length,
        limitedTo: 100,
        asOfBlock: String(model.block),
        read,
      });
    }
    const proposals = model.proposals.map((p) => ({ ...p, read }));
    if (path === "/api/overview")
      return json({
        activeVotes: proposals.filter((p) => p.state === "Active").length,
        queuedExecutions: 0,
        readyForExecution: proposals.some((p) => p.state === "Ended")
          ? null
          : 0,
        indexedProposals: proposals.length,
        countsAvailable: true,
        complete: false,
        asOfBlock: String(model.block),
        read,
      });
    if (detail) {
      const p = proposals.find(
        (p) => p.contract === detail[1].toLowerCase() && p.id === detail[2],
      );
      return p ? json(p) : json({ error: "Proposal not indexed", read }, 404);
    }
    const before = parseCursor(url.searchParams.get("before"), "before");
    if (path === "/api/ballots")
      return json({
        items: [],
        nextBefore: null,
        asOfBlock: String(model.block),
        read,
      });
    if (path === "/api/proposals") {
      const rows = model.events
        .filter(
          (e) => e.event_name === "ProposalCreated" && beforeRow(before, e),
        )
        .slice(0, 20);
      return json({
        items: rows.map((e) =>
          proposals.find((p) => p.id === e.args.proposalId)!,
        ),
        nextBefore: rows.length === 20 ? eventCursor(rows.at(-1)!) : null,
        asOfBlock: String(model.block),
        read,
      });
    }
    const supplemental = await env.DAO_DB.prepare(
      "SELECT * FROM events WHERE chain_id=? AND contract NOT IN (?,?) AND block_number<=? AND (block_number,log_index,contract)<(?,?,?) ORDER BY block_number DESC,log_index DESC,contract DESC LIMIT 50",
    )
      .bind(
        cfg.chainId,
        cfg.contracts.governor!.address,
        cfg.contracts.mana!.address,
        model.block,
        before.block,
        before.log,
        before.contract,
      )
      .all<{
        chain_id: number;
        contract: Address;
        block_number: number;
        block_hash: `0x${string}`;
        tx_hash: `0x${string}`;
        log_index: number;
        event_name: string;
        args_json: string;
      }>();
    const extra = supplemental.results.map(({ args_json, ...row }) => ({
      ...row,
      args: JSON.parse(args_json),
    }));
    const rows = [...model.events.filter((e) => beforeRow(before, e)), ...extra]
      .sort(
        (a, b) =>
          b.block_number - a.block_number ||
          b.log_index - a.log_index ||
          b.contract.localeCompare(a.contract),
      )
      .slice(0, 50);
    return json({
      items: rows,
      nextBefore: rows.length === 50 ? eventCursor(rows.at(-1)!) : null,
      asOfBlock: String(model.block),
      coverage: ["Governor", "MANA"],
      supplementalHistoryComplete: false,
      read,
    });
  } catch (error) {
    if (path !== "/api/health") throw error;
    return json({
      status: "degraded",
      signingAllowed: false,
      operationVerification: "on-demand",
      historyComplete: false,
      head: null,
      confirmedHead: null,
      sources: [],
      checkedAt: new Date().toISOString(),
      reason: "PUBLIC_READ_UNAVAILABLE",
    } satisfies Health);
  }
}

/** Preserved deployed endpoint; eligibility is deliberately read live. */
export async function voterStatus(
  env: Env,
  cfg: PortalConfig,
  governor: Address,
  proposalId: bigint,
  account: Address,
) {
  const pair = readClients(env),
    { head } = await commonHead(pair, cfg);
  const [hasVoted, snapshot, balance] = await agreed(pair, (c) =>
    Promise.all([
      c.readContract({
        address: governor,
        abi: governorAbi,
        functionName: "hasVoted",
        args: [proposalId, account],
        blockNumber: head,
      }),
      c.readContract({
        address: governor,
        abi: governorAbi,
        functionName: "proposalSnapshot",
        args: [proposalId],
        blockNumber: head,
      }),
      c.readContract({
        address: cfg.contracts.mana!.address,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [account],
        blockNumber: head,
      }),
    ]),
  );
  const votingPower =
    snapshot < head
      ? await agreed(pair, (c) =>
          c.readContract({
            address: governor,
            abi: governorAbi,
            functionName: "getVotes",
            args: [account, snapshot],
            blockNumber: head,
          }),
        )
      : null;
  return {
    hasVoted,
    account: account.toLowerCase(),
    snapshot: String(snapshot),
    votingPower: votingPower === null ? null : String(votingPower),
    currentBalance: String(balance),
    block: String(head),
    checkedAt: Date.now(),
  };
}
