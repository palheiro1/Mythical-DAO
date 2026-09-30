-- Isolated comparison observations only. No edits to DAO events/cursors/checkpoints.
CREATE TABLE graph_comparison (
  id INTEGER PRIMARY KEY CHECK(id=1),
  owner TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  next_attempt INTEGER NOT NULL,
  month TEXT NOT NULL,
  reserved_queries INTEGER NOT NULL CHECK(reserved_queries BETWEEN 0 AND 3000),
  checked_at INTEGER,
  report_json TEXT
);
