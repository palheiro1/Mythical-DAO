export const GOVERNOR = "0x7b9e327748462f1038c9d081c98d189b22c60a27";
export const MANA = "0x2cacca1266653bb090d3fb511456ebca33150562";
export const SUBGRAPH_ID = "56FJGyLgf4QM8C7DNVKjzv4xUMPfWuLSzLsGeEheiZUb";
export const GATEWAY_URL = `https://gateway.thegraph.com/api/subgraphs/id/${SUBGRAPH_ID}`;
export function queryConnection(env, gateway = false) {
  if (!gateway) return { url: env.GRAPH_PILOT_URL, kind: "studio-development" };
  requireValue(
    /^[a-zA-Z0-9_-]{16,256}$/.test(env.GRAPH_API_KEY || ""),
    "GRAPH_API_KEY_REQUIRED",
  );
  return {
    url: GATEWAY_URL,
    apiKey: env.GRAPH_API_KEY,
    kind: "network-gateway",
  };
}
export function requireValue(condition, reason) {
  if (!condition) throw new Error(reason);
}
export function validateMeta(meta, expectedDeployment, anchor, hash) {
  requireValue(
    typeof expectedDeployment === "string" && expectedDeployment.length > 20,
    "EXPECTED_DEPLOYMENT_REQUIRED",
  );
  requireValue(meta?.deployment === expectedDeployment, "DEPLOYMENT_MISMATCH");
  requireValue(meta?.hasIndexingErrors === false, "INDEXING_ERRORS");
  requireValue(
    Number.isSafeInteger(meta?.block?.number) && meta.block.number >= 45785116,
    "INDEX_NOT_READY",
  );
  if (anchor !== undefined) {
    requireValue(meta.block.number === anchor, "ANCHOR_MISMATCH");
    requireValue(
      meta.block.hash?.toLowerCase() === hash?.toLowerCase(),
      "BLOCK_HASH_MISMATCH",
    );
  }
}
export function validateSources(stats) {
  requireValue(
    stats?.chainId === 137 &&
      stats.governor === GOVERNOR &&
      stats.mana === MANA &&
      stats.governorStartBlock === "48674443" &&
      stats.manaStartBlock === "45785116",
    "SOURCE_IDENTITY_MISMATCH",
  );
}
export async function graphQuery(
  url,
  query,
  variables = {},
  fetcher = fetch,
  { apiKey } = {},
) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("HTTPS_ENDPOINT_REQUIRED");
  }
  requireValue(
    parsed.protocol === "https:" && !parsed.username && !parsed.password,
    "HTTPS_ENDPOINT_REQUIRED",
  );
  const headers = { "Content-Type": "application/json" };
  if (apiKey !== undefined) {
    requireValue(
      parsed.href === GATEWAY_URL,
      "GRAPH_CREDENTIAL_DESTINATION_REJECTED",
    );
    requireValue(
      /^[a-zA-Z0-9_-]{16,256}$/.test(apiKey),
      "GRAPH_API_KEY_REQUIRED",
    );
    headers.Authorization = `Bearer ${apiKey}`;
    // Fixed portal origin authorized by the user. Never forwarded from a caller.
    headers.Origin = "https://dao-preview.mythicalbeings.io";
  }
  let response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers,
      redirect: "error",
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("GRAPH_REQUEST_FAILED");
  }
  requireValue(response.ok, "GRAPH_HTTP_FAILED");
  requireValue(response.body, "GRAPH_BODY_MISSING");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      requireValue(length <= 4_000_000, "GRAPH_RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw new Error(
      error?.message === "GRAPH_RESPONSE_TOO_LARGE"
        ? error.message
        : "GRAPH_BODY_READ_FAILED",
    );
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let result;
  try {
    result = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("GRAPH_RESPONSE_INVALID");
  }
  requireValue(
    result && !result.errors?.length && result.data,
    "GRAPH_QUERY_FAILED",
  );
  return result.data;
}
export async function pagedEvents(query, variables) {
  const rows = [];
  let after = "0x";
  for (let page = 0; page < 5; page++) {
    const result = await query({ ...variables, after });
    requireValue(Array.isArray(result.eventRecords), "EVENTS_MISSING");
    const batch = result.eventRecords;
    for (const row of batch) {
      requireValue(
        typeof row.id === "string" && row.id > after,
        "PAGINATION_ORDER_INVALID",
      );
      after = row.id;
      rows.push(row);
    }
    if (batch.length < 500) return rows;
  }
  throw new Error("EVENT_SAMPLE_LIMIT_EXCEEDED");
}
export function comparableEvent(row) {
  const keys = [
    "eventKey",
    "contract",
    "name",
    "blockNumber",
    "blockHash",
    "transactionHash",
    "transactionIndex",
    "logIndex",
    "from",
    "to",
    "value",
    "owner",
    "spender",
    "account",
    "fromDelegate",
    "toDelegate",
    "previousVotes",
    "newVotes",
    "voter",
    "support",
    "weight",
    "reason",
  ];
  return Object.fromEntries(
    keys.map((k) => [
      k,
      // graph-cli's nullable string setter unsets an empty VoteCast reason.
      // Only this field/event has an on-chain empty-string equivalent to null.
      k === "reason" && row.name === "VoteCast"
        ? (row[k] ?? "")
        : (row[k] ?? null),
    ]),
  );
}

export const PILOT_DEPLOYMENT =
  "QmQ5GTG5cGpPDXc9duief12uyPsALnq569DJUY8PVvN7BW";
export const PILOT_LIMITS = Object.freeze({
  accounts: 200,
  proposals: 50,
  lag: 256,
});
const uint = (value) =>
  typeof value === "string" &&
  /^(0|[1-9]\d{0,77})$/.test(value) &&
  BigInt(value) < 1n << 256n;
const address = (value) =>
  typeof value === "string" && /^0x[0-9a-f]{40}$/.test(value);
const hex = (value) =>
  typeof value === "string" && /^0x([0-9a-f]{2})*$/.test(value);
export const pilotMetaQuery =
  "{_meta{deployment hasIndexingErrors block{number hash}}}";
export const pilotSnapshotQuery = `query($hash:Bytes!){
  _meta(block:{hash:$hash}){deployment hasIndexingErrors block{number hash}}
  pilotStats(id:"137",block:{hash:$hash}){chainId governor mana governorStartBlock manaStartBlock totalSupply holders proposals votes transfers delegationChanges}
  manaAccounts(first:201,orderBy:id,orderDirection:asc,block:{hash:$hash}){id balance votingPower delegate}
  proposals(first:51,orderBy:id,orderDirection:asc,block:{hash:$hash}){id proposalId governor proposer description targets values signatures calldatas voteStart voteEnd againstVotes forVotes abstainVotes executed canceled}
}`;
export function pilotAnchor(latest, confirmed) {
  validateMeta(latest, PILOT_DEPLOYMENT);
  requireValue(
    Number.isSafeInteger(confirmed) && confirmed >= 48674443,
    "CONFIRMED_HEAD_INVALID",
  );
  requireValue(
    latest.block.number >= confirmed - PILOT_LIMITS.lag,
    "GRAPH_STALE_HEAD",
  );
  return Math.min(latest.block.number, confirmed);
}
export function validatePilotSnapshot(data, anchor, hash) {
  validateMeta(data?._meta, PILOT_DEPLOYMENT, anchor, hash);
  validateSources(data.pilotStats);
  const stats = data.pilotStats;
  for (const k of [
    "totalSupply",
    "holders",
    "proposals",
    "votes",
    "transfers",
    "delegationChanges",
  ])
    requireValue(uint(stats[k]), "GRAPH_STATS_INVALID");
  requireValue(
    Array.isArray(data.manaAccounts) &&
      data.manaAccounts.length <= PILOT_LIMITS.accounts,
    "GRAPH_ACCOUNT_LIMIT",
  );
  requireValue(
    Array.isArray(data.proposals) &&
      data.proposals.length <= PILOT_LIMITS.proposals,
    "GRAPH_PROPOSAL_LIMIT",
  );
  let previous = "",
    supply = 0n,
    holders = 0n;
  for (const row of data.manaAccounts) {
    requireValue(
      address(row.id) &&
        row.id > previous &&
        address(row.delegate) &&
        [row.balance, row.votingPower].every(uint),
      "GRAPH_ACCOUNT_INVALID",
    );
    previous = row.id;
    supply += BigInt(row.balance);
    if (BigInt(row.balance) > 0n) holders++;
  }
  requireValue(
    String(supply) === stats.totalSupply && String(holders) === stats.holders,
    "GRAPH_ACCOUNT_TOTALS_MISMATCH",
  );
  requireValue(
    String(data.proposals.length) === stats.proposals,
    "GRAPH_PROPOSAL_COUNT_MISMATCH",
  );
  const ids = new Set();
  for (const p of data.proposals) {
    requireValue(
      uint(p.proposalId) &&
        !ids.has(p.proposalId) &&
        p.governor === GOVERNOR &&
        address(p.proposer),
      "GRAPH_PROPOSAL_IDENTITY_INVALID",
    );
    ids.add(p.proposalId);
    requireValue(
      [
        "voteStart",
        "voteEnd",
        "againstVotes",
        "forVotes",
        "abstainVotes",
      ].every((k) => uint(p[k])) && BigInt(p.voteEnd) >= BigInt(p.voteStart),
      "GRAPH_PROPOSAL_INVALID",
    );
    requireValue(
      typeof p.executed === "boolean" &&
        typeof p.canceled === "boolean" &&
        !(p.executed && p.canceled),
      "GRAPH_PROPOSAL_INVALID",
    );
    requireValue(
      typeof p.description === "string" &&
        p.description.length <= 100000 &&
        Array.isArray(p.targets) &&
        p.targets.length > 0 &&
        p.targets.length <= 100,
      "GRAPH_ACTIONS_INVALID",
    );
    requireValue(
      Array.isArray(p.values) &&
        Array.isArray(p.calldatas) &&
        Array.isArray(p.signatures) &&
        [p.values, p.calldatas, p.signatures].every(
          (a) => a.length === p.targets.length,
        ),
      "GRAPH_ACTIONS_INVALID",
    );
    requireValue(
      p.targets.every(address) &&
        p.values.every(uint) &&
        p.calldatas.every(hex) &&
        p.signatures.every((s) => s === ""),
      "GRAPH_ACTIONS_INVALID",
    );
  }
  return data;
}
/** Checks all returned entities against independently agreed RPC reads. Does not discover missing event blocks. */
export async function verifyPilotEntities(snapshot, readAccount, readProposal) {
  for (const account of snapshot.manaAccounts) {
    const actual = await readAccount(account.id);
    requireValue(
      actual.balance === account.balance &&
        actual.votingPower === account.votingPower &&
        actual.delegate.toLowerCase() === account.delegate,
      "GRAPH_ACCOUNT_RPC_MISMATCH",
    );
  }
  for (const proposal of snapshot.proposals) {
    const actual = await readProposal(proposal);
    requireValue(
      actual.proposalId === proposal.proposalId &&
        actual.voteStart === proposal.voteStart &&
        actual.voteEnd === proposal.voteEnd &&
        actual.executed === proposal.executed &&
        actual.canceled === proposal.canceled &&
        JSON.stringify(actual.votes) ===
          JSON.stringify([
            proposal.againstVotes,
            proposal.forVotes,
            proposal.abstainVotes,
          ]),
      "GRAPH_PROPOSAL_RPC_MISMATCH",
    );
  }
  return {
    accounts: snapshot.manaAccounts.length,
    proposals: snapshot.proposals.length,
    fullHistoryVerified: false,
  };
}
