-- Per-source attempts allow bounded cron invocations to rotate fairly, including
-- sources that failed or were interrupted by a platform CPU limit.
CREATE TABLE IF NOT EXISTS index_source_runs (
  chain_id INTEGER NOT NULL,
  source_key TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  reason TEXT,
  PRIMARY KEY(chain_id, source_key)
);

-- Retune only the old latency-induced collapse. No events, cursors, checkpoints
-- or quota counters change. Explicit capacity/density failures stay small.
UPDATE index_adaptive SET span=1000, successes=0
WHERE span<1000 AND (last_reason IS NULL OR last_reason='INDEX_LOG_TIMEOUT');
