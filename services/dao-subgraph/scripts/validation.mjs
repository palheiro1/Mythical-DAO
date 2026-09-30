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
