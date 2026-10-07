-- Additive display cache: never replaces event history, cursors or signing checks.
CREATE TABLE IF NOT EXISTS public_proposal_snapshot (
  id INTEGER PRIMARY KEY CHECK (id=1),
  payload TEXT NOT NULL,
  block_number INTEGER NOT NULL
);
