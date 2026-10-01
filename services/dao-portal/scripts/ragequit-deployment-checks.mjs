import {
  encodeDeployData,
  getAddress,
  isAddress,
  keccak256,
  toHex,
  zeroAddress,
} from "viem";
import { assertRagequitManifest } from "./ragequit-policy.mjs";

export function checkReviewedCreation(manifest, artifact, review, unsigned) {
  assertRagequitManifest(manifest);
  if (manifest.contracts.ragequitModule)
    throw Error(
      "Module already configured; do not prepare a duplicate deployment",
    );
  const roles = ["treasury", "mana", "gem", "weth", "usdcNative"];
  const args = roles.map((role) => manifest.contracts[role].address);
  if (
    review.chainId !== 137 ||
    review.contract !== "MythicalRagequitModule" ||
    review.deploymentAddress !== null
  )
    throw Error("Wrong reviewed release identity");
  for (const [i, role] of roles.entries())
    if (review.constructor?.[role]?.toLowerCase() !== args[i].toLowerCase())
      throw Error(`Reviewed constructor differs: ${role}`);
  const data = encodeDeployData({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args,
  });
  if (
    keccak256(data) !== review.initCodeKeccak256 ||
    keccak256(artifact.deployedBytecode.object) !==
      review.runtimeTemplateKeccak256
  )
    throw Error("Compiled artifact differs from reviewed bytecode");
  const tx = unsigned.transaction;
  if (
    unsigned.status !== "unsigned-review-only" ||
    !tx ||
    Object.keys(tx).sort().join(",") !== "chainId,data,value" ||
    tx.chainId !== "0x89" ||
    tx.value !== "0x0" ||
    tx.data !== data
  )
    throw Error("Unsigned creation differs from reviewed transaction");
  return { data, args };
}

export function checkDeployer(address) {
  if (!isAddress(address) || address.toLowerCase() === zeroAddress)
    throw Error("A valid nonzero deployer address is required");
  return getAddress(address);
}

export function checkIdleNonce(latest, pending) {
  if (!Number.isSafeInteger(latest) || latest < 0 || pending !== latest)
    throw Error(
      "Pending transactions or changed nonce; wait and repeat preflight",
    );
  return latest;
}

export function priceCreation({
  from,
  data,
  nonce,
  balance,
  gasEstimates,
  feeEstimates,
}) {
  checkDeployer(from);
  checkIdleNonce(nonce, nonce);
  if (
    gasEstimates.length !== 2 ||
    feeEstimates.length !== 2 ||
    gasEstimates.some((g) => typeof g !== "bigint" || g <= 0n) ||
    feeEstimates.some(
      (f) =>
        typeof f.maxFeePerGas !== "bigint" ||
        typeof f.maxPriorityFeePerGas !== "bigint" ||
        f.maxPriorityFeePerGas <= 0n ||
        f.maxFeePerGas < f.maxPriorityFeePerGas,
    )
  )
    throw Error("Invalid gas or EIP-1559 fee estimates");
  const max = (values) => values.reduce((a, b) => (a > b ? a : b));
  const gas = (max(gasEstimates) * 120n + 99n) / 100n;
  const maxFeePerGas = max(feeEstimates.map((f) => f.maxFeePerGas));
  const maxPriorityFeePerGas = max(
    feeEstimates.map((f) => f.maxPriorityFeePerGas),
  );
  const maximumGasCost = gas * maxFeePerGas;
  if (balance < maximumGasCost)
    throw Error("Insufficient POL for maximum gas cost");
  return {
    transaction: {
      from: getAddress(from),
      chainId: "0x89",
      type: "0x2",
      value: "0x0",
      data,
      nonce: toHex(nonce),
      gas: toHex(gas),
      maxFeePerGas: toHex(maxFeePerGas),
      maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
    },
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    maximumGasCost,
  };
}
