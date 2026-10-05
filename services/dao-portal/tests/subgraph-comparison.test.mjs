import { test, expect } from "vitest";
import { encodeEventTopics, encodeAbiParameters } from "viem";
import { readFileSync } from "node:fs";
import {
  fromLog,
  comparisonRpcUrls,
  verifyGovernorInventory,
  reconcileD1Governor,
} from "../scripts/compare-subgraph.mjs";
const abi = JSON.parse(
  readFileSync(
    new URL("../../dao-subgraph/abis/Governor.json", import.meta.url),
  ),
);
const governor = "0x7b9e327748462f1038c9d081c98d189b22c60a27";
const member = "0x0000000000000000000000000000000000000001";
test("D1 reconciliation preserves existing rows and distinguishes ahead-of-anchor events", () => {
  const args = {
    voter: member,
    proposalId: "42",
    support: 1,
    weight: "5",
    reason: "",
  };
  const original = log("VoteCast", { ...args, proposalId: 42n, weight: 5n });
  const canonical = fromLog(original);
  const indexed = {
    ...canonical,
    reason: null,
    proposal: { proposalId: "42" },
  };
  const row = {
    chain_id: 137,
    contract: governor,
    block_number: 50000000,
    block_hash: original.blockHash,
    tx_hash: original.transactionHash,
    log_index: original.logIndex,
    event_name: "VoteCast",
    args_json: JSON.stringify(args),
  };
  expect(reconcileD1Governor([indexed], [row], 50000000)).toMatchObject({
    matched: 1,
    aheadOfAnchor: 0,
    indexedEventsNotInD1: 0,
    completeHistoryVerified: false,
  });
  expect(reconcileD1Governor([], [row], 49999999)).toMatchObject({
    matched: 0,
    aheadOfAnchor: 1,
  });
  expect(reconcileD1Governor([indexed], [], 50000000)).toMatchObject({
    indexedEventsNotInD1: 1,
  });
  expect(() => reconcileD1Governor([], [row], 50000000)).toThrow(
    "D1_EVENT_MISSING_FROM_GRAPH",
  );
  expect(() =>
    reconcileD1Governor([indexed], [{ ...row, chain_id: 1 }], 50000000),
  ).toThrow("D1_SOURCE_MISMATCH");
  expect(() =>
    reconcileD1Governor(
      [indexed],
      [{ ...row, args_json: JSON.stringify({ ...args, reason: "Changed" }) }],
      50000000,
    ),
  ).toThrow("EVENT_SAMPLE_MISMATCH");
  expect(() => reconcileD1Governor([indexed], [row, row], 50000000)).toThrow(
    "D1_DUPLICATE_EVENT",
  );
});
test("Infura comparison requires explicit opt-in and a local key", () => {
  const env = { INFURA_API_KEY: "test-only-not-a-real-key" };
  expect(comparisonRpcUrls(env)[0]).toBe("https://polygon.drpc.org");
  expect(comparisonRpcUrls(env, true)).toEqual([
    `https://polygon-mainnet.infura.io/v3/${env.INFURA_API_KEY}`,
    "https://tenderly.rpc.polygon.community",
  ]);
  expect(() => comparisonRpcUrls({}, true)).toThrow("INFURA_KEY_REQUIRED");
  expect(() =>
    comparisonRpcUrls({ INFURA_API_KEY: "key?injected=value" }, true),
  ).toThrow("INFURA_KEY_REQUIRED");
  expect(
    comparisonRpcUrls({ GRAPH_RPC_PRIMARY: "https://example.com" })[0],
  ).toBe("https://example.com");
});
function log(name, args) {
  const event = abi.find((e) => e.name === name);
  return {
    address: governor,
    blockNumber: 50000000n,
    blockHash: "0x" + "a".repeat(64),
    transactionHash: "0x" + "b".repeat(64),
    transactionIndex: 2,
    logIndex: 3,
    topics: encodeEventTopics({ abi, eventName: name, args }),
    data: encodeAbiParameters(
      event.inputs.filter((i) => !i.indexed),
      event.inputs.filter((i) => !i.indexed).map((i) => args[i.name]),
    ),
    providerExtra: "ignored",
  };
}
test("comparison preserves proposal ID, byte arrays, signatures and description case", () => {
  const p = fromLog(
    log("ProposalCreated", {
      proposalId: 42n,
      proposer: member,
      targets: [member],
      values: [0n],
      signatures: ["Transfer(address,uint256)"],
      calldatas: ["0x0000abcd"],
      voteStart: 50000001n,
      voteEnd: 50000002n,
      description: "0xABC Title\nSecond Line",
    }),
  );
  expect(p.proposalId).toBe("42");
  expect(p.proposal.description).toBe("0xABC Title\nSecond Line");
  expect(p.proposal.signatures).toEqual(["Transfer(address,uint256)"]);
  expect(p.proposal.calldatas).toEqual(["0x0000abcd"]);
  expect(p.providerExtra).toBeUndefined();
});
test("comparison preserves vote reason text and all canonical event metadata", () => {
  const p = fromLog(
    log("VoteCast", {
      voter: member,
      proposalId: 42n,
      support: 1,
      weight: 5n,
      reason: "0xABC Reason",
    }),
  );
  expect(p.reason).toBe("0xABC Reason");
  expect(p.weight).toBe("5");
  expect(p.support).toBe(1);
  expect(p.eventKey).toBe(`137:${governor}:0x${"b".repeat(64)}:3`);
  expect(p.transactionIndex).toBe("2");
  expect(p.logIndex).toBe("3");
});
test("Governor inventory verifies every indexed block without claiming full history", async () => {
  const event = fromLog(
    log("VoteCast", {
      voter: member,
      proposalId: 42n,
      support: 1,
      weight: 5n,
      reason: "Exact reason",
    }),
  );
  const row = { ...event, proposal: { proposalId: event.proposalId } };
  const stats = { proposals: "0", votes: "1" };
  const read = async (block) => {
    expect(block).toBe(50000000);
    return { hash: event.blockHash, events: [event] };
  };
  const result = await verifyGovernorInventory([row], stats, 50000001, read);
  expect(result.events).toBe(1);
  expect(result.completeHistoryVerified).toBe(false);
  await expect(
    verifyGovernorInventory([row, row], stats, 50000001, read),
  ).rejects.toThrow("DUPLICATE_EVENT");
  await expect(
    verifyGovernorInventory([row], { ...stats, votes: "2" }, 50000001, read),
  ).rejects.toThrow("COUNTS_MISMATCH");
  await expect(
    verifyGovernorInventory([row], stats, 49999999, read),
  ).rejects.toThrow("BLOCK_INVALID");
  await expect(
    verifyGovernorInventory(
      [{ ...row, reason: "Changed" }],
      stats,
      50000001,
      read,
    ),
  ).rejects.toThrow("EVENT_SAMPLE_MISMATCH");
  await expect(
    verifyGovernorInventory(
      [{ ...row, proposal: { proposalId: "43" } }],
      stats,
      50000001,
      read,
    ),
  ).rejects.toThrow("PROPOSAL_ID_MISMATCH");
  await expect(
    verifyGovernorInventory([row], stats, 50000001, async () => ({
      hash: "0xchanged",
      events: [event],
    })),
  ).rejects.toThrow("BLOCK_HASH_MISMATCH");
  await expect(
    verifyGovernorInventory([row], stats, 50000001, async () => ({
      hash: event.blockHash,
      events: [
        event,
        { ...event, eventKey: event.eventKey + "2", logIndex: "4" },
      ],
    })),
  ).rejects.toThrow("EVENT_SAMPLE_MISMATCH");
});
