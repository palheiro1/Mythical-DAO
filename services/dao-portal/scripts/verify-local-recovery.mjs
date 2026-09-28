import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const temporary = mkdtempSync(join(tmpdir(), "mythical-dao-recovery-"));
const exported = join(temporary, "public-index.sql");
const isolated = join(temporary, "restored");
const wrangler = resolve("node_modules/.bin/wrangler");
const run = (args) =>
  execFileSync(wrangler, args, {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 12_000_000,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
function query(sql, restored = false) {
  const result = JSON.parse(
    run([
      "d1",
      "execute",
      "DAO_DB",
      "--local",
      "--json",
      "--command",
      sql,
      ...(restored ? ["--persist-to", isolated] : []),
    ]),
  );
  if (!result.every((r) => r.success)) throw Error("Recovery query failed");
  return result.flatMap((r) => r.results);
}
try {
  // This bounded drill is for local fixtures; use OPERATIONS.md for full operational exports.
  run(["d1", "export", "DAO_DB", "--local", "--output", exported]);
  if (statSync(exported).size > 5_000_000)
    throw Error("Local fixture exceeds the 5 MB recovery-drill limit");
  run([
    "d1",
    "execute",
    "DAO_DB",
    "--local",
    "--persist-to",
    isolated,
    "--file",
    exported,
    "--yes",
  ]);
  const tables = query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
  );
  const counts = {};
  for (const { name } of tables) {
    if (!/^[a-z_][a-z_0-9]*$/.test(name)) throw Error("Unexpected fixture table");
    const sql = 'SELECT * FROM "' + name + '"';
    const canonical = (rows) =>
      JSON.stringify(
        rows
          .map((row) =>
            JSON.stringify(
              Object.fromEntries(
                Object.entries(row).sort(([a], [b]) => a.localeCompare(b)),
              ),
            ),
          )
          .sort(),
      );
    const original = query(sql),
      restored = query(sql, true);
    if (canonical(original) !== canonical(restored))
      throw Error("Recovery mismatch: " + name);
    counts[name] = original.length;
  }
  const report = {
    checkedAt: new Date().toISOString(),
    scope:
      "Local public D1 fixture exported and restored into an isolated database; original database unchanged.",
    exportSHA256: createHash("sha256")
      .update(readFileSync(exported))
      .digest("hex"),
    exportBytes: statSync(exported).size,
    allRowsMatch: true,
    tables: counts,
  };
  mkdirSync("docs/evidence", { recursive: true });
  writeFileSync(
    "docs/evidence/local-recovery.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  // This script owns this small temporary fixture; authoritative local data and the archive remain intact.
  rmSync(temporary, { recursive: true, force: true });
}
