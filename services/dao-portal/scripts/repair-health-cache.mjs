// Operational repair for the uncommitted Worker deployed on 2026-10-02.
// The repository's worker/index.ts already verifies health on every request.
// Keep the other deployed behavior intact until its source is reconciled.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [input, output] = process.argv.slice(2);
if (!input || !output || input === output)
  throw Error(
    "Usage: node scripts/repair-health-cache.mjs ORIGINAL.js REPAIRED.js",
  );
const source = await readFile(input, "utf8");
const expected =
  "339f4e37e4ac8feda5d6b6b56c6d0b3d88263ad6c68f1eaa74f6ea64e3f25f74";
if (createHash("sha256").update(source).digest("hex") !== expected)
  throw Error(
    "Unexpected deployed source; inspect the new version before patching",
  );
const route =
  'path === "/api/proposals" || path === "/api/health" || cachedDetail';
const start = source.indexOf(
  '      if (path === "/api/health" && snapshot.health) {',
);
const end = source.indexOf(
  "      const items = presentSnapshot(snapshot);",
  start,
);
if (source.split(route).length !== 2 || start < 0 || end <= start)
  throw Error("Expected health cache branch not found");
const repaired = (source.slice(0, start) + source.slice(end)).replace(
  route,
  'path === "/api/proposals" || cachedDetail',
);
if (repaired.includes("LIVE_CHECK_EXPIRED"))
  throw Error("Expired proposal health remains in the repaired Worker");
await writeFile(output, repaired, { flag: "wx" });
console.log(
  JSON.stringify({
    sha256: createHash("sha256").update(repaired).digest("hex"),
  }),
);
