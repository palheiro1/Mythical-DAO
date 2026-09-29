-- Additive tuning only. No changes to events, cursors, checkpoints or Snapshot.
CREATE TABLE index_adaptive (
  chain_id INTEGER NOT NULL,
  source_key TEXT NOT NULL,
  span INTEGER NOT NULL CHECK(span BETWEEN 1 AND 5000),
  successes INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  last_duration_ms INTEGER NOT NULL,
  last_reason TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(chain_id, source_key)
);
