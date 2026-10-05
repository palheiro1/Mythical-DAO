import {
  decodeFunctionData,
  encodeAbiParameters,
  keccak256,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { governorAbi, tokenAbi, ragequitAbi } from "../shared/abis";
import type { PortalConfig } from "../shared/domain";
import { agreed, RpcFault } from "./rpc";
import { redeemPreview } from "./ragequit";
import { validRagequitRecipient } from "../shared/ragequit-security";

type Pair = [PublicClient, PublicClient];
export async function verifyLive(cfg: PortalConfig, pair: Pair, block: bigint) {
  if (!cfg.enabled) throw new RpcFault("PORTAL_NOT_ENABLED");
  const [token] = await agreed(pair, (c) =>
    Promise.all([
      c.readContract({
        address: cfg.contracts.governor!.address,
        abi: governorAbi,
        functionName: "token",
        blockNumber: block,
      }),
      c.readContract({
        address: cfg.contracts.mana!.address,
        abi: tokenAbi,
        functionName: "totalSupply",
        blockNumber: block,
      }),
    ]),
  );
  if (token.toLowerCase() !== cfg.contracts.mana!.address)
    throw new RpcFault("GOVERNOR_TOKEN_MISMATCH");
}

/** These reads enrich the review; the actual caller's eth_call remains authoritative. */
export async function verifyOperation(
  cfg: PortalConfig,
  pair: Pair,
  block: bigint,
  tx: { account: Address; to: Address; data: Hex; value: bigint },
  attestationBlock = block,
) {
  const to = tx.to.toLowerCase();
  const governor = cfg.contracts.governor!.address,
    mana = cfg.contracts.mana!.address;
  const module = cfg.contracts.ragequitModule?.address;
  const read = (functionName: "balanceOf" | "getVotes", address = tx.account) =>
    agreed(pair, (c) =>
      c.readContract({
        address: mana,
        abi: tokenAbi,
        functionName,
        args: [address],
        blockNumber: block,
      }),
    );
  if (to === mana) {
    const call = decodeFunctionData({ abi: tokenAbi, data: tx.data });
    if (tx.value !== 0n) throw new RpcFault("UNEXPECTED_NATIVE_VALUE");
    if (call.functionName === "delegate")
      return {
        operation: "delegate",
        balance: String(await read("balanceOf")),
        representative: call.args[0],
      };
    if (
      call.functionName === "approve" &&
      module &&
      call.args[0].toLowerCase() === module &&
      call.args[1] > 0n &&
      call.args[1] <= (await read("balanceOf"))
    ) {
      const quote = await redeemPreview(
        cfg,
        pair,
        call.args[1],
        block,
        attestationBlock,
      );
      if (!quote.available) throw new RpcFault("RAGEQUIT_UNAVAILABLE");
      return {
        operation: "approve",
        spender: module,
        amount: String(call.args[1]),
      };
    }
    throw new RpcFault("UNSUPPORTED_MEMBER_OPERATION");
  }
  if (to === module) {
    const call = decodeFunctionData({ abi: ragequitAbi, data: tx.data });
    if (call.functionName !== "redeem" || tx.value !== 0n)
      throw new RpcFault("UNSUPPORTED_MEMBER_OPERATION");
    if (!validRagequitRecipient(call.args[1], cfg))
      throw new RpcFault("INVALID_RAGEQUIT_RECIPIENT");
    const quote = await redeemPreview(
      cfg,
      pair,
      call.args[0],
      block,
      attestationBlock,
    );
    if (!quote.available) throw new RpcFault("RAGEQUIT_UNAVAILABLE");
    return { operation: "redeem", module, amounts: quote.amounts };
  }
  if (to !== governor) throw new RpcFault("UNKNOWN_TRANSACTION_TARGET");
  const call = decodeFunctionData({ abi: governorAbi, data: tx.data });
  if (call.functionName !== "execute" && tx.value !== 0n)
    throw new RpcFault("UNEXPECTED_NATIVE_VALUE");
  if (call.functionName === "propose") {
    const [votes, threshold] = await agreed(pair, (c) =>
      Promise.all([
        c.readContract({
          address: governor,
          abi: governorAbi,
          functionName: "getVotes",
          args: [tx.account, block - 1n],
          blockNumber: block,
        }),
        c.readContract({
          address: governor,
          abi: governorAbi,
          functionName: "proposalThreshold",
          blockNumber: block,
        }),
      ]),
    );
    if (votes < threshold) throw new RpcFault("PROPOSAL_THRESHOLD_NOT_MET");
    return {
      operation: "propose",
      votes: String(votes),
      threshold: String(threshold),
    };
  }
  if (
    call.functionName !== "castVote" &&
    call.functionName !== "execute" &&
    call.functionName !== "cancel"
  )
    throw new RpcFault("UNSUPPORTED_GOVERNOR_OPERATION");
  const id =
    call.functionName === "castVote"
      ? call.args[0]
      : BigInt(
          keccak256(
            encodeAbiParameters(
              [
                { type: "address[]" },
                { type: "uint256[]" },
                { type: "bytes[]" },
                { type: "bytes32" },
              ],
              call.args,
            ),
          ),
        );
  const state = await agreed(pair, (c) =>
    c.readContract({
      address: governor,
      abi: governorAbi,
      functionName: "state",
      args: [id],
      blockNumber: block,
    }),
  );
  const expected = { castVote: 1, execute: 4, cancel: 0 }[call.functionName];
  if (state !== expected) throw new RpcFault("PROPOSAL_STATE_CHANGED");
  if (call.functionName === "castVote") {
    const [snapshot, voted] = await agreed(pair, (c) =>
      Promise.all([
        c.readContract({
          address: governor,
          abi: governorAbi,
          functionName: "proposalSnapshot",
          args: [id],
          blockNumber: block,
        }),
        c.readContract({
          address: governor,
          abi: governorAbi,
          functionName: "hasVoted",
          args: [id, tx.account],
          blockNumber: block,
        }),
      ]),
    );
    if (voted) throw new RpcFault("ALREADY_VOTED");
    const votes = await agreed(pair, (c) =>
      c.readContract({
        address: governor,
        abi: governorAbi,
        functionName: "getVotes",
        args: [tx.account, snapshot],
        blockNumber: block,
      }),
    );
    return {
      operation: call.functionName,
      proposalId: String(id),
      state,
      snapshot: String(snapshot),
      votes: String(votes),
    };
  }
  // cancel() itself enforces the original proposer's authority in the real Governor.
  return { operation: call.functionName, proposalId: String(id), state };
}
