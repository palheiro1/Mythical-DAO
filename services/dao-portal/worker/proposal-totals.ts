import type { PublicClient } from "viem";
import { polygon } from "viem/chains";
import { governorAbi } from "../shared/abis";
import { governorStates, type Proposal } from "../shared/domain";
import { agreed } from "./rpc";

/** Read-only aggregate, pinned to the same block on both independent providers. */
export async function proposalTotals(
  proposals: Proposal[],
  pair: [PublicClient, PublicClient],
  blockNumber: bigint,
) {
  const contracts = proposals.flatMap((p) => {
    const base = { address: p.contract, abi: governorAbi };
    return [
      {
        ...base,
        functionName: "state" as const,
        args: [BigInt(p.id)] as const,
      },
      {
        ...base,
        functionName: "proposalVotes" as const,
        args: [BigInt(p.id)] as const,
      },
      ...(BigInt(p.snapshot) < blockNumber
        ? [
            {
              ...base,
              functionName: "quorum" as const,
              args: [BigInt(p.snapshot)] as const,
            },
          ]
        : []),
    ];
  });
  if (!contracts.length) return [];
  const values = await agreed(pair, (c) =>
    c.multicall({
      contracts,
      blockNumber,
      multicallAddress: polygon.contracts.multicall3.address,
      allowFailure: false,
      batchSize: 8192,
    }),
  );
  let i = 0;
  return proposals.map((p) => {
    const state = values[i++],
      votes = values[i++];
    if (
      typeof state !== "number" ||
      !Array.isArray(votes) ||
      votes.length !== 3 ||
      votes.some((v) => typeof v !== "bigint")
    )
      throw Error("INVALID_PROPOSAL_TOTALS");
    const result = {
      ...p,
      state: governorStates[state] ?? "Unknown",
      votes: votes.map(String),
    };
    if (BigInt(p.snapshot) < blockNumber) result.quorum = String(values[i++]);
    return result;
  });
}
