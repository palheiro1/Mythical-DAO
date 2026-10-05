-- Display-only cache. Never consulted by preflight, simulation or signing.
CREATE TABLE IF NOT EXISTS public_read_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT,
  checked_at INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  retry_after INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public_read_budget (
  provider TEXT PRIMARY KEY,
  period TEXT NOT NULL,
  requests INTEGER NOT NULL
);
