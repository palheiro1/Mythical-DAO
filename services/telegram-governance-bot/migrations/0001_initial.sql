PRAGMA foreign_keys = ON;

CREATE TABLE service_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE source_cursors (
  source TEXT PRIMARY KEY,
  cursor TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE proposals (
  source TEXT NOT NULL CHECK (source IN ('snapshot', 'governor')),
  proposal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at INTEGER,
  starts_at INTEGER,
  ends_at INTEGER,
  start_block INTEGER,
  end_block INTEGER,
  choices_json TEXT,
  scores_json TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  notifications_enabled INTEGER NOT NULL DEFAULT 1 CHECK (notifications_enabled IN (0, 1)),
  first_seen_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (source, proposal_id)
);

CREATE INDEX proposals_open_idx ON proposals(source, state, updated_at);

CREATE TABLE notification_events (
  event_key TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('snapshot', 'governor')),
  proposal_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('created', 'active', 'reminder_24h', 'succeeded', 'defeated', 'cancelled', 'expired', 'executed')
  ),
  occurred_at INTEGER NOT NULL,
  message_html TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (source, proposal_id) REFERENCES proposals(source, proposal_id)
);

CREATE TABLE deliveries (
  event_key TEXT NOT NULL,
  target_chat_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'failed', 'sent', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  leased_until INTEGER,
  telegram_message_id INTEGER,
  last_error TEXT,
  sent_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_key, target_chat_id),
  FOREIGN KEY (event_key) REFERENCES notification_events(event_key) ON DELETE CASCADE
);

CREATE INDEX deliveries_due_idx ON deliveries(status, next_attempt_at, leased_until);

CREATE TABLE service_health (
  source TEXT PRIMARY KEY,
  last_attempt_at INTEGER,
  last_success_at INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  incident_open INTEGER NOT NULL DEFAULT 0 CHECK (incident_open IN (0, 1)),
  updated_at INTEGER NOT NULL
);

INSERT INTO service_state(key, value, updated_at) VALUES ('run_lock_until', '0', unixepoch());
