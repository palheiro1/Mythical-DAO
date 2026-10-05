import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { encodeDeployData, keccak256, parseAbi } from "viem";
import {
  checkReviewedCreation,
  checkDeployer,
  checkIdleNonce,
  priceCreation,
} from "../scripts/ragequit-deployment-checks.mjs";

const manifest = JSON.parse(readFileSync("deployments/polygon.json", "utf8"));
// These cases model the pre-deployment state even after the live module is pinned.
delete manifest.contracts.ragequitModule;
const from = "0xc4CCC6A11329558582c2dA79C18a9AEaC00f59F9";
function fixture() {
  const roles = ["treasury", "mana", "gem", "weth", "usdcNative"];
  const args = roles.map((r) => manifest.contracts[r].address);
  const artifact = {
    abi: parseAbi([
      "constructor(address treasury,address mana,address gem,address weth,address usdc)",
    ]),
    bytecode: { object: "0x6000" },
    deployedBytecode: { object: "0x00" },
  };
  const data = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args,
  });
  const review = {
    chainId: 137,
    contract: "MythicalRagequitModule",
    deploymentAddress: null,
    constructor: Object.fromEntries(roles.map((r, i) => [r, args[i]])),
    initCodeKeccak256: keccak256(data),
    runtimeTemplateKeccak256: keccak256(artifact.deployedBytecode.object),
  };
  const unsigned = {
    status: "unsigned-review-only",
    transaction: { chainId: "0x89", value: "0x0", data },
  };
  return { artifact, review, unsigned };
}
describe("deployment review checks", () => {
  it("accepts only the reviewed creation and detects altered constructor or runtime", () => {
    const { artifact, review, unsigned } = fixture();
    expect(
      checkReviewedCreation(manifest, artifact, review, unsigned).data,
    ).toBe(unsigned.transaction.data);
    const swapped = structuredClone(review);
    swapped.constructor.usdcNative = manifest.contracts.usdcBridged.address;
    expect(() =>
      checkReviewedCreation(manifest, artifact, swapped, unsigned),
    ).toThrow("constructor");
    artifact.deployedBytecode.object = "0x01";
    expect(() =>
      checkReviewedCreation(manifest, artifact, review, unsigned),
    ).toThrow("bytecode");
  });
  it.each([
    { to: from },
    { value: "0x1" },
    { chainId: "0x1" },
    { data: "0x6001" },
    { nonce: "0x0" },
  ])(
    "rejects an injected destination, value, chain or transaction payload: %j",
    (change) => {
      const { artifact, review, unsigned } = fixture();
      Object.assign(unsigned.transaction, change);
      expect(() =>
        checkReviewedCreation(manifest, artifact, review, unsigned),
      ).toThrow("Unsigned creation");
    },
  );
  it("refuses a duplicate module and invalid deployer", () => {
    const { artifact, review, unsigned } = fixture();
    const deployed = structuredClone(manifest);
    deployed.contracts.ragequitModule = { address: from, startBlock: "1" };
    expect(() =>
      checkReviewedCreation(deployed, artifact, review, unsigned),
    ).toThrow("already configured");
    for (const address of [
      "",
      "0x0000000000000000000000000000000000000000",
      "123",
    ])
      expect(() => checkDeployer(address)).toThrow();
    expect(checkDeployer(from)).toBe(from);
  });
  it("rejects pending transactions and unsafe nonces before predicting the address", () => {
    expect(checkIdleNonce(298, 298)).toBe(298);
    for (const [latest, pending] of [
      [298, 299],
      [298, 297],
      [-1, -1],
      [2 ** 53, 2 ** 53],
    ])
      expect(() => checkIdleNonce(latest, pending)).toThrow();
  });
});
describe("unsigned deployment fee envelope", () => {
  const input = {
    from,
    data: "0x6000",
    nonce: 298,
    balance: 100000n,
    gasEstimates: [101n, 100n],
    feeEstimates: [
      { maxFeePerGas: 5n, maxPriorityFeePerGas: 3n },
      { maxFeePerGas: 7n, maxPriorityFeePerGas: 2n },
    ],
  };
  it("uses the higher estimates, rounds the gas margin up and spends no native value", () => {
    const priced = priceCreation(input);
    expect(priced.gas).toBe(122n);
    expect(priced.maximumGasCost).toBe(854n);
    expect(priced.transaction).toMatchObject({
      from,
      chainId: "0x89",
      type: "0x2",
      value: "0x0",
      nonce: "0x12a",
      maxFeePerGas: "0x7",
      maxPriorityFeePerGas: "0x3",
    });
    expect(priced.transaction).not.toHaveProperty("to");
  });
  it("fails when maximum gas cannot be covered even though the native value is zero", () => {
    expect(() => priceCreation({ ...input, balance: 853n })).toThrow(
      "Insufficient POL",
    );
    expect(() => priceCreation({ ...input, balance: 854n })).not.toThrow();
  });
  it.each([
    { gasEstimates: [0n, 100n] },
    { gasEstimates: [100n] },
    {
      feeEstimates: [
        { maxFeePerGas: 1n, maxPriorityFeePerGas: 2n },
        { maxFeePerGas: 7n, maxPriorityFeePerGas: 2n },
      ],
    },
  ])("rejects incomplete or invalid estimates (case %#)", (change) => {
    expect(() => priceCreation({ ...input, ...change })).toThrow("Invalid gas");
  });
});
