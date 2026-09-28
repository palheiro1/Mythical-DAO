import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  http,
  parseAbi,
  keccak256,
  toBytes,
  isAddress,
} from "viem";
const path = process.argv[2];
if (!path)
  throw Error(
    "Usage: RPC_PRIMARY_URL=… RPC_SECONDARY_URL=… node scripts/verify-deployment.mjs deployments/<manifest>.json",
  );
const m = JSON.parse(readFileSync(path, "utf8"));
if (!process.env.RPC_PRIMARY_URL || !process.env.RPC_SECONDARY_URL)
  throw Error("Two RPC URLs are required in the environment.");
const pair = [process.env.RPC_PRIMARY_URL, process.env.RPC_SECONDARY_URL].map(
  (url) =>
    createPublicClient({
      transport: http(url, { retryCount: 0, timeout: 10000 }),
    }),
);
const abi = parseAbi([
  "function token() view returns(address)",
  "function timelock() view returns(address)",
  "function governor() view returns(address)",
  "function mana() view returns(address)",
  "function weth() view returns(address)",
  "function usdc() view returns(address)",
  "function votingDelay() view returns(uint256)",
  "function votingPeriod() view returns(uint256)",
  "function proposalThreshold() view returns(uint256)",
  "function quorumNumerator() view returns(uint256)",
  "function getMinDelay() view returns(uint256)",
  "function hasRole(bytes32,address) view returns(bool)",
  "function decimals() view returns(uint8)",
]);
const normalize = (x) =>
  JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v));
async function agree(read) {
  const a = await Promise.all(pair.map(read));
  if (normalize(a[0]) !== normalize(a[1]))
    throw Error("Independent RPC results disagree");
  return a[0];
}
const chain = await agree((c) => c.getChainId());
if (chain !== m.chainId) throw Error("Wrong chain");
const heads = await Promise.all(pair.map((c) => c.getBlockNumber()));
const block =
  heads.reduce((a, b) => (a < b ? a : b)) - BigInt(m.confirmations ?? 64);
const blockHash = await agree(
  async (c) => (await c.getBlock({ blockNumber: block })).hash,
);
const contracts = {};
for (const [role, entry] of Object.entries(m.contracts)) {
  if (!isAddress(entry.address)) throw Error("Invalid address for " + role);
  const code = await agree((c) =>
    c.getCode({ address: entry.address, blockNumber: block }),
  );
  if (!code || code === "0x") throw Error("No deployed bytecode for " + role);
  contracts[role] = {
    address: entry.address,
    codeHash: keccak256(code),
    startBlock: entry.startBlock,
  };
}
for (const role of [
  "mana",
  "weth",
  "usdc",
  "governor",
  "vault",
  "timelock",
  "ballots",
])
  if (!contracts[role]) throw Error("Missing " + role);
async function read(role, functionName, args = []) {
  return agree((c) =>
    c.readContract({
      address: m.contracts[role].address,
      abi,
      functionName,
      args,
      blockNumber: block,
    }),
  );
}
const equal = async (role, method, expected) => {
  const value = await read(role, method);
  if (String(value).toLowerCase() !== String(expected).toLowerCase())
    throw Error(role + "." + method + " differs");
  return String(value);
};
await equal("governor", "token", m.contracts.mana.address);
await equal("governor", "timelock", m.contracts.timelock.address);
await equal("timelock", "governor", m.contracts.governor.address);
await equal("vault", "mana", m.contracts.mana.address);
await equal("vault", "weth", m.contracts.weth.address);
await equal("vault", "usdc", m.contracts.usdc.address);
await equal("vault", "timelock", m.contracts.timelock.address);
await equal("ballots", "token", m.contracts.mana.address);
await equal("ballots", "timelock", m.contracts.timelock.address);
await equal("mana", "decimals", 18);
await equal("governor", "votingDelay", 41143);
await equal("governor", "votingPeriod", 288000);
await equal("governor", "proposalThreshold", 250n * 10n ** 18n);
await equal("governor", "quorumNumerator", 10);
if (BigInt(await read("timelock", "getMinDelay")) < 259200n)
  throw Error("Timelock below 72 hours");
for (const role of ["PROPOSER_ROLE", "CANCELLER_ROLE"])
  if (
    !(await read("timelock", "hasRole", [
      keccak256(toBytes(role)),
      m.contracts.governor.address,
    ]))
  )
    throw Error("Missing Governor role");
const zero = "0x0000000000000000000000000000000000000000";
if (
  !(await read("timelock", "hasRole", [
    keccak256(toBytes("EXECUTOR_ROLE")),
    zero,
  ]))
)
  throw Error("Execution is not open");
if (
  m.deployer &&
  (await read("timelock", "hasRole", ["0x" + "0".repeat(64), m.deployer]))
)
  throw Error("Deployer still holds admin privileges");
const evidence = {
  checkedAt: new Date().toISOString(),
  chainId: chain,
  block: String(block),
  blockHash,
  contracts,
  limitations:
    "Bytecode hashes recorded, not an independent audit. Check explorer source verification and all role-grant/revoke events before release.",
};
const output = path.replace(/\.json$/, ".verification.json");
writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
console.log(
  "Verified deployed relationships and initial parameters: " + output,
);
