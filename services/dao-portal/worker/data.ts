import { treasuryAssets } from "../shared/assets";
import { syncProgress } from "../shared/sync";
import { type Address, type PublicClient } from "viem";
import { ballotsAbi, governorAbi, tokenAbi } from "../shared/abis";
import {
  MAX_INDEX_AGE_MS,
  ballotStates,
  governorStates,
  type ChainEvent,
  type Health,
  type PortalConfig,
  type Proposal,
} from "../shared/domain";
import { agreed, commonHead, rpcFailureCode } from "./rpc";
import { verifyLive } from "./live";
export type EventRow = Omit<ChainEvent, "args"> & { args_json: string };
export function eventProposal(e: EventRow, cfg: PortalConfig): Proposal {
  const a = JSON.parse(e.args_json);
  const community = e.event_name === "BallotCreated";
  return {
    chainId: e.chain_id,
    contract: e.contract,
    id: String(a.proposalId ?? a.ballotId),
    kind: community
      ? "community"
      : e.contract !== cfg.contracts.governor?.address &&
          e.contract === cfg.contracts.legacyGovernor?.address
        ? "legacy"
        : "executable",
    description: a.description,
    proposer: a.proposer ?? a.author,
    targets: a.targets ?? [],
    values: a.values ?? [],
    calldatas: a.calldatas ?? [],
    signatures: a.signatures ?? [],
    options: a.options ?? [],
    snapshot: String(a.voteStart ?? a.snapshot),
    deadline: String(a.voteEnd ?? a.deadline),
    blockNumber: String(e.block_number),
    transactionHash: e.tx_hash,
    state: "Unknown",
  };
}
export async function indexHealth(
  env: Env,
  cfg: PortalConfig,
  pair: [PublicClient, PublicClient],
  verifiedHead?: Awaited<ReturnType<typeof commonHead>>,
): Promise<Health> {
  const checkedAt = new Date().toISOString();
  const cursors = await env.DAO_DB.prepare(
    "SELECT contract,block_number,block_hash,updated_at FROM cursors WHERE chain_id=?",
  )
    .bind(cfg.chainId)
    .all<{
      contract: string;
      block_number: number;
      block_hash: string;
      updated_at: number;
    }>();
  const sources = cursors.results.map((c) => ({
    contract: c.contract,
    block: String(c.block_number),
    updatedAt: c.updated_at,
  }));
  try {
    // Only callers that already verified this request's head may pass it here.
    const { head, confirmed } = verifiedHead ?? (await commonHead(pair, cfg));
    const stored = await env.DAO_DB.prepare(
      "SELECT status,reason FROM index_health WHERE id=1",
    ).first<{ status: string; reason: string }>();
    const historySources = [cfg.contracts.governor, cfg.contracts.mana].filter(
      (e) => !!e,
    );
    let ready =
      historySources.length === 2 &&
      historySources.every((entry) =>
        cursors.results.some(
          (c) =>
            c.contract === entry.address &&
            BigInt(c.block_number) >= confirmed - 32n &&
            Date.now() - c.updated_at < MAX_INDEX_AGE_MS,
        ),
      );
    let archiveReason: string | undefined;
    // Archive anchors affect historical completeness, never authorization of a live call.
    try {
      if (ready)
        for (const c of cursors.results.filter((c) =>
          historySources.some((e) => e.address === c.contract),
        )) {
          if (
            (await agreed(
              pair,
              async (client) =>
                (await client.getBlock({ blockNumber: BigInt(c.block_number) }))
                  .hash,
            )) !== c.block_hash
          ) {
            ready = false;
            archiveReason = "INDEX_REORG_DETECTED";
          }
        }
    } catch (error) {
      ready = false;
      archiveReason = rpcFailureCode(error, "ARCHIVE_VERIFICATION_FAILED");
    }
    // Historical governance summaries depend on Governor/MANA sources; optional assets are independent.
    const degraded =
      !!archiveReason || (!ready && stored?.status === "degraded");
    let signingAllowed = false,
      liveReason: string | undefined;
    if (cfg.enabled) {
      try {
        await agreed(
          pair,
          async (c) => (await c.getBlock({ blockNumber: head })).hash,
        );
        await verifyLive(cfg, pair, head);
        signingAllowed = true;
      } catch (error) {
        liveReason = rpcFailureCode(error, "LIVE_VERIFICATION_FAILED");
        console.warn(
          JSON.stringify({
            event: "live_verification_failed",
            reason: liveReason,
          }),
        );
      }
    }
    const status = !cfg.enabled
      ? "setup"
      : degraded
        ? "degraded"
        : ready
          ? "ok"
          : "syncing";
    return {
      status,
      signingAllowed,
      historyComplete: cfg.enabled && ready && !degraded,
      liveReason,
      head: String(head),
      confirmedHead: String(confirmed),
      checkedAt,
      sources,
      sync: syncProgress(cfg, sources, String(confirmed)),
      reason: degraded
        ? (archiveReason ?? stored?.reason)
        : !cfg.enabled
          ? "Deployment has not been activated."
          : !ready
            ? "The confirmed index is catching up."
            : undefined,
    };
  } catch (error) {
    // Keep transient provider failures diagnosable without exposing credentials or request bodies.
    const reason = rpcFailureCode(error, "RPC_UNAVAILABLE");
    console.error(
      JSON.stringify({
        event: "rpc_health_failed",
        reason,
      }),
    );
    return {
      status: "degraded",
      signingAllowed: false,
      historyComplete: false,
      liveReason: reason,
      head: null,
      confirmedHead: null,
      checkedAt,
      sources,
      sync: syncProgress(cfg, sources, null),
      reason,
    };
  }
}
export async function hydrate(
  p: Proposal,
  pair: [PublicClient, PublicClient],
  blockNumber: bigint,
): Promise<Proposal> {
  const id = BigInt(p.id),
    address = p.contract;
  if (p.kind === "community") {
    const state = await agreed(pair, (c) =>
      c.readContract({
        address,
        abi: ballotsAbi,
        functionName: "state",
        args: [id],
        blockNumber,
      }),
    );
    p.state = ballotStates[state] ?? "Unknown";
    p.votes = (
      await agreed(pair, async (c) =>
        Promise.all(
          Array.from({ length: p.options.length + 1 }, (_, i) =>
            c.readContract({
              address,
              abi: ballotsAbi,
              functionName: "optionVotes",
              args: [id, i],
              blockNumber,
            }),
          ),
        ),
      )
    ).map(String);
    const [winner, quorumReached, tied] = await agreed(pair, (c) =>
      c.readContract({
        address,
        abi: ballotsAbi,
        functionName: "result",
        args: [id],
        blockNumber,
      }),
    );
    Object.assign(p, { winner, quorumReached, tied });
  } else {
    const [state, votes] = await agreed(pair, async (c) =>
      Promise.all([
        c.readContract({
          address,
          abi: governorAbi,
          functionName: "state",
          args: [id],
          blockNumber,
        }),
        c.readContract({
          address,
          abi: governorAbi,
          functionName: "proposalVotes",
          args: [id],
          blockNumber,
        }),
      ]),
    );
    p.state = governorStates[state] ?? "Unknown";
    p.votes = votes.map(String);

    if (BigInt(p.snapshot) < blockNumber)
      p.quorum = String(
        await agreed(pair, (c) =>
          c.readContract({
            address,
            abi: governorAbi,
            functionName: "quorum",
            args: [BigInt(p.snapshot)],
            blockNumber,
          }),
        ),
      );
  }
  return p;
}
export async function treasury(
  cfg: PortalConfig,
  pair: [PublicClient, PublicClient],
  blockNumber: bigint,
) {
  const assets = treasuryAssets(cfg);
  const account = cfg.contracts.treasury!.address;
  return [
    {
      role: "treasury",
      address: account,
      assets: await Promise.all(
        assets.map(async (asset) => ({
          ...asset,
          balance: String(
            await agreed(pair, (c) =>
              asset.address
                ? c.readContract({
                    address: asset.address,
                    abi: tokenAbi,
                    functionName: "balanceOf",
                    args: [account],
                    blockNumber,
                  })
                : c.getBalance({ address: account, blockNumber }),
            ),
          ),
          allowance:
            asset.ragequit && cfg.contracts.ragequitModule && asset.address
              ? String(
                  await agreed(pair, (c) =>
                    c.readContract({
                      address: asset.address!,
                      abi: tokenAbi,
                      functionName: "allowance",
                      args: [account, cfg.contracts.ragequitModule!.address],
                      blockNumber,
                    }),
                  ),
                )
              : "0",
        })),
      ),
    },
  ];
}
