import { readFileSync, writeFileSync } from "node:fs";
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
} from "../../dao-subgraph/scripts/validation.mjs";

const ROOT = new URL("../../dao-subgraph/", import.meta.url);
const expected = process.env.GRAPH_PILOT_DEPLOYMENT;
const endpoint = process.env.GRAPH_PILOT_URL;
const metaFields =
  "_meta { deployment hasIndexingErrors block { number hash } }";
const statsFields =
  "chainId governor mana governorStartBlock manaStartBlock totalSupply holders proposals votes transfers";
const eventFields =
  "id eventKey contract name blockNumber blockHash transactionHash transactionIndex logIndex from to value owner spender account fromDelegate toDelegate previousVotes newVotes voter support weight reason proposal { proposalId description proposer targets values signatures calldatas voteStart voteEnd }";
const query = (q, v) => graphQuery(endpoint, q, v);
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
async function agree(pair, fn) {
  const responses = await Promise.allSettled(pair.map(fn));
  requireValue(
    responses.every((r) => r.status === "fulfilled"),
    "RPC_READ_FAILED",
  );
  const [a, b] = responses.map((r) => r.value);
  requireValue(stable(a) === stable(b), "RPC_DIVERGENCE");
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
async function run() {
  requireValue(
    endpoint && expected,
    "Set GRAPH_PILOT_URL and GRAPH_PILOT_DEPLOYMENT after Studio deployment.",
  );
  const urls = [
    process.env.GRAPH_RPC_PRIMARY || "https://polygon.drpc.org",
    process.env.GRAPH_RPC_SECONDARY || "https://tenderly.rpc.polygon.community",
  ];
  requireValue(
    urls.every((u) => new URL(u).protocol === "https:") &&
      new URL(urls[0]).hostname !== new URL(urls[1]).hostname,
    "INDEPENDENT_HTTPS_RPCS_REQUIRED",
  );
  const pair = urls.map((url) =>
    createPublicClient({
      transport: http(url, { timeout: 15000, retryCount: 1 }),
    }),
  );
  requireValue(
    (await agree(pair, (c) => c.getChainId())) === 137,
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
  const hash = await agree(pair, async (c) =>
    (await c.getBlock({ blockNumber: BigInt(anchor) })).hash.toLowerCase(),
  );
  const anchored = await query(
    `query($block:Int!){ _meta(block:{number:$block}) {deployment hasIndexingErrors block{number hash}} pilotStats(id:"137",block:{number:$block}) {${statsFields}} }`,
    { block: anchor },
  );
  validateMeta(anchored._meta, expected, anchor, hash);
  validateSources(anchored.pilotStats);
  const supply = await agree(pair, (c) =>
    c.readContract({
      address: MANA,
      abi: manaAbi,
      functionName: "totalSupply",
      blockNumber: BigInt(anchor),
    }),
  );
  requireValue(
    String(supply) === anchored.pilotStats.totalSupply,
    "SUPPLY_MISMATCH",
  );
  const members = [GOVERNOR, "0xc4ccc6a11329558582c2da79c18a9aeac00f59f9"];
  const accountChecks = [];
  for (const member of members) {
    const data = await query(
      "query($id:Bytes!,$block:Int!){manaAccount(id:$id,block:{number:$block}){balance votingPower delegate}}",
      { id: member, block: anchor },
    );
    const actual = await agree(pair, async (c) => {
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
    });
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
    const onChain = await agree(pair, async (c) =>
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
    );
    const rows = await pagedEvents(
      (vars) =>
        query(
          `query($block:Int!,$address:Bytes!,$from:BigInt!,$to:BigInt!,$after:Bytes!){eventRecords(first:500,orderBy:id,orderDirection:asc,block:{number:$block},where:{contract:$address,blockNumber_gte:$from,blockNumber_lte:$to,id_gt:$after}){${eventFields}}}`,
          vars,
        ),
      { block: anchor, address, from: String(from), to: String(to) },
    );
    rows.sort((a, b) => a.eventKey.localeCompare(b.eventKey));
    requireValue(
      stable(rows.map(comparableEvent)) ===
        stable(onChain.map(comparableEvent)),
      "EVENT_SAMPLE_MISMATCH",
    );
    for (let i = 0; i < rows.length; i++) {
      if (onChain[i].proposalId)
        requireValue(
          rows[i].proposal?.proposalId === onChain[i].proposalId,
          "PROPOSAL_ID_MISMATCH",
        );
      if (onChain[i].proposal)
        requireValue(
          stable(rows[i].proposal) === stable(onChain[i].proposal),
          "PROPOSAL_ACTIONS_MISMATCH",
        );
    }
    checked.push({ address, from, to, events: rows.length });
  }
  requireValue(
    (await agree(pair, async (c) =>
      (await c.getBlock({ blockNumber: BigInt(anchor) })).hash.toLowerCase(),
    )) === hash,
    "ANCHOR_CHANGED",
  );
  const finalMeta = await query(
    "query($block:Int!){_meta(block:{number:$block}){deployment hasIndexingErrors block{number hash}}}",
    { block: anchor },
  );
  validateMeta(finalMeta._meta, expected, anchor, hash);
  return {
    checkedAt: new Date().toISOString(),
    deployment: expected,
    status: pending.length ? "partial" : "samples-passed",
    anchor,
    hash,
    latestIndexedBlock: latest._meta.block.number,
    confirmedHead: String(confirmed),
    stats: anchored.pilotStats,
    accountChecks,
    checked,
    pending,
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
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
