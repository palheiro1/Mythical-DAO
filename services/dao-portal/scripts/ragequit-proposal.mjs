import { readFileSync, writeFileSync } from "node:fs";
import {
  assertRagequitManifest,
  assertModuleAddress,
} from "./ragequit-policy.mjs";
import {
  encodeFunctionData,
  parseAbi,
  isAddress,
  zeroAddress,
  maxUint256,
  keccak256,
  stringToHex,
} from "viem";
const [module, output, mode = "authorize"] = process.argv.slice(2);
if (
  !module ||
  !isAddress(module) ||
  module === zeroAddress ||
  !output ||
  !["authorize", "revoke"].includes(mode)
)
  throw Error(
    "Usage: node scripts/ragequit-proposal.mjs MODULE OUTPUT.json [authorize|revoke]",
  );
const manifest = JSON.parse(readFileSync("deployments/polygon.json", "utf8"));
assertRagequitManifest(manifest);
assertModuleAddress(module, manifest);
const treasury = manifest.contracts.treasury.address;
if (module.toLowerCase() === treasury.toLowerCase())
  throw Error("Module cannot be the treasury");
const description =
  mode === "authorize"
    ? `Authorize Mythical DAO ragequit module ${module}\n\nGrant this immutable module continuous maximum allowances for GEM, WETH and native USDC. Members burn their own MANA to receive proportional payments directly from the existing treasury. POL, WPOL, USDC.e, MANA and NFTs are excluded. Governance retains spending authority and can revoke these allowances. There is no mandatory exit window or reservation of funds. Governor, MANA, delegations and governance rules remain unchanged.`
    : `Revoke Mythical DAO ragequit module ${module}\n\nSet all three treasury allowances to zero. No token, treasury or Governor migration is performed. Further exits requiring a positive basket payment will revert.`;
const tokenAbi = parseAbi(["function approve(address,uint256) returns(bool)"]);
const governorAbi = parseAbi([
  "function propose(address[],uint256[],bytes[],string) returns(uint256)",
  "function execute(address[],uint256[],bytes[],bytes32) payable returns(uint256)",
  "function hashProposal(address[],uint256[],bytes[],bytes32) pure returns(uint256)",
]);
const targets = ["gem", "weth", "usdcNative"].map(
  (role) => manifest.contracts[role].address,
);
const values = [0n, 0n, 0n];
const calldatas = targets.map(() =>
  encodeFunctionData({
    abi: tokenAbi,
    functionName: "approve",
    args: [module, mode === "authorize" ? maxUint256 : 0n],
  }),
);
const descriptionHash = keccak256(stringToHex(description));
const actions = targets.map((target, i) => ({
  target,
  value: "0",
  data: calldatas[i],
}));
const payload = {
  status: "unsigned-review-only",
  verificationRequired:
    "Verify this exact module runtime, immutable copies and deployment on Polygon before submitting. Address validation alone is not deployment verification.",
  schemaVersion: 2,
  chainId: 137,
  architecture: "existing-governor",
  governor: treasury,
  module,
  mode,
  description,
  descriptionHash,
  actions,
  propose: {
    to: treasury,
    value: "0",
    data: encodeFunctionData({
      abi: governorAbi,
      functionName: "propose",
      args: [targets, values, calldatas, description],
    }),
  },
  execute: {
    to: treasury,
    value: "0",
    data: encodeFunctionData({
      abi: governorAbi,
      functionName: "execute",
      args: [targets, values, calldatas, descriptionHash],
    }),
  },
  expectedAllowances: targets.map((asset) => ({
    asset,
    owner: treasury,
    spender: module,
    amount: String(mode === "authorize" ? maxUint256 : 0n),
  })),
};
writeFileSync(output, JSON.stringify(payload, null, 2) + "\n");
console.log(
  `Prepared ${mode} proposal for review: ${output}. No transaction submitted.`,
);
