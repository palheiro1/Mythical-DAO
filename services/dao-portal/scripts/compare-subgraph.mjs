import { readFileSync, writeFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createPublicClient, http, decodeEventLog, parseAbi } from "viem";
import {
  GOVERNOR,
  MANA,
  requireValue,
  validateMeta,
  validateSources,
  graphQuery,
  pagedEvents,
  comparableEvent,
  queryConnection,
} from "../../dao-subgraph/scripts/validation.mjs";

const ROOT = new URL("../../dao-subgraph/", import.meta.url);
const expected = process.env.GRAPH_PILOT_DEPLOYMENT;
const metaFields =
  "_meta { deployment hasIndexingErrors block { number hash } }";
const statsFields =
  "chainId governor mana governorStartBlock manaStartBlock totalSupply holders proposals votes transfers";
const eventFields =
  "id eventKey contract name blockNumber blockHash transactionHash transactionIndex logIndex from to value owner spender account fromDelegate toDelegate previousVotes newVotes voter support weight reason proposal { proposalId description proposer targets values signatures calldatas voteStart voteEnd }";
const abi = [
  ...JSON.parse(readFileSync(new URL("abis/Governor.json", ROOT))),
  ...JSON.parse(readFileSync(new URL("abis/MANA.json", ROOT))),
];
const manaAbi = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function delegates(address) view returns (address)",
  "function getVotes(address) view returns (uint256)",
]);
const stable = (v) =>
  JSON.stringify(v, (_, x) =>
    typeof x === "bigint"
      ? String(x)
      : x && typeof x === "object" && !Array.isArray(x)
        ? Object.fromEntries(
            Object.entries(x).sort(([a], [b]) => a.localeCompare(b)),
          )
        : x,
  );
const lower = (value) =>
  typeof value === "string" && value.startsWith("0x")
    ? value.toLowerCase()
    : value;
const governorEvents = new Set([
  "ProposalCreated",
  "VoteCast",
  "ProposalExecuted",
  "ProposalCanceled",
]);
export function compareEventRows(indexed, canonical) {
  const rows = [...indexed].sort((a, b) =>
    a.eventKey.localeCompare(b.eventKey),
  );
  const logs = [...canonical].sort((a, b) =>
    a.eventKey.localeCompare(b.eventKey),
  );
  if (stable(rows.map(comparableEvent)) !== stable(logs.map(comparableEvent))) {
    const indexedByKey = new Map(
      rows.map((row) => [row.eventKey, comparableEvent(row)]),
    );
    const canonicalByKey = new Map(
      logs.map((row) => [row.eventKey, comparableEvent(row)]),
    );
    const differences = [
      ...new Set([...indexedByKey.keys(), ...canonicalByKey.keys()]),
    ]
      .flatMap((eventKey) => {
        const a = indexedByKey.get(eventKey),
          b = canonicalByKey.get(eventKey);
        const fields = !a
          ? ["missing-indexed-event"]
          : !b
            ? ["extra-indexed-event"]
            : Object.keys(a).filter((key) => stable(a[key]) !== stable(b[key]));
        return fields.length ? [{ eventKey, fields }] : [];
      })
      .slice(0, 20);
    throw Object.assign(new Error("EVENT_SAMPLE_MISMATCH"), {
      comparison: { indexed: rows.length, canonical: logs.length, differences },
    });
  }
  for (let i = 0; i < rows.length; i++) {
    if (logs[i].proposalId)
      requireValue(
        rows[i].proposal?.proposalId === logs[i].proposalId,
        "PROPOSAL_ID_MISMATCH",
      );
    if (logs[i].proposal)
      requireValue(
        stable(rows[i].proposal) === stable(logs[i].proposal),
        "PROPOSAL_ACTIONS_MISMATCH",
      );
  }
}
export async function verifyGovernorInventory(rows, stats, anchor, readBlock) {
  requireValue(Array.isArray(rows), "EVENTS_MISSING");
  const keys = new Set();
  for (const row of rows) {
    requireValue(
      row.contract === GOVERNOR && governorEvents.has(row.name),
      "GOVERNOR_EVENT_IDENTITY_MISMATCH",
    );
    requireValue(!keys.has(row.eventKey), "DUPLICATE_EVENT");
    keys.add(row.eventKey);
    const block = Number(row.blockNumber);
    requireValue(
      Number.isSafeInteger(block) && block >= 48674443 && block <= anchor,
      "EVENT_BLOCK_INVALID",
    );
  }
  const counts = Object.fromEntries(
    [...governorEvents].map((name) => [
      name,
      rows.filter((row) => row.name === name).length,
    ]),
  );
  requireValue(
    String(counts.ProposalCreated) === stats.proposals &&
      String(counts.VoteCast) === stats.votes,
    "GOVERNOR_COUNTS_MISMATCH",
  );
  const blocks = [...new Set(rows.map((row) => Number(row.blockNumber)))].sort(
    (a, b) => a - b,
  );
  requireValue(blocks.length <= 100, "GOVERNOR_VERIFICATION_LIMIT_EXCEEDED");
  for (const block of blocks) {
    const { hash, events } = await readBlock(block);
    const indexed = rows.filter((row) => Number(row.blockNumber) === block);
    const canonical = events.filter(
      (row) => row.contract === GOVERNOR && governorEvents.has(row.name),
    );
    requireValue(
      [...indexed, ...canonical].every(
        (row) => row.blockHash === hash && Number(row.blockNumber) === block,
      ),
      "EVENT_BLOCK_HASH_MISMATCH",
    );
    compareEventRows(indexed, canonical);
  }
  return {
    status: "indexed-events-verified",
    events: rows.length,
    counts,
    blocks,
    completeHistoryVerified: false,
    limitation:
      "Verifies every indexed Governor event and all Governor events in those blocks. Does not discover events omitted from entirely absent blocks. Optional D1 reconciliation is reported separately.",
  };
}
export function comparisonRpcUrls(env, useInfura = false) {
  if (useInfura)
    requireValue(
      /^[a-zA-Z0-9_-]{20,128}$/.test(env.INFURA_API_KEY || ""),
      "INFURA_KEY_REQUIRED",
    );
  return [
    env.GRAPH_RPC_PRIMARY ||
      (useInfura
        ? `https://polygon-mainnet.infura.io/v3/${env.INFURA_API_KEY}`
        : "https://polygon.drpc.org"),
    env.GRAPH_RPC_SECONDARY || "https://tenderly.rpc.polygon.community",
  ];
}
function pacedFetch() {
  let pending = Promise.resolve(),
    last = 0;
  return (url, options) => {
    const next = pending.then(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, 1100 - (Date.now() - last))),
      );
      last = Date.now();
      return fetch(url, options);
    });
    pending = next.then(
      () => {},
      () => {},
    );
    return next;
  };
}
async function agree(pair, fn, stage = "RPC") {
  const responses = await Promise.allSettled(pair.map(fn));
  requireValue(
    responses.every((r) => r.status === "fulfilled"),
    `${stage}_READ_FAILED`,
  );
  const [a, b] = responses.map((r) => r.value);
  requireValue(stable(a) === stable(b), `${stage}_DIVERGENCE`);
  return a;
}
export function fromLog(log) {
  let decoded;
  try {
    decoded = decodeEventLog({
      abi,
      data: log.data,
      topics: log.topics,
      strict: true,
    });
  } catch {
    return null;
  }
  return fromDecoded(log, decoded);
}
function fromDecoded(log, decoded) {
  const row = {
    eventKey: `137:${log.address.toLowerCase()}:${log.transactionHash.toLowerCase()}:${log.logIndex}`,
    contract: log.address.toLowerCase(),
    name: decoded.eventName,
    blockNumber: String(log.blockNumber),
    blockHash: log.blockHash.toLowerCase(),
    transactionHash: log.transactionHash.toLowerCase(),
    transactionIndex: String(log.transactionIndex),
    logIndex: String(log.logIndex),
  };
  const args = decoded.args;
  for (const key of [
    "from",
    "to",
    "value",
    "owner",
    "spender",
    "fromDelegate",
    "toDelegate",
    "previousVotes",
    "newVotes",
    "voter",
    "weight",
  ])
    if (args[key] !== undefined) row[key] = lower(String(args[key]));
  if (args.reason !== undefined) row.reason = args.reason;
  if (args.support !== undefined) row.support = Number(args.support);
  if (args.delegator || args.delegate)
    row.account = lower(args.delegator || args.delegate);
  if (args.proposalId !== undefined) row.proposalId = String(args.proposalId);
  if (decoded.eventName === "ProposalCreated")
    row.proposal = Object.fromEntries(
      [
        "proposalId",
        "description",
        "proposer",
        "targets",
        "values",
        "signatures",
        "calldatas",
        "voteStart",
        "voteEnd",
      ].map((k) => [
        k,
        Array.isArray(args[k])
          ? args[k].map((v) =>
              k === "signatures" ? String(v) : lower(String(v)),
            )
          : k === "description"
            ? args[k]
            : lower(String(args[k])),
      ]),
    );
  return row;
}
export function reconcileD1Governor(indexed, d1Rows, anchor) {
  requireValue(
    Array.isArray(d1Rows) && d1Rows.length <= 2500,
    "D1_EXPORT_LIMIT_EXCEEDED",
  );
  const byKey = new Map(indexed.map((row) => [row.eventKey, row]));
  const keys = new Set();
  let matched = 0,
    aheadOfAnchor = 0;
  for (const row of d1Rows) {
    requireValue(
      row.chain_id === 137 &&
        row.contract === GOVERNOR &&
        governorEvents.has(row.event_name),
      "D1_SOURCE_MISMATCH",
    );
    requireValue(
      Number.isSafeInteger(row.block_number) && row.block_number >= 48674443,
      "D1_BLOCK_INVALID",
    );
    const canonical = fromDecoded(
      {
        address: row.contract,
        blockNumber: row.block_number,
        blockHash: row.block_hash,
        transactionHash: row.tx_hash,
        logIndex: row.log_index,
        transactionIndex: 0,
      },
      { eventName: row.event_name, args: JSON.parse(row.args_json) },
    );
    requireValue(!keys.has(canonical.eventKey), "D1_DUPLICATE_EVENT");
    keys.add(canonical.eventKey);
    if (row.block_number > anchor) {
      aheadOfAnchor++;
      continue;
    }
    const graph = byKey.get(canonical.eventKey);
    requireValue(graph, "D1_EVENT_MISSING_FROM_GRAPH");
    // D1 stores transaction hash/log index but not transaction index. That field
    // is verified against RPC in verifyGovernorInventory, not in this export.
    canonical.transactionIndex = graph.transactionIndex;
    compareEventRows([graph], [canonical]);
    matched++;
  }
  return {
    matched,
    aheadOfAnchor,
    indexedEventsNotInD1: indexed.filter((row) => !keys.has(row.eventKey))
      .length,
    completeHistoryVerified: false,
    transactionIndexStoredInD1: false,
  };
}
async function run() {
  const connection = queryConnection(
    process.env,
    process.argv.includes("--gateway"),
  );
  const query = (q, v) => graphQuery(connection.url, q, v, fetch, connection);
  requireValue(
    !process.env.GRAPH_D1_EVENTS_PATH ||
      process.argv.includes("--governor-events"),
    "D1_REQUIRES_GOVERNOR_EVENTS",
  );
  requireValue(
    connection.url && expected,
    "Set GRAPH_PILOT_URL and GRAPH_PILOT_DEPLOYMENT after Studio deployment.",
  );
  const urls = comparisonRpcUrls(
    process.env,
    process.argv.includes("--infura"),
  );
  requireValue(
    urls.every((u) => new URL(u).protocol === "https:") &&
      new URL(urls[0]).hostname !== new URL(urls[1]).hostname,
    "INDEPENDENT_HTTPS_RPCS_REQUIRED",
  );
  const pair = urls.map((url) =>
    createPublicClient({
      transport: http(url, {
        timeout: 15000,
        retryCount: 1,
        // Keep this bounded manual check below Infura Free's request budget.
        fetchFn:
          new URL(url).hostname === "polygon-mainnet.infura.io"
            ? pacedFetch()
            : undefined,
      }),
    }),
  );
  requireValue(
    (await agree(pair, (c) => c.getChainId(), "RPC_CHAIN")) === 137,
    "WRONG_CHAIN",
  );
  const heads = await Promise.all(
    pair.map((c) => c.getBlockNumber({ cacheTime: 0 })),
  );
  requireValue(
    heads[0] - heads[1] <= 8n && heads[1] - heads[0] <= 8n,
    "RPC_HEAD_DIVERGENCE",
  );
  const latest = await query(`{ ${metaFields} }`);
  validateMeta(latest._meta, expected);
  const confirmed = (heads[0] < heads[1] ? heads[0] : heads[1]) - 64n;
  const anchor = Number(
    BigInt(latest._meta.block.number) < confirmed
      ? BigInt(latest._meta.block.number)
      : confirmed,
  );
  const hash = await agree(
    pair,
    async (c) =>
      (await c.getBlock({ blockNumber: BigInt(anchor) })).hash.toLowerCase(),
    "RPC_ANCHOR",
  );
  // Graph Node returns a null _meta.block.hash for number-based queries.
  // Pin every entity read to the canonical hash agreed by both RPCs instead.
  const anchored = await query(
    `query($hash:Bytes!){ _meta(block:{hash:$hash}) {deployment hasIndexingErrors block{number hash}} pilotStats(id:"137",block:{hash:$hash}) {${statsFields}} }`,
    { hash },
  );
  validateMeta(anchored._meta, expected, anchor, hash);
  validateSources(anchored.pilotStats);
  const supply = await agree(
    pair,
    (c) =>
      c.readContract({
        address: MANA,
        abi: manaAbi,
        functionName: "totalSupply",
        blockNumber: BigInt(anchor),
      }),
    "RPC_SUPPLY",
  );
  requireValue(
    String(supply) === anchored.pilotStats.totalSupply,
    "SUPPLY_MISMATCH",
  );
  const members = [GOVERNOR, "0xc4ccc6a11329558582c2da79c18a9aeac00f59f9"];
  const accountChecks = [];
  for (const member of members) {
    const data = await query(
      "query($id:Bytes!,$hash:Bytes!){manaAccount(id:$id,block:{hash:$hash}){balance votingPower delegate}}",
      { id: member, hash },
    );
    const actual = await agree(
      pair,
      async (c) => {
        const values = [];
        for (const fn of ["balanceOf", "getVotes", "delegates"])
          values.push(
            String(
              await c.readContract({
                address: MANA,
                abi: manaAbi,
                functionName: fn,
                args: [member],
                blockNumber: BigInt(anchor),
              }),
            ).toLowerCase(),
          );
        return values;
      },
      "RPC_ACCOUNT",
    );
    const indexed = data.manaAccount || {
      balance: "0",
      votingPower: "0",
      delegate: "0x" + "0".repeat(40),
    };
    requireValue(
      stable(actual) ===
        stable([indexed.balance, indexed.votingPower, indexed.delegate]),
      "ACCOUNT_MISMATCH",
    );
    accountChecks.push({
      address: member,
      balance: actual[0],
      votingPower: actual[1],
      delegate: actual[2],
    });
  }
  const samples = [
    [MANA, 45785116, 45790115],
    [GOVERNOR, 58427770, 58432769],
    [GOVERNOR, 89169940, 89174939],
  ];
  const checked = [],
    pending = [];
  for (const [address, from, to] of samples) {
    if (anchor < to) {
      pending.push({ address, from, to });
      continue;
    }
    const onChain = await agree(
      pair,
      async (c) =>
        (
          await c.getLogs({
            address,
            fromBlock: BigInt(from),
            toBlock: BigInt(to),
          })
        )
          .map(fromLog)
          .filter(Boolean)
          .sort((a, b) => a.eventKey.localeCompare(b.eventKey)),
      "RPC_EVENT_SAMPLE",
    );
    const rows = await pagedEvents(
      (vars) =>
        query(
          `query($hash:Bytes!,$address:Bytes!,$from:BigInt!,$to:BigInt!,$after:Bytes!){eventRecords(first:500,orderBy:id,orderDirection:asc,block:{hash:$hash},where:{contract:$address,blockNumber_gte:$from,blockNumber_lte:$to,id_gt:$after}){${eventFields}}}`,
          vars,
        ),
      { hash, address, from: String(from), to: String(to) },
    );
    compareEventRows(rows, onChain);
    checked.push({ address, from, to, events: rows.length });
  }
  let governorInventory;
  if (process.argv.includes("--governor-events")) {
    const rows = await pagedEvents(
      (vars) =>
        query(
          `query($hash:Bytes!,$address:Bytes!,$after:Bytes!){eventRecords(first:500,orderBy:id,orderDirection:asc,block:{hash:$hash},where:{contract:$address,id_gt:$after}){${eventFields}}}`,
          vars,
        ),
      { hash, address: GOVERNOR },
    );
    governorInventory = await verifyGovernorInventory(
      rows,
      anchored.pilotStats,
      anchor,
      async (block) => {
        const events = await agree(
          pair,
          async (c) =>
            (
              await c.getLogs({
                address: GOVERNOR,
                fromBlock: BigInt(block),
                toBlock: BigInt(block),
              })
            )
              .map(fromLog)
              .filter(Boolean)
              .sort((a, b) => a.eventKey.localeCompare(b.eventKey)),
          "RPC_GOVERNOR_EVENTS",
        );
        const blockHash = await agree(
          pair,
          async (c) =>
            (
              await c.getBlock({ blockNumber: BigInt(block) })
            ).hash.toLowerCase(),
          "RPC_GOVERNOR_BLOCK",
        );
        return { hash: blockHash, events };
      },
    );
    if (process.env.GRAPH_D1_EVENTS_PATH) {
      requireValue(
        statSync(process.env.GRAPH_D1_EVENTS_PATH).size <= 4_000_000,
        "D1_EXPORT_TOO_LARGE",
      );
      const exported = JSON.parse(
        readFileSync(process.env.GRAPH_D1_EVENTS_PATH, "utf8"),
      );
      requireValue(
        Array.isArray(exported) &&
          exported.length === 1 &&
          exported[0].success === true,
        "D1_EXPORT_FAILED",
      );
      const d1Rows = exported[0].results;
      governorInventory.d1 = reconcileD1Governor(rows, d1Rows, anchor);
    }
  }
  requireValue(
    (await agree(
      pair,
      async (c) =>
        (await c.getBlock({ blockNumber: BigInt(anchor) })).hash.toLowerCase(),
      "RPC_FINAL_ANCHOR",
    )) === hash,
    "ANCHOR_CHANGED",
  );
  const finalMeta = await query(
    "query($hash:Bytes!){_meta(block:{hash:$hash}){deployment hasIndexingErrors block{number hash}}}",
    { hash },
  );
  validateMeta(finalMeta._meta, expected, anchor, hash);
  return {
    checkedAt: new Date().toISOString(),
    deployment: expected,
    endpointKind: connection.kind,
    status: pending.length ? "partial" : "samples-passed",
    anchor,
    hash,
    latestIndexedBlock: latest._meta.block.number,
    confirmedHead: String(confirmed),
    stats: anchored.pilotStats,
    accountChecks,
    checked,
    pending,
    governorInventory,
    limitation:
      "Sample verification only; not a full-history or reorg acceptance test. The portal remains on D1.",
  };
}
export async function main() {
  try {
    const report = await run();
    const text = JSON.stringify(report, null, 2) + "\n";
    if (process.env.GRAPH_REPORT_PATH)
      writeFileSync(process.env.GRAPH_REPORT_PATH, text, { mode: 0o600 });
    console.log(text);
    if (report.status === "partial") process.exitCode = 2;
  } catch (error) {
    // Never print RPC/Graph URLs, headers, bodies or nested transport errors.
    const message =
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "COMPARISON_FAILED_CHECK_CONFIGURATION_OR_PROVIDERS";
    console.error(message);
    if (message === "EVENT_SAMPLE_MISMATCH")
      console.error(JSON.stringify(error.comparison));
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
