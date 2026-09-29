/** Persistent per-source learning; never changes a cursor or relaxes RPC agreement. */
export interface BatchState {
  span: number;
  successes: number;
  failures: number;
}
export const initialBatch = (
  saved: BatchState | null,
  maximum: number,
): BatchState => ({
  span: Math.max(1, Math.min(maximum, saved?.span ?? maximum)),
  successes: saved?.successes ?? 0,
  failures: saved?.failures ?? 0,
});
export const failedBatch = (
  state: BatchState,
  attempted: number,
  reason = "INDEX_LOG_RANGE_LIMIT",
  maximum = attempted,
): BatchState => ({
  // A provider can be slow even for an empty eight-block query. Repeated
  // timeouts must not collapse useful backfill ranges to single blocks.
  // Explicit response/density limits may still require arbitrarily small ranges.
  span: Math.max(
    reason === "INDEX_LOG_TIMEOUT" ? Math.min(1000, maximum) : 1,
    Math.floor(attempted / 2),
  ),
  successes: 0,
  failures: Math.min(1000, state.failures + 1),
});
export function successfulBatch(
  state: BatchState,
  attempted: number,
  durationMs: number,
  maximum: number,
): BatchState {
  // Duration alone does not establish that range size caused latency. Preserve
  // every successful range, including slow responses with no matching logs.
  // A short final range at the head does not demonstrate capacity for larger ranges.
  const successes =
    durationMs <= 25_000 && attempted === state.span ? state.successes + 1 : 0;
  return {
    span: successes >= 3 ? Math.min(maximum, state.span * 2) : state.span,
    successes: successes >= 3 ? 0 : successes,
    failures: 0,
  };
}

/** Only getLogs capacity/time failures justify shrinking. Quotas and disagreement never do. */
export function rangeFailure(error: unknown): string | undefined {
  let candidate: string | undefined;
  for (
    let depth = 0;
    error && typeof error === "object" && depth < 8;
    depth++
  ) {
    const item = error as {
      code?: string | number;
      status?: number;
      name?: string;
      shortMessage?: string;
      details?: string;
      message?: string;
      cause?: unknown;
    };
    const code = String(item.code ?? "");
    if (
      [402, 429].includes(item.status ?? 0) ||
      [-33000, -33200].includes(Number(item.code)) ||
      /QUOTA|BUDGET|COOLDOWN|RATE_LIMIT|DAILY_LIMIT|DIVERGENCE|REORG|LEASE|WRONG_CHAIN|STALE_HEAD/.test(
        code,
      )
    )
      return undefined;
    const detail = [
      item.name,
      item.shortMessage,
      item.details,
      item.message,
    ].join(" ");
    if (
      /TIMEOUT/.test(code) ||
      [408, 504].includes(item.status ?? 0) ||
      /timeout|timed out/i.test(detail)
    )
      candidate = "INDEX_LOG_TIMEOUT";
    if (
      item.status === 413 ||
      [
        "INDEX_BATCH_TOO_DENSE_REDUCE_RANGE",
        "RPC_RESPONSE_TOO_LARGE",
        "INFURA_LOG_RANGE_LIMIT",
      ].includes(code) ||
      /block range|too many (?:logs|results)|query returned more than|(?:response|result|log) (?:size|too large)/i.test(
        detail,
      )
    )
      candidate = "INDEX_LOG_RANGE_LIMIT";
    error = item.cause;
  }
  return candidate;
}
