import type { Address, PublicClient } from "viem";
import { polygon } from "viem/chains";
import { governorAbi, tokenAbi } from "../shared/abis";
import { agreed } from "./rpc";

/** Display only: all values share a block and must agree across both providers. */
export async function voterStatus(
  pair: [PublicClient, PublicClient],
  governor: Address,
  mana: Address,
  proposalId: bigint,
  account: Address,
  blockNumber: bigint,
) {
  const [hasVoted, snapshot, balance] = await agreed(pair, (c) =>
    c.multicall({
      multicallAddress: polygon.contracts.multicall3.address,
      blockNumber,
      allowFailure: false,
      contracts: [
        {
          address: governor,
          abi: governorAbi,
          functionName: "hasVoted",
          args: [proposalId, account],
        },
        {
          address: governor,
          abi: governorAbi,
          functionName: "proposalSnapshot",
          args: [proposalId],
        },
        {
          address: mana,
          abi: tokenAbi,
          functionName: "balanceOf",
          args: [account],
        },
      ],
    }),
  );
  const votingPower =
    snapshot < blockNumber
      ? await agreed(pair, (c) =>
          c.readContract({
            address: governor,
            abi: governorAbi,
            functionName: "getVotes",
            args: [account, snapshot],
            blockNumber,
          }),
        )
      : null;
  return {
    hasVoted,
    account: account.toLowerCase(),
    snapshot: String(snapshot),
    votingPower: votingPower === null ? null : String(votingPower),
    currentBalance: String(balance),
    block: String(blockNumber),
    checkedAt: Date.now(),
  };
}
