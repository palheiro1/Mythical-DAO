import type {
  DeliveryRecord,
  GovernanceSource,
  NotificationEvent,
  ProposalRecord,
} from "./types";

interface ProposalRow {
  source: GovernanceSource;
  proposal_id: string;
  title: string;
  url: string;
  state: string;
  created_at: number | null;
  starts_at: number | null;
  ends_at: number | null;
  start_block: number | null;
  end_block: number | null;
  choices_json: string | null;
  scores_json: string | null;
  metadata_json: string;
  notifications_enabled: number;
  first_seen_at: number;
  updated_at: number;
}

interface DeliveryRow {
  event_key: string;
  target_chat_id: string;
  message_html: string;
  attempts: number;
}

interface HealthRow {
  last_attempt_at: number | null;
  last_success_at: number | null;
  consecutive_failures: number;
  last_error: string | null;
  incident_open: number;
}

interface HealthSummaryRow {
  source: string;
  last_success_at: number | null;
  consecutive_failures: number;
  incident_open: number;
}

interface HealthSummary {
  sources: Array<{
    source: string;
    lastSuccessAt: number | null;
    consecutiveFailures: number;
    incidentOpen: boolean;
  }>;
  lastDeliveryAt: number | null;
  pendingDeliveries: number;
}

interface ProposalIdentityRow {
  source: GovernanceSource;
  proposal_id: string;
}

function parseStringArray(value: string | null): string[] | null {
  if (value === null) return null;
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : null;
}

function parseNumberArray(value: string | null): number[] | null {
  if (value === null) return null;
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) && parsed.every((item) => typeof item === "number") ? parsed : null;
}

function parseMetadata(value: string): Record<string, string> {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function proposalFromRow(row: ProposalRow): ProposalRecord {
  return {
    source: row.source,
    proposalId: row.proposal_id,
    title: row.title,
    url: row.url,
    state: row.state,
    createdAt: row.created_at,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    startBlock: row.start_block,
    endBlock: row.end_block,
    choices: parseStringArray(row.choices_json),
    scores: parseNumberArray(row.scores_json),
    metadata: parseMetadata(row.metadata_json),
    notificationsEnabled: row.notifications_enabled === 1,
    firstSeenAt: row.first_seen_at,
    updatedAt: row.updated_at,
  };
}

export async function getState(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM service_state WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function getFirstProposalIdentity(
  db: D1Database,
): Promise<{ source: GovernanceSource; proposalId: string } | null> {
  const row = await db
    .prepare(
      `SELECT source, proposal_id FROM proposals
       ORDER BY first_seen_at ASC, source ASC, proposal_id ASC LIMIT 1`,
    )
    .first<ProposalIdentityRow>();
  return row === null ? null : { source: row.source, proposalId: row.proposal_id };
}

export async function setState(db: D1Database, key: string, value: string, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO service_state(key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .bind(key, value, now)
    .run();
}

export async function acquireRunLock(db: D1Database, now: number, leaseSeconds = 600): Promise<boolean> {
  await db
    .prepare("INSERT OR IGNORE INTO service_state(key, value, updated_at) VALUES ('run_lock_until', '0', ?)")
    .bind(now)
    .run();
  const result = await db
    .prepare(
      `UPDATE service_state
       SET value = ?, updated_at = ?
       WHERE key = 'run_lock_until' AND CAST(value AS INTEGER) < ?`,
    )
    .bind(String(now + leaseSeconds), now, now)
    .run();
  return result.meta.changes === 1;
}

export async function releaseRunLock(db: D1Database, now: number): Promise<void> {
  await setState(db, "run_lock_until", "0", now);
}

export async function getCursor(db: D1Database, source: string): Promise<string | null> {
  const row = await db.prepare("SELECT cursor FROM source_cursors WHERE source = ?").bind(source).first<{ cursor: string }>();
  return row?.cursor ?? null;
}

export async function setCursor(db: D1Database, source: string, cursor: string, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO source_cursors(source, cursor, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(source) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at`,
    )
    .bind(source, cursor, now)
    .run();
}

export async function getProposal(
  db: D1Database,
  source: GovernanceSource,
  proposalId: string,
): Promise<ProposalRecord | null> {
  const row = await db
    .prepare("SELECT * FROM proposals WHERE source = ? AND proposal_id = ?")
    .bind(source, proposalId)
    .first<ProposalRow>();
  return row ? proposalFromRow(row) : null;
}

export async function upsertProposal(db: D1Database, proposal: ProposalRecord): Promise<void> {
  await db
    .prepare(
      `INSERT INTO proposals(
         source, proposal_id, title, url, state, created_at, starts_at, ends_at,
         start_block, end_block, choices_json, scores_json, metadata_json,
         notifications_enabled, first_seen_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source, proposal_id) DO UPDATE SET
         title = excluded.title,
         url = excluded.url,
         state = excluded.state,
         created_at = COALESCE(excluded.created_at, proposals.created_at),
         starts_at = COALESCE(excluded.starts_at, proposals.starts_at),
         ends_at = COALESCE(excluded.ends_at, proposals.ends_at),
         start_block = COALESCE(excluded.start_block, proposals.start_block),
         end_block = COALESCE(excluded.end_block, proposals.end_block),
         choices_json = COALESCE(excluded.choices_json, proposals.choices_json),
         scores_json = COALESCE(excluded.scores_json, proposals.scores_json),
         metadata_json = excluded.metadata_json,
         notifications_enabled = MAX(proposals.notifications_enabled, excluded.notifications_enabled),
         updated_at = excluded.updated_at`,
    )
    .bind(
      proposal.source,
      proposal.proposalId,
      proposal.title,
      proposal.url,
      proposal.state,
      proposal.createdAt,
      proposal.startsAt,
      proposal.endsAt,
      proposal.startBlock,
      proposal.endBlock,
      proposal.choices ? JSON.stringify(proposal.choices) : null,
      proposal.scores ? JSON.stringify(proposal.scores) : null,
      JSON.stringify(proposal.metadata),
      proposal.notificationsEnabled ? 1 : 0,
      proposal.firstSeenAt,
      proposal.updatedAt,
    )
    .run();
}

export async function listTrackableGovernorProposals(db: D1Database): Promise<ProposalRecord[]> {
  const result = await db
    .prepare(
      `SELECT * FROM proposals
       WHERE source = 'governor' AND state IN ('pending', 'active', 'succeeded', 'queued')
       ORDER BY updated_at ASC`,
    )
    .all<ProposalRow>();
  return result.results.map(proposalFromRow);
}

export async function enqueueNotification(
  db: D1Database,
  event: NotificationEvent,
  targetChatId: string,
  now: number,
): Promise<boolean> {
  const eventInsert = db
    .prepare(
      `INSERT OR IGNORE INTO notification_events(
         event_key, source, proposal_id, event_type, occurred_at, message_html, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      event.eventKey,
      event.source,
      event.proposalId,
      event.eventType,
      event.occurredAt,
      event.messageHtml,
      now,
    );
  const deliveryInsert = db
    .prepare(
      `INSERT OR IGNORE INTO deliveries(
         event_key, target_chat_id, status, attempts, next_attempt_at, updated_at
       ) SELECT ?, ?, 'pending', 0, ?, ?
       WHERE EXISTS (SELECT 1 FROM notification_events WHERE event_key = ?)`,
    )
    .bind(event.eventKey, targetChatId, now, now, event.eventKey);
  const results = await db.batch([eventInsert, deliveryInsert]);
  return (results[1]?.meta.changes ?? 0) === 1;
}

export async function listDueDeliveries(db: D1Database, now: number, limit = 10): Promise<DeliveryRecord[]> {
  const result = await db
    .prepare(
      `SELECT d.event_key, d.target_chat_id, e.message_html, d.attempts
       FROM deliveries d
       JOIN notification_events e ON e.event_key = d.event_key
       WHERE (
         d.status IN ('pending', 'failed')
         OR (d.status = 'sending' AND COALESCE(d.leased_until, 0) < ?)
       ) AND d.next_attempt_at <= ?
       ORDER BY d.next_attempt_at ASC
       LIMIT ?`,
    )
    .bind(now, now, limit)
    .all<DeliveryRow>();
  return result.results.map((row) => ({
    eventKey: row.event_key,
    targetChatId: row.target_chat_id,
    messageHtml: row.message_html,
    attempts: row.attempts,
  }));
}

export async function claimDelivery(
  db: D1Database,
  eventKey: string,
  targetChatId: string,
  now: number,
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE deliveries
       SET status = 'sending', attempts = attempts + 1, leased_until = ?, updated_at = ?
       WHERE event_key = ? AND target_chat_id = ? AND (
         status IN ('pending', 'failed') OR (status = 'sending' AND COALESCE(leased_until, 0) < ?)
       ) AND next_attempt_at <= ?`,
    )
    .bind(now + 120, now, eventKey, targetChatId, now, now)
    .run();
  return result.meta.changes === 1;
}

export async function markDeliverySent(
  db: D1Database,
  eventKey: string,
  targetChatId: string,
  telegramMessageId: number,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE deliveries SET
         status = 'sent', telegram_message_id = ?, sent_at = ?, leased_until = NULL,
         last_error = NULL, updated_at = ?
       WHERE event_key = ? AND target_chat_id = ?`,
    )
    .bind(telegramMessageId, now, now, eventKey, targetChatId)
    .run();
}

export async function markDeliveryFailed(
  db: D1Database,
  eventKey: string,
  targetChatId: string,
  status: "failed" | "dead",
  nextAttemptAt: number,
  error: string,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE deliveries SET
         status = ?, next_attempt_at = ?, leased_until = NULL, last_error = ?, updated_at = ?
       WHERE event_key = ? AND target_chat_id = ?`,
    )
    .bind(status, nextAttemptAt, error, now, eventKey, targetChatId)
    .run();
}

export async function retryDelivery(db: D1Database, eventKey: string, now: number): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE deliveries SET status = 'pending', next_attempt_at = ?, leased_until = NULL,
       last_error = NULL, updated_at = ? WHERE event_key = ? AND status != 'sent'`,
    )
    .bind(now, now, eventKey)
    .run();
  return result.meta.changes > 0;
}

export async function recordSourceSuccess(
  db: D1Database,
  source: string,
  now: number,
): Promise<{ recovered: boolean }> {
  const previous = await db
    .prepare("SELECT * FROM service_health WHERE source = ?")
    .bind(source)
    .first<HealthRow>();
  await db
    .prepare(
      `INSERT INTO service_health(
         source, last_attempt_at, last_success_at, consecutive_failures, last_error, incident_open, updated_at
       ) VALUES (?, ?, ?, 0, NULL, 0, ?)
       ON CONFLICT(source) DO UPDATE SET
         last_attempt_at = excluded.last_attempt_at,
         last_success_at = excluded.last_success_at,
         consecutive_failures = 0,
         last_error = NULL,
         incident_open = 0,
         updated_at = excluded.updated_at`,
    )
    .bind(source, now, now, now)
    .run();
  return { recovered: previous?.incident_open === 1 };
}

export async function recordSourceFailure(
  db: D1Database,
  source: string,
  error: string,
  now: number,
  permanent = false,
): Promise<{ shouldAlert: boolean; failures: number }> {
  const previous = await db
    .prepare("SELECT * FROM service_health WHERE source = ?")
    .bind(source)
    .first<HealthRow>();
  const failures = (previous?.consecutive_failures ?? 0) + 1;
  const shouldAlert = previous?.incident_open !== 1 && (permanent || failures >= 3);
  const incidentOpen = previous?.incident_open === 1 || shouldAlert;
  await db
    .prepare(
      `INSERT INTO service_health(
         source, last_attempt_at, last_success_at, consecutive_failures, last_error, incident_open, updated_at
       ) VALUES (?, ?, NULL, ?, ?, ?, ?)
       ON CONFLICT(source) DO UPDATE SET
         last_attempt_at = excluded.last_attempt_at,
         consecutive_failures = excluded.consecutive_failures,
         last_error = excluded.last_error,
         incident_open = excluded.incident_open,
         updated_at = excluded.updated_at`,
    )
    .bind(source, now, failures, error, incidentOpen ? 1 : 0, now)
    .run();
  return { shouldAlert, failures };
}

export async function getHealthSummary(db: D1Database): Promise<HealthSummary> {
  const [sources, delivery, pending] = await Promise.all([
    db
      .prepare(
        "SELECT source, last_success_at, consecutive_failures, incident_open FROM service_health ORDER BY source",
      )
      .all<HealthSummaryRow>(),
    db.prepare("SELECT MAX(sent_at) AS last_delivery_at FROM deliveries WHERE status = 'sent'").first<{
      last_delivery_at: number | null;
    }>(),
    db
      .prepare("SELECT COUNT(*) AS count FROM deliveries WHERE status IN ('pending', 'sending', 'failed')")
      .first<{ count: number }>(),
  ]);
  return {
    sources: sources.results.map((row) => ({
      source: row.source,
      lastSuccessAt: row.last_success_at,
      consecutiveFailures: row.consecutive_failures,
      incidentOpen: row.incident_open === 1,
    })),
    lastDeliveryAt: delivery?.last_delivery_at ?? null,
    pendingDeliveries: pending?.count ?? 0,
  };
}
