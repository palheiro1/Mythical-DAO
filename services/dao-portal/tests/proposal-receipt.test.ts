import { afterEach, beforeEach, expect, it } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiParameters,
  type PublicClient,
  type Hex,
} from "viem";
import { database } from "./db-fixture";
import { config } from "../worker/config";
import manifest from "../deployments/polygon.json";
import { governorAbi } from "../shared/abis";
import { proposalHash } from "../shared/domain";
import { recoverProposal } from "../worker/proposal-receipt";
let db: Awaited<ReturnType<typeof database>>, env: Env;
beforeEach(async () => {
  db = await database();
  env = {
    ...db.bindings,
    ENVIRONMENT: "local",
    DEPLOYMENT_MANIFEST: JSON.stringify(manifest),
  } as Env;
});
afterEach(async () => {
  await db.mf.dispose();
});
it("recovers exact canonical content idempotently without advancing historical cursors", async () => {
  const cfg = config(env),
    target = cfg.contracts.gem!.address,
    governor = cfg.contracts.governor!.address;
  const hash = ("0x" + "a".repeat(64)) as Hex,
    blockHash = ("0x" + "b".repeat(64)) as Hex;
  const actions = [{ target, value: "0", data: "0x" as Hex }],
    text = "# Preserved →\n Exact content\n",
    id = proposalHash(actions, text);
  const receipt = {
    status: "success",
    to: governor,
    blockNumber: 800n,
    blockHash,
    transactionHash: hash,
    logs: [
      {
        address: governor,
        logIndex: 3,
        topics: encodeEventTopics({
          abi: governorAbi,
          eventName: "ProposalCreated",
        }),
        data: encodeAbiParameters(
          parseAbiParameters(
            "uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string",
          ),
          [BigInt(id), target, [target], [0n], [""], ["0x"], 900n, 1000n, text],
        ),
      },
    ],
  };
  const first = {
    getTransactionReceipt: async () => receipt,
    getBlock: async () => ({ hash: blockHash }),
  } as unknown as PublicClient;
  const pair: [PublicClient, PublicClient] = [first, first];
  for (let i = 0; i < 2; i++) {
    const proposal = await recoverProposal(env, cfg, pair, hash, 900n);
    expect(proposal.id).toBe(id);
    expect(proposal.description).toBe(text);
  }
  expect(
    (await db.db.prepare("SELECT COUNT(*) AS n FROM events").first())?.n,
  ).toBe(1);
  expect(
    (await db.db.prepare("SELECT COUNT(*) AS n FROM cursors").first())?.n,
  ).toBe(0);
  await expect(recoverProposal(env, cfg, pair, hash, 799n)).rejects.toThrow(
    "PROPOSAL_AWAITING_CONFIRMATIONS",
  );
  const changed = {
    ...first,
    getBlock: async () => ({ hash }),
  } as unknown as PublicClient;
  await expect(
    recoverProposal(env, cfg, [changed, changed], hash, 900n),
  ).rejects.toThrow("PROPOSAL_REORG_DETECTED");
  const divergent = {
    ...first,
    getTransactionReceipt: async () => ({ ...receipt, blockHash: hash }),
  } as unknown as PublicClient;
  await expect(
    recoverProposal(env, cfg, [first, divergent], hash, 900n),
  ).rejects.toThrow("RPC_DIVERGENCE");
  const impostor = {
    ...first,
    getTransactionReceipt: async () => ({ ...receipt, to: target }),
  } as unknown as PublicClient;
  await expect(
    recoverProposal(env, cfg, [impostor, impostor], hash, 900n),
  ).rejects.toThrow("NOT_A_GOVERNOR_PROPOSAL_RECEIPT");
});
