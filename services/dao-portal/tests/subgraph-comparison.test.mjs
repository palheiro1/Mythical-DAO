import { test, expect } from "vitest";
import { encodeEventTopics, encodeAbiParameters } from "viem";
import { readFileSync } from "node:fs";
import { fromLog, comparisonRpcUrls } from "../scripts/compare-subgraph.mjs";
const abi = JSON.parse(
  readFileSync(
    new URL("../../dao-subgraph/abis/Governor.json", import.meta.url),
  ),
);
const governor = "0x7b9e327748462f1038c9d081c98d189b22c60a27";
const member = "0x0000000000000000000000000000000000000001";
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
