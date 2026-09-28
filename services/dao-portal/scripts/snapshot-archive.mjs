import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
const input = process.argv[2],
  output = process.argv[3] ?? "archives/snapshot.sql";
if (!input)
  throw new Error(
    "Usage: node scripts/snapshot-archive.mjs <archive.json|--download> [output.sql]",
  );
let archive;
if (input === "--download") {
  const proposals = [];
  let skip = 0;
  const source = "https://hub.snapshot.org/graphql";
  for (let page = 0; page < 100; page++) {
    const response = await fetch(source, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        query:
          'query Archive($skip: Int!) { proposals(first: 100, skip: $skip, where: {space_in: ["mythicalbeings.eth"]}, orderBy: "created", orderDirection: asc) { id title body choices start end created snapshot state scores scores_total author network strategies { name params } } }',
        variables: { skip },
      }),
    });
    if (!response.ok)
      throw new Error("Archive source unavailable: " + response.status);
    const text = await response.text();
    if (text.length > 10_000_000) throw new Error("Archive response too large");
    const data = JSON.parse(text);
    if (data.errors) throw new Error("Snapshot query failed");
    const batch = data.data.proposals;
    proposals.push(...batch);
    skip += batch.length;
    if (batch.length < 100) break;
    if (page === 99)
      throw new Error("Archive limit reached; split the import explicitly.");
  }
  archive = {
    source,
    space: "mythicalbeings.eth",
    importedAt: new Date().toISOString(),
    verification:
      "Historical Snapshot Hub export. Off-chain scores and signatures have not been independently verified. Not V2 on-chain voting.",
    proposals,
  };
  mkdirSync("archives", { recursive: true });
  writeFileSync(
    "archives/snapshot.json",
    JSON.stringify(archive, null, 2) + "\n",
  );
} else archive = JSON.parse(readFileSync(input, "utf8"));
if (
  archive.space !== "mythicalbeings.eth" ||
  !Array.isArray(archive.proposals) ||
  !archive.importedAt ||
  !archive.verification
)
  throw new Error("Invalid archive metadata");
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const statements = [
  "-- Read-only Snapshot archive. Idempotent import; existing originals are preserved.",
];
for (const p of archive.proposals) {
  if (
    typeof p.id !== "string" ||
    typeof p.title !== "string" ||
    typeof p.body !== "string" ||
    !Number.isSafeInteger(p.created) ||
    !Array.isArray(p.choices)
  )
    throw new Error("Invalid archived proposal");
  statements.push(
    "INSERT OR IGNORE INTO snapshot_archive VALUES(" +
      [
        p.id,
        archive.space,
        p.created,
        "https://snapshot.org/#/mythicalbeings.eth/proposal/" + p.id,
        archive.importedAt,
        archive.verification,
        JSON.stringify(p),
      ]
        .map(quote)
        .join(",") +
      ");",
  );
}
const sql = statements.join("\n") + "\n";
mkdirSync(output.split("/").slice(0, -1).join("/") || ".", { recursive: true });
writeFileSync(output, sql);
writeFileSync(
  output + ".sha256",
  createHash("sha256").update(sql).digest("hex") + "\n",
);
console.log(
  JSON.stringify({
    proposals: archive.proposals.length,
    output,
    verification: archive.verification,
  }),
);
