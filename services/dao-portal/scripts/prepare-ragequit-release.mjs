// Produce reviewable deployment material without a private key, signing or broadcasting.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { encodeDeployData, encodeAbiParameters, keccak256, toHex } from "viem";
import {
  assertRagequitManifest,
  instantiateModuleRuntime,
} from "./ragequit-policy.mjs";

const manifest = JSON.parse(readFileSync("deployments/polygon.json", "utf8"));
assertRagequitManifest(manifest);
if (manifest.chainId !== 137 || manifest.architecture !== "existing-governor")
  throw Error("Expected the existing Polygon Governor architecture");
if (manifest.contracts.ragequitModule)
  throw Error(
    "A module is already configured; do not prepare a duplicate deployment",
  );
const artifact = JSON.parse(
  readFileSync(
    "out/MythicalRagequitModule.sol/MythicalRagequitModule.json",
    "utf8",
  ),
);
const metadata =
  typeof artifact.metadata === "string"
    ? JSON.parse(artifact.metadata)
    : artifact.metadata;
const sources = {};
const compilerSources = {};
for (const [path, entry] of Object.entries(metadata.sources)) {
  const content = readFileSync(path, "utf8");
  const hash = keccak256(toHex(content));
  if (hash !== entry.keccak256)
    throw Error(`Compiled source differs from disk: ${path}. Run forge build.`);
  sources[path] = hash;
  compilerSources[path] = { content };
}
const roles = ["treasury", "mana", "gem", "weth", "usdcNative"];
const args = roles.map((role) => manifest.contracts[role].address);
if (new Set(args.map((address) => address.toLowerCase())).size !== 5)
  throw Error("Constructor addresses must be distinct");
if (args[0].toLowerCase() !== manifest.contracts.governor.address.toLowerCase())
  throw Error("The treasury must be the current Governor");
if (
  args.some(
    (address) =>
      address.toLowerCase() ===
      manifest.contracts.usdcBridged.address.toLowerCase(),
  )
)
  throw Error("USDC.e must not enter this deployment");
const data = encodeDeployData({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
  args,
});
const runtimeHash = keccak256(instantiateModuleRuntime(artifact, args));
// Distributed with both clients. An API response cannot replace this trust root.
mkdirSync("shared/generated", { recursive: true });
writeFileSync(
  "shared/generated/ragequit-trust.json",
  JSON.stringify(
    {
      version: 1,
      chainId: 137,
      moduleAddress: null,
      runtimeHash,
      addresses: Object.fromEntries(roles.map((role, i) => [role, args[i]])),
    },
    null,
    2,
  ) + "\n",
);
const directory = "deployments/ragequit-release";
mkdirSync(directory, { recursive: true });
const write = (name, value) =>
  writeFileSync(`${directory}/${name}`, JSON.stringify(value, null, 2) + "\n");
// Self-contained Standard JSON input: an external reviewer needs no dependency
// installation. compilationTarget belongs to output metadata, not compiler input.
const { compilationTarget: _target, ...compilerSettings } = metadata.settings;
const compilerInput = {
  language: "Solidity",
  sources: compilerSources,
  settings: {
    ...compilerSettings,
    outputSelection: {
      "*": { "*": ["abi", "metadata", "evm.bytecode", "evm.deployedBytecode"] },
    },
  },
};
write("compiler-input.json", compilerInput);
write("deployment-unsigned.json", {
  status: "unsigned-review-only",
  transaction: { chainId: "0x89", value: "0x0", data },
  note: "Contract creation: no to address. The reviewed deployer wallet must supply from, nonce and current fee parameters. No transaction has been submitted.",
});
write("review-manifest.json", {
  preparedAt: new Date().toISOString(),
  chainId: 137,
  contract: "MythicalRagequitModule",
  deploymentAddress: null,
  independentReview: "pending",
  compiler: metadata.compiler,
  settings: metadata.settings,
  constructor: Object.fromEntries(roles.map((role, i) => [role, args[i]])),
  constructorArguments: encodeAbiParameters(
    roles.map(() => ({ type: "address" })),
    args,
  ),
  initCodeKeccak256: keccak256(data),
  initCodeBytes: (data.length - 2) / 2,
  runtimeTemplateKeccak256: keccak256(artifact.deployedBytecode.object),
  runtimeKeccak256: runtimeHash,
  immutableReferences: artifact.deployedBytecode.immutableReferences,
  sources,
  compilerInputKeccak256: keccak256(
    toHex(readFileSync(`${directory}/compiler-input.json`)),
  ),
  authorization: "../ragequit-authorization.template.json",
  requirements: [
    "Independent review of these exact sources and init code",
    "Deployer wallet and gas fees",
    "Verify deployed runtime and all immutable addresses",
    "DAO proposal, vote and execution of the three allowances",
    "Confirmed allowances and a small consented real exit",
  ],
});
write("abi.json", artifact.abi);
console.log(
  JSON.stringify({
    directory,
    initCodeKeccak256: keccak256(data),
    initCodeBytes: (data.length - 2) / 2,
    sourceFilesVerified: Object.keys(sources).length,
    signed: false,
    broadcast: false,
  }),
);
