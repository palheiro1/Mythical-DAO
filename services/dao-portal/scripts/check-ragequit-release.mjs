// Read-only CI gate: source, compiler artifact, review package and both application trust roots agree.
import { readFileSync } from "node:fs";
import { encodeDeployData, keccak256, toHex } from "viem";
import {
  assertRagequitManifest,
  instantiateModuleRuntime,
} from "./ragequit-policy.mjs";
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = read("deployments/polygon.json");
assertRagequitManifest(manifest);
const artifact = read(
  "out/MythicalRagequitModule.sol/MythicalRagequitModule.json",
);
const metadata =
  typeof artifact.metadata === "string"
    ? JSON.parse(artifact.metadata)
    : artifact.metadata;
const dir = "deployments/ragequit-release";
const review = read(`${dir}/review-manifest.json`),
  unsigned = read(`${dir}/deployment-unsigned.json`);
const pin = read("shared/generated/ragequit-trust.json");
const roles = ["treasury", "mana", "gem", "weth", "usdcNative"];
const args = roles.map((role) => manifest.contracts[role].address);
const data = encodeDeployData({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
  args,
});
if (
  JSON.stringify(unsigned.transaction) !==
    JSON.stringify({ chainId: "0x89", value: "0x0", data }) ||
  keccak256(data) !== review.initCodeKeccak256 ||
  JSON.stringify(metadata.compiler) !== JSON.stringify(review.compiler) ||
  JSON.stringify(metadata.settings) !== JSON.stringify(review.settings) ||
  Object.keys(metadata.sources).sort().join() !==
    Object.keys(review.sources).sort().join() ||
  keccak256(artifact.deployedBytecode.object) !==
    review.runtimeTemplateKeccak256 ||
  keccak256(instantiateModuleRuntime(artifact, args)) !==
    review.runtimeKeccak256 ||
  pin.version !== 1 ||
  pin.chainId !== 137 ||
  pin.runtimeHash !== review.runtimeKeccak256 ||
  (pin.moduleAddress?.toLowerCase() ?? null) !==
    (manifest.contracts.ragequitModule?.address.toLowerCase() ?? null) ||
  roles.some(
    (role, i) =>
      pin.addresses[role]?.toLowerCase() !== args[i].toLowerCase() ||
      review.constructor[role]?.toLowerCase() !== args[i].toLowerCase(),
  ) ||
  keccak256(toHex(readFileSync(`${dir}/compiler-input.json`))) !==
    review.compilerInputKeccak256 ||
  JSON.stringify(read(`${dir}/abi.json`)) !== JSON.stringify(artifact.abi)
)
  throw Error(
    "Release, compiled artifact or portal trust differs. Regenerate and review the exact package.",
  );
for (const [path, hash] of Object.entries(review.sources))
  if (
    keccak256(toHex(readFileSync(path))) !== hash ||
    metadata.sources[path].keccak256 !== hash
  )
    throw Error(`Reviewed source changed: ${path}`);
console.log(
  "Ragequit source, artifact, unsigned creation, review package and application trust match.",
);
