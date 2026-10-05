// Local source update only. Run after verify-ragequit.mjs, then review, rebuild and publish BOTH bundles.
import { readFileSync, writeFileSync } from "node:fs";
import { assertRagequitManifest } from "./ragequit-policy.mjs";
const [manifestPath, reportPath] = process.argv.slice(2);
if (!manifestPath || !reportPath)
  throw Error(
    "Usage: pin-ragequit-deployment.mjs manifest.json verification.json",
  );
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = read(manifestPath),
  report = read(reportPath);
const path = "shared/generated/ragequit-trust.json",
  pin = read(path);
const reviewed = read("deployments/ragequit-release/review-manifest.json");
assertRagequitManifest(manifest);
const module = manifest.contracts.ragequitModule;
if (
  !module ||
  report.chainId !== 137 ||
  report.module?.toLowerCase() !== module.address.toLowerCase() ||
  !/^0x[0-9a-fA-F]{64}$/.test(report.blockHash ?? "") ||
  BigInt(report.block) < BigInt(module.startBlock) ||
  report.codeHashes?.ragequitModule !== pin.runtimeHash ||
  pin.runtimeHash !== reviewed.runtimeKeccak256 ||
  ["gem", "weth", "usdcNative"].some(
    (role, i) =>
      report.assets?.[i]?.toLowerCase() !== pin.addresses[role].toLowerCase(),
  ) ||
  Object.entries(pin.addresses).some(
    ([role, address]) =>
      manifest.contracts[role].address.toLowerCase() !== address.toLowerCase(),
  )
)
  throw Error(
    "A matching confirmed two-provider verification report is required",
  );
if (
  pin.moduleAddress &&
  pin.moduleAddress.toLowerCase() !== module.address.toLowerCase()
)
  throw Error(
    "A different deployment is already pinned; review a new release explicitly",
  );
writeFileSync(
  path,
  JSON.stringify({ ...pin, moduleAddress: module.address }, null, 2) + "\n",
);
console.log(
  "Pinned the verified module in local source. Review the diff and rebuild both portal and Worker before activation. No transaction or deployment sent.",
);
