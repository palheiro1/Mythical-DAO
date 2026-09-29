import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
if (!process.env.POLYGON_FORK_RPC)
  throw Error(
    "Set POLYGON_FORK_RPC to an archive-capable Polygon RPC. Rehearsal never broadcasts transactions.",
  );
const result = spawnSync(
  "forge",
  ["test", "--match-contract", "ExistingGovernorForkTest", "-vv"],
  { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, env: process.env },
);
const output = (result.stdout ?? "") + (result.stderr ?? "");
if (result.error) throw result.error;
const lines = output
  .split("\n")
  .filter((l) => !l.includes("WARN") && !l.includes("cache/rpc"));
mkdirSync("docs/evidence", { recursive: true });
writeFileSync("docs/evidence/existing-governor-fork.txt", lines.join("\n"));
console.log(lines.slice(-24).join("\n"));
if (
  result.status !== 0 ||
  !output.includes("[PASS] testRealGovernorAuthorizationCycleAndRealTokenExits")
)
  process.exit(1);
