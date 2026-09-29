-- Additive only: existing events, checkpoints, cursors and Snapshot archive stay intact.
-- One persistent account budget across cron invocations; no API keys are stored here.
CREATE TABLE rpc_quota (
  provider TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0 CHECK(credits >= 0),
  requests INTEGER NOT NULL DEFAULT 0 CHECK(requests >= 0),
  not_before INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER NOT NULL DEFAULT 0
);
