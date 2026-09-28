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
import { agreed, commonHead, RpcFault } from "./rpc";
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
      : e.contract === cfg.contracts.legacyGovernor?.address
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
    const { head, confirmed } = await commonHead(pair, cfg);
    const stored = await env.DAO_DB.prepare(
      "SELECT status,reason FROM index_health WHERE id=1",
    ).first<{ status: string; reason: string }>();
    const ready = Object.values(cfg.contracts).every((entry) =>
      cursors.results.some(
        (c) =>
          c.contract === entry.address &&
          BigInt(c.block_number) >= confirmed - 32n &&
          Date.now() - c.updated_at < MAX_INDEX_AGE_MS,
      ),
    );
    // Check each persisted anchor against both providers before declaring indexed data safe to sign against.
    if (ready)
      for (const c of cursors.results) {
        if (
          (await agreed(
            pair,
            async (client) =>
              (await client.getBlock({ blockNumber: BigInt(c.block_number) }))
                .hash,
          )) !== c.block_hash
        )
          throw new RpcFault("INDEX_REORG_DETECTED");
      }
    const degraded = stored?.status === "degraded";
    const status = !cfg.enabled
      ? "setup"
      : degraded
        ? "degraded"
        : ready
          ? "ok"
          : "syncing";
    return {
      status,
      signingAllowed: cfg.enabled && ready && !degraded,
      head: String(head),
      confirmedHead: String(confirmed),
      checkedAt,
      sources,
      reason: degraded
        ? stored.reason
        : !cfg.enabled
          ? "Deployment has not been activated."
          : !ready
            ? "The confirmed index is catching up."
            : undefined,
    };
  } catch (error) {
    return {
      status: "degraded",
      signingAllowed: false,
      head: null,
      confirmedHead: null,
      checkedAt,
      sources,
      reason: error instanceof RpcFault ? error.code : "RPC_UNAVAILABLE",
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
    const [state, votes, eta] = await agreed(pair, async (c) =>
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
        c.readContract({
          address,
          abi: governorAbi,
          functionName: "proposalEta",
          args: [id],
          blockNumber,
        }),
      ]),
    );
    p.state = governorStates[state] ?? "Unknown";
    p.votes = votes.map(String);
    p.eta = String(eta);
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
  const assets = [
    { symbol: "POL", address: null, decimals: 18 },
    { symbol: "WETH", address: cfg.contracts.weth?.address, decimals: 18 },
    { symbol: "USDC.e", address: cfg.contracts.usdc?.address, decimals: 6 },
  ];
  const accounts = [
    { role: "vault", address: cfg.contracts.vault?.address },
    { role: "legacy", address: cfg.contracts.legacyGovernor?.address },
  ];
  return Promise.all(
    accounts
      .filter((a) => a.address)
      .map(async (account) => ({
        ...account,
        assets: await Promise.all(
          assets.map(async (asset) => ({
            ...asset,
            balance: String(
              await agreed(pair, (c) =>
                asset.symbol === "POL"
                  ? c.getBalance({ address: account.address!, blockNumber })
                  : c.readContract({
                      address: asset.address as Address,
                      abi: tokenAbi,
                      functionName: "balanceOf",
                      args: [account.address!],
                      blockNumber,
                    }),
              ),
            ),
          })),
        ),
      })),
  );
}
