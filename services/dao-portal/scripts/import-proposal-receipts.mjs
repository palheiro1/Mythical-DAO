// Import known proposal receipts while the full index catches up. This never advances cursors.
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, http, decodeEventLog } from "viem";

const [output, ...hashes] = process.argv.slice(2);
if (
  !output ||
  !hashes.length ||
  hashes.some((h) => !/^0x[0-9a-f]{64}$/i.test(h))
)
  throw new Error(
    "Usage: RPC_PRIMARY_URL=… RPC_SECONDARY_URL=… node scripts/import-proposal-receipts.mjs output.sql txHash…",
  );
const urls = [process.env.RPC_PRIMARY_URL, process.env.RPC_SECONDARY_URL];
if (
  urls.some((u) => !u || new URL(u).protocol !== "https:") ||
  new URL(urls[0]).hostname === new URL(urls[1]).hostname
)
  throw new Error("Two independent HTTPS RPC providers are required");
const clients = urls.map((url) =>
  createPublicClient({
    transport: http(url, { timeout: 15000, retryCount: 1 }),
  }),
);
const manifest = JSON.parse(readFileSync("deployments/polygon.json", "utf8"));
const abi = JSON.parse(
  readFileSync("shared/generated/ExistingGovernor.json", "utf8"),
);
const governor = manifest.contracts.governor.address.toLowerCase();
const serialize = (x) =>
  JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v));
const quote = (x) => "'" + String(x).replaceAll("'", "''") + "'";
const heads = await Promise.all(clients.map((c) => c.getBlockNumber()));
const confirmed =
  heads.reduce((a, b) => (a < b ? a : b)) - BigInt(manifest.confirmations);
if (
  (await Promise.all(clients.map((c) => c.getChainId()))).some(
    (id) => id !== 137,
  )
)
  throw new Error("Wrong chain");
const statements = [],
  events = [];
for (const hash of hashes) {
  // A provider may prune transaction lookup while retaining historical logs.
  // The first receipt only locates the block; both providers must verify its logs and hash.
  const receipt = await clients[0].getTransactionReceipt({ hash });
  if (receipt.blockNumber > confirmed)
    throw new Error("Receipt is not confirmed");
  const results = await Promise.all(
    clients.map((c) =>
      c.getLogs({
        address: governor,
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
      }),
    ),
  );
  const logs = results.map((r) =>
    r
      .filter((l) => l.transactionHash === hash)
      .map((l) => ({
        blockNumber: l.blockNumber,
        blockHash: l.blockHash,
        transactionHash: l.transactionHash,
        logIndex: l.logIndex,
        data: l.data,
        topics: l.topics,
      })),
  );
  if (serialize(logs[0]) !== serialize(logs[1]) || !logs[0].length)
    throw new Error("Receipt divergence");
  const blocks = await Promise.all(
    clients.map((c) => c.getBlock({ blockNumber: receipt.blockNumber })),
  );
  if (blocks.some((b) => b.hash !== receipt.blockHash))
    throw new Error("Noncanonical receipt");
  for (const log of logs[0]) {
    const event = decodeEventLog({
      abi: abi.abi ?? abi,
      data: log.data,
      topics: log.topics,
    });
    statements.push(
      "INSERT OR IGNORE INTO events VALUES(" +
        [
          137,
          governor,
          String(log.blockNumber),
          log.blockHash,
          log.transactionHash,
          log.logIndex,
          event.eventName,
          serialize(event.args),
        ]
          .map(quote)
          .join(",") +
        ");",
    );
    events.push({
      hash,
      event: event.eventName,
      block: String(log.blockNumber),
      blockHash: log.blockHash,
    });
  }
}
writeFileSync(output, statements.join("\n") + "\n");
writeFileSync(
  output + ".json",
  JSON.stringify(
    {
      verifiedAt: new Date().toISOString(),
      verification:
        "Matching canonical block hashes and event logs from two independent RPC providers. No completeness assertion or cursor advancement.",
      events,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify({ output, events: events.length }));
