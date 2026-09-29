import { decodeEventLog, type Hex, type PublicClient } from "viem";
import { governorAbi } from "../shared/abis";
import { stringify, verifyProposal, type PortalConfig } from "../shared/domain";
import { eventProposal, type EventRow } from "./data";
import { agreed, RpcFault } from "./rpc";

/** Bounded receipt recovery, with no archive scan and no advancement of cursors. */
export async function recoverProposal(
  env: Env,
  cfg: PortalConfig,
  pair: [PublicClient, PublicClient],
  hash: Hex,
  confirmed: bigint,
) {
  const receipt = await agreed(pair, async (c) => {
    const r = await c.getTransactionReceipt({ hash });
    return {
      status: r.status,
      to: r.to?.toLowerCase(),
      blockNumber: r.blockNumber,
      blockHash: r.blockHash,
      transactionHash: r.transactionHash,
      logs: r.logs.map((l) => ({
        address: l.address.toLowerCase(),
        data: l.data,
        topics: l.topics,
        logIndex: l.logIndex,
      })),
    };
  });
  const governor = cfg.contracts.governor!.address;
  if (receipt.status !== "success" || receipt.to !== governor)
    throw new RpcFault("NOT_A_GOVERNOR_PROPOSAL_RECEIPT");
  if (receipt.blockNumber > confirmed)
    throw new RpcFault("PROPOSAL_AWAITING_CONFIRMATIONS");
  if (
    (await agreed(
      pair,
      async (c) =>
        (await c.getBlock({ blockNumber: receipt.blockNumber })).hash,
    )) !== receipt.blockHash
  )
    throw new RpcFault("PROPOSAL_REORG_DETECTED");
  for (const log of receipt.logs) {
    if (log.address !== governor) continue;
    let decoded;
    try {
      decoded = decodeEventLog({
        abi: governorAbi,
        data: log.data,
        topics: log.topics,
      });
    } catch {
      continue;
    }
    if (decoded.eventName !== "ProposalCreated") continue;
    const row: EventRow = {
      chain_id: cfg.chainId,
      contract: governor,
      block_number: Number(receipt.blockNumber),
      block_hash: receipt.blockHash,
      tx_hash: receipt.transactionHash,
      log_index: log.logIndex,
      event_name: "ProposalCreated",
      args_json: stringify(decoded.args),
    };
    const proposal = eventProposal(row, cfg);
    verifyProposal(proposal);
    await env.DAO_DB.prepare(
      "INSERT OR REPLACE INTO events(chain_id,contract,block_number,block_hash,tx_hash,log_index,event_name,args_json) VALUES(?,?,?,?,?,?,?,?)",
    )
      .bind(
        row.chain_id,
        row.contract,
        row.block_number,
        row.block_hash,
        row.tx_hash,
        row.log_index,
        row.event_name,
        row.args_json,
      )
      .run();
    return proposal;
  }
  throw new RpcFault("PROPOSAL_EVENT_NOT_FOUND");
}
