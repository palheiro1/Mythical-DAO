import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
mkdirSync("shared/generated", { recursive: true });
for (const name of [
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
