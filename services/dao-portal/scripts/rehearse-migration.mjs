import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseAbi,
  formatUnits,
  isAddress,
} from "viem";
const manifestPath = process.argv[2];
if (!manifestPath)
  throw Error(
    "Usage: RPC_PRIMARY_URL=... node scripts/rehearse-migration.mjs deployments/manifest.json",
  );
const m = JSON.parse(readFileSync(manifestPath, "utf8")),
  old = m.contracts.legacyGovernor?.address,
  vault = m.contracts.vault?.address;
if (!isAddress(old ?? "") || !isAddress(vault ?? ""))
  throw Error("Concrete legacy and V2 treasury addresses are required");
const rpc = process.env.RPC_PRIMARY_URL;
if (!rpc) throw Error("RPC_PRIMARY_URL required");
const client = createPublicClient({ transport: http(rpc) }),
  block = await client.getBlockNumber();
if ((await client.getChainId()) !== m.chainId) throw Error("Wrong chain");
const abi = parseAbi([
  "function balanceOf(address) view returns(uint256)",
  "function transfer(address,uint256) returns(bool)",
]);
const pol = await client.getBalance({ address: old, blockNumber: block });
const actions =
  pol > 0n
    ? [{ target: vault, value: pol.toString(), data: "0x", asset: "POL" }]
    : [];
for (const role of ["weth", "usdc"]) {
  const token = m.contracts[role].address,
    balance = await client.readContract({
      address: token,
      abi,
      functionName: "balanceOf",
      args: [old],
      blockNumber: block,
    });
  if (balance > 0n)
    actions.push({
      target: token,
      value: "0",
      data: encodeFunctionData({
        abi,
        functionName: "transfer",
        args: [vault, balance],
      }),
      asset: role,
      amount: balance.toString(),
    });
}
const output = {
  chainId: m.chainId,
  block: String(block),
  oldGovernor: old,
  vault,
  actions,
  authorization:
    "These are candidate action bytes. Submit only through the actual old governance permissions after independent verification and a Polygon fork rehearsal.",
  outstanding: [
    "Verify old Governor executor and treasury ownership",
    "Complete or explicitly resolve in-flight proposals",
    "Inventory and redirect revenue origins with Tarasca owners",
    "Re-read balances at execution; this plan does not silently shrink transfers",
  ],
};
writeFileSync(
  "deployments/migration-candidate.json",
  JSON.stringify(output, null, 2) + "\n",
);
console.log(
  "Prepared exact candidate payloads at block " +
    block +
    "; no transaction sent.",
);
