export const GOVERNOR = '0x7b9e327748462f1038c9d081c98d189b22c60a27';
export const MANA = '0x2cacca1266653bb090d3fb511456ebca33150562';
export function requireValue(condition, reason) { if (!condition) throw new Error(reason); }
export function validateMeta(meta, expectedDeployment, anchor, hash) {
  requireValue(typeof expectedDeployment === 'string' && expectedDeployment.length > 20, 'EXPECTED_DEPLOYMENT_REQUIRED');
  requireValue(meta?.deployment === expectedDeployment, 'DEPLOYMENT_MISMATCH');
  requireValue(meta?.hasIndexingErrors === false, 'INDEXING_ERRORS');
  requireValue(Number.isSafeInteger(meta?.block?.number) && meta.block.number >= 45785116, 'INDEX_NOT_READY');
  if (anchor !== undefined) {
    requireValue(meta.block.number === anchor, 'ANCHOR_MISMATCH');
    requireValue(meta.block.hash?.toLowerCase() === hash?.toLowerCase(), 'BLOCK_HASH_MISMATCH');
  }
}
export function validateSources(stats) {
  requireValue(stats?.chainId === 137 && stats.governor === GOVERNOR && stats.mana === MANA &&
    stats.governorStartBlock === '48674443' && stats.manaStartBlock === '45785116', 'SOURCE_IDENTITY_MISMATCH');
}
export async function graphQuery(url, query, variables = {}, fetcher = fetch) {
  const parsed = new URL(url);
  requireValue(parsed.protocol === 'https:' && !parsed.username && !parsed.password, 'HTTPS_ENDPOINT_REQUIRED');
  const response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30_000) });
  requireValue(response.ok, 'GRAPH_HTTP_FAILED');
  const text = await response.text();
  requireValue(text.length < 4_000_000, 'GRAPH_RESPONSE_TOO_LARGE');
  const result = JSON.parse(text);
  requireValue(!result.errors?.length && result.data, 'GRAPH_QUERY_FAILED');
  return result.data;
}
export async function pagedEvents(query, variables) {
  const rows = []; let after = '0x';
  for (let page = 0; page < 5; page++) {
    const result = await query({ ...variables, after });
    requireValue(Array.isArray(result.eventRecords), 'EVENTS_MISSING');
    const batch = result.eventRecords;
    for (const row of batch) {
      requireValue(typeof row.id === 'string' && row.id > after, 'PAGINATION_ORDER_INVALID');
      after = row.id; rows.push(row);
    }
    if (batch.length < 500) return rows;
  }
  throw new Error('EVENT_SAMPLE_LIMIT_EXCEEDED');
}
export function comparableEvent(row) {
  const keys = ['eventKey','contract','name','blockNumber','blockHash','transactionHash','transactionIndex','logIndex',
    'from','to','value','owner','spender','account','fromDelegate','toDelegate','previousVotes','newVotes','voter','support','weight','reason'];
  return Object.fromEntries(keys.map(k => [k, row[k] ?? null]));
}
