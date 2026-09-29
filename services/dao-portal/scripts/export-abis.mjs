import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
mkdirSync("shared/generated", { recursive: true });
for (const name of [
  "MythicalRagequitModule",
  "MythicalGovernorV2",
  "GovernanceTimelock",
  "MythicalTreasuryVault",
  "MythicalCommunityBallots",
]) {
  const artifact = JSON.parse(
    readFileSync("out/" + name + ".sol/" + name + ".json", "utf8"),
  );
  writeFileSync(
    "shared/generated/" + name + ".json",
    JSON.stringify(artifact.abi, null, 2) + "\n",
  );
}

// Existing Governor ABI is curated separately because its timing setters use uint256.
const { governorAbi } = await import("../shared/abis.ts");
writeFileSync(
  "shared/generated/ExistingGovernor.json",
  JSON.stringify(governorAbi, null, 2) + "\n",
);
