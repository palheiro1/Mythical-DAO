// Read-only prerequisite for historical backfill. Never writes D1 or advances cursors.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createPublicClient, http } from "viem";

const serialize = (value) =>
  JSON.stringify(value, (_, item) =>
    typeof item === "bigint" ? item.toString() : item,
  );
const fault = (code) => Object.assign(new Error(code), { probeCode: code });
export function infuraProbeUrls(env) {
  const key = env.INFURA_API_KEY;
  if (!key || !/^[a-zA-Z0-9_-]{16,128}$/.test(key))
    throw fault("INFURA_API_KEY_MISSING_OR_INVALID");
  const secondary =
    env.INDEX_RPC_SECONDARY_URL || "https://tenderly.rpc.polygon.community";
  if (new URL(secondary).hostname.endsWith(".infura.io"))
    throw fault("INDEPENDENT_HTTPS_PROVIDERS_REQUIRED");
  return [`https://polygon-mainnet.infura.io/v3/${key}`, secondary];
}

// Small, read-only preflight: no batching, retries or paid endpoints. The pause
// also applies to the existing generic command if its URL is an Infura endpoint.
function probeTransport(url) {
  let next = 0;
  return http(url, {
    batch: false,
    timeout: 25000,
    retryCount: 0,
    maxResponseBodySize: 4_000_000,
    fetchFn: async (input, init) => {
      if (new URL(url).hostname.endsWith(".infura.io")) {
        const at = Math.max(Date.now(), next);
        next = at + 1100;
        const delay = at - Date.now();
        if (delay > 0)
          await new Promise((resolve) => setTimeout(resolve, delay));
      }
      return fetch(input, init);
    },
  });
}
function failure(error) {
  // Do not serialize library errors: they may contain secret RPC URLs or request bodies.
  const chain = [];
  for (
    let item = error, depth = 0;
    item && depth < 6;
    item = item.cause, depth++
  ) {
    chain.push({
      name: typeof item.name === "string" ? item.name : "Error",
      code: typeof item.code === "number" ? item.code : undefined,
      httpStatus: typeof item.status === "number" ? item.status : undefined,
    });
  }
  return {
    reason: error.probeCode ?? "PROVIDER_REQUEST_FAILED",
    provider: ["primary", "secondary"].includes(error.provider)
      ? error.provider
      : undefined,
    chain,
  };
}
const normalizedLogs = (logs, sample) =>
  logs
    .map((log) => {
      if (
        log.removed ||
        log.address.toLowerCase() !== sample.address.toLowerCase() ||
        typeof log.blockNumber !== "bigint" ||
        log.blockNumber < BigInt(sample.from) ||
        log.blockNumber > BigInt(sample.to) ||
        !/^0x[0-9a-f]{64}$/i.test(log.blockHash ?? "") ||
        !/^0x[0-9a-f]{64}$/i.test(log.transactionHash ?? "") ||
        !Number.isSafeInteger(log.logIndex) ||
        log.logIndex < 0
      )
        throw fault("INVALID_LOG_RANGE_OR_IDENTITY");
      return {
        address: log.address.toLowerCase(),
        blockNumber: log.blockNumber,
        blockHash: log.blockHash.toLowerCase(),
        transactionHash: log.transactionHash.toLowerCase(),
        logIndex: log.logIndex,
        data: log.data.toLowerCase(),
        topics: log.topics.map((t) => t.toLowerCase()),
      };
    })
    .sort(
      (a, b) =>
        Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex,
    );

export async function probeArchivePair({
  urls,
  manifest,
  span = 5000,
  makeClient,
}) {
  if (urls.length !== 2 || urls.some((url) => !url))
    throw fault("TWO_RPC_URLS_REQUIRED");
  const parsed = urls.map((url) => new URL(url));
  if (
    parsed.some((url) => url.protocol !== "https:") ||
    parsed[0].hostname === parsed[1].hostname
  )
    throw fault("INDEPENDENT_HTTPS_PROVIDERS_REQUIRED");
  if (
    manifest.chainId !== 137 ||
    manifest.architecture !== "existing-governor" ||
    manifest.contracts.governor.address.toLowerCase() !==
      "0x7b9e327748462f1038c9d081c98d189b22c60a27" ||
    manifest.contracts.mana.address.toLowerCase() !==
      "0x2cacca1266653bb090d3fb511456ebca33150562"
  )
    throw fault("UNEXPECTED_MANIFEST");
  if (!Number.isSafeInteger(span) || span < 1000 || span > 5000)
    throw fault("PROBE_SPAN_MUST_BE_1000_TO_5000");
  const pair = urls.map((url) =>
    makeClient
      ? makeClient(url)
      : createPublicClient({
          transport: probeTransport(url),
        }),
  );
  const report = {
    checkedAt: new Date().toISOString(),
    chainId: 137,
    providers: parsed.map((url, index) => ({
      role: index ? "secondary" : "primary",
      hostname: url.hostname,
    })),
    span,
    passed: false,
    checks: [],
    scope:
      "Capability samples only; not proof of complete history or authorization to enable signing.",
  };
  const agree = async (read) => {
    const settled = await Promise.allSettled(pair.map(read));
    const failed = settled.findIndex((value) => value.status === "rejected");
    if (failed !== -1)
      throw Object.assign(fault("PROVIDER_REQUEST_FAILED"), {
        cause: settled[failed].reason,
        provider: failed === 0 ? "primary" : "secondary",
      });
    const values = settled.map((value) => value.value);
    if (serialize(values[0]) !== serialize(values[1]))
      throw fault("PROVIDER_DISAGREEMENT");
    return values[0];
  };
  const hashAt = async (blockNumber) => {
    const hash = await agree(
      async (client) =>
        (await client.getBlock({ blockNumber: BigInt(blockNumber) })).hash,
    );
    if (!/^0x[0-9a-f]{64}$/i.test(hash ?? ""))
      throw fault("INVALID_BLOCK_HASH");
    return hash;
  };
  try {
    if ((await agree((client) => client.getChainId())) !== 137)
      throw fault("WRONG_CHAIN");
    const heads = await Promise.all(
      pair.map((client) => client.getBlockNumber({ cacheTime: 0 })),
    );
    if (heads[0] > heads[1] + 8n || heads[1] > heads[0] + 8n)
      throw fault("HEAD_DIVERGENCE");
    const head = heads[0] < heads[1] ? heads[0] : heads[1];
    const latest = await agree(async (client) => {
      const block = await client.getBlock({ blockNumber: head });
      return { hash: block.hash, timestamp: block.timestamp };
    });
    const age = Date.now() / 1000 - Number(latest.timestamp);
    if (!Number.isFinite(age) || age > 180 || age < -30)
      throw fault("STALE_HEAD");
    report.confirmedHead = String(head - BigInt(manifest.confirmations));
    report.confirmedHash = await hashAt(report.confirmedHead);
  } catch (error) {
    report.checks.push({ name: "head", passed: false, ...failure(error) });
    return report;
  }
  const samples = [
    {
      name: "mana-deployment",
      address: manifest.contracts.mana.address,
      from: Number(manifest.contracts.mana.startBlock),
      knownBlock: Number(manifest.contracts.mana.startBlock),
    },
    {
      name: "governor-older-proposal",
      address: manifest.contracts.governor.address,
      from: 58427770,
      knownBlock: 58427770,
      tx: "0x862d1b68152e8c4b67d4db87cd892977a12eed1350a216d776ade0fc52737570",
    },
    {
      name: "governor-recent-proposal",
      address: manifest.contracts.governor.address,
      from: 89169940,
      knownBlock: 89169940,
      tx: "0x0add41071906a617dc7b43807fc1f1196648eab86d00c89dfb4ec351623fa605",
    },
  ].map((sample) => ({ ...sample, to: sample.from + span - 1 }));
  for (const sample of samples) {
    const started = Date.now();
    try {
      if (BigInt(sample.to) > BigInt(report.confirmedHead))
        throw fault("UNCONFIRMED_SAMPLE");
      const before = await hashAt(sample.to);
      const logs = await agree(async (client) =>
        normalizedLogs(
          await client.getLogs({
            address: sample.address,
            fromBlock: BigInt(sample.from),
            toBlock: BigInt(sample.to),
          }),
          sample,
        ),
      );
      if (
        !logs.some(
          (log) =>
            log.blockNumber === BigInt(sample.knownBlock) &&
            (!sample.tx || log.transactionHash === sample.tx),
        )
      )
        throw fault("KNOWN_HISTORICAL_EVENT_MISSING");
      const canonical = new Map();
      for (const log of logs) {
        if (!canonical.has(log.blockNumber))
          canonical.set(log.blockNumber, await hashAt(log.blockNumber));
        if (log.blockHash !== canonical.get(log.blockNumber))
          throw fault("NONCANONICAL_LOG");
      }
      if ((await hashAt(sample.to)) !== before)
        throw fault("REORG_DURING_PROBE");
      report.checks.push({
        name: sample.name,
        fromBlock: sample.from,
        toBlock: sample.to,
        passed: true,
        logs: logs.length,
        durationMs: Date.now() - started,
        endHash: before,
      });
    } catch (error) {
      report.checks.push({
        name: sample.name,
        fromBlock: sample.from,
        toBlock: sample.to,
        passed: false,
        durationMs: Date.now() - started,
        ...failure(error),
      });
    }
  }
  report.passed = report.checks.every((check) => check.passed);
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const infura = process.argv.includes("--infura");
    const output =
      process.argv.slice(2).find((arg) => arg !== "--infura") ??
      (infura
        ? "docs/evidence/infura-free-preflight.json"
        : "docs/evidence/archive-rpc-preflight.json");
    const report = await probeArchivePair({
      urls: infura
        ? infuraProbeUrls(process.env)
        : [
            process.env.INDEX_RPC_PRIMARY_URL,
            process.env.INDEX_RPC_SECONDARY_URL,
          ],
      manifest: JSON.parse(await readFile("deployments/polygon.json", "utf8")),
      span: Number(process.env.ARCHIVE_PROBE_BLOCKS ?? 5000),
    });
    await writeFile(output, JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
    });
    console.log(
      JSON.stringify({
        output,
        passed: report.passed,
        checks: report.checks.map(({ name, passed, reason }) => ({
          name,
          passed,
          reason,
        })),
      }),
    );
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify(failure(error)));
    process.exitCode = 1;
  }
}
