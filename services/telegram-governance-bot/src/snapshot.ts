import { enqueueNotification, getCursor, getProposal, setCursor, upsertProposal } from "./db";
import { renderGovernanceMessage } from "./messages";
import type {
  GovernanceEventType,
  NotificationEvent,
  ProposalRecord,
  ServiceConfig,
  SnapshotProposal,
} from "./types";
import { truncate } from "./utils";

const SNAPSHOT_QUERY = `
  query GovernanceProposals($space: String!) {
    proposals(
      first: 100
      skip: 0
      where: { space: $space }
      orderBy: "created"
      orderDirection: desc
    ) {
      id
      title
      choices
      start
      end
      state
      created
      scores
      scores_total
    }
  }
`;

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseSnapshotProposal(value: unknown): SnapshotProposal | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.title !== "string") return null;
  if (!Array.isArray(row.choices) || !row.choices.every((choice) => typeof choice === "string")) return null;
  if (!Array.isArray(row.scores) || !row.scores.every((score) => typeof score === "number")) return null;
  if (row.state !== "pending" && row.state !== "active" && row.state !== "closed") return null;
  const start = numberField(row.start);
  const end = numberField(row.end);
  const created = numberField(row.created);
  const scoresTotal = numberField(row.scores_total);
  if (start === null || end === null || created === null || scoresTotal === null) return null;
  return {
    id: row.id,
    title: row.title,
    choices: row.choices,
    start,
    end,
    state: row.state,
    created,
    scores: row.scores,
    scoresTotal,
  };
}

function parseSnapshotResponse(value: unknown): SnapshotProposal[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Snapshot returned an invalid response");
  }
  const data = (value as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Snapshot response did not contain data");
  }
  const proposals = (data as Record<string, unknown>).proposals;
  if (!Array.isArray(proposals)) {
    throw new Error("Snapshot response did not contain proposals");
  }
  const parsed = proposals.map(parseSnapshotProposal);
  if (parsed.some((proposal) => proposal === null)) {
    throw new Error("Snapshot returned a malformed proposal");
  }
  return parsed.filter((proposal): proposal is SnapshotProposal => proposal !== null);
}

export async function fetchSnapshotProposals(
  config: ServiceConfig,
  fetcher: typeof fetch = fetch,
): Promise<SnapshotProposal[]> {
  const response = await fetcher(config.snapshotApiUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: SNAPSHOT_QUERY, variables: { space: config.snapshotSpace } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Snapshot request failed (${String(response.status)})`);
  }
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > 1_000_000) {
    throw new Error("Snapshot returned an oversized response");
  }
  return parseSnapshotResponse(await response.json());
}

function toRecord(remote: SnapshotProposal, config: ServiceConfig, previous: ProposalRecord | null, now: number): ProposalRecord {
  return {
    source: "snapshot",
    proposalId: remote.id,
    title: truncate(remote.title),
    url: `${config.snapshotWebBaseUrl}${encodeURIComponent(config.snapshotSpace)}/proposal/${encodeURIComponent(remote.id)}`,
    state: remote.state,
    createdAt: remote.created,
    startsAt: remote.start,
    endsAt: remote.end,
    startBlock: null,
    endBlock: null,
    choices: remote.choices.map((choice) => truncate(choice, 150)),
    scores: remote.scores,
    metadata: { scoresTotal: String(remote.scoresTotal) },
    notificationsEnabled: true,
    firstSeenAt: previous?.firstSeenAt ?? now,
    updatedAt: now,
  };
}

function transitionEvent(previous: ProposalRecord | null, current: ProposalRecord): GovernanceEventType | null {
  if (previous === null) {
    if (current.state === "pending") return "created";
    if (current.state === "active") return "active";
    if (current.state === "closed") return "succeeded";
    return null;
  }
  if (previous.state === current.state) return null;
  if (current.state === "active") return "active";
  if (current.state === "closed") return "succeeded";
  return null;
}

async function enqueue(
  env: Env,
  proposal: ProposalRecord,
  eventType: GovernanceEventType,
  now: number,
): Promise<void> {
  const event: NotificationEvent = {
    eventKey: `snapshot:${proposal.proposalId}:${eventType}`,
    source: "snapshot",
    proposalId: proposal.proposalId,
    eventType,
    occurredAt: now,
    messageHtml: renderGovernanceMessage(proposal, eventType),
  };
  await enqueueNotification(env.DB, event, env.TELEGRAM_CHANNEL_ID, now);
}

export async function pollSnapshot(env: Env, config: ServiceConfig, now: number): Promise<void> {
  const initialized = (await getCursor(env.DB, "snapshot")) !== null;
  const proposals = await fetchSnapshotProposals(config);

  for (const remote of proposals) {
    const previous = await getProposal(env.DB, "snapshot", remote.id);
    const current = toRecord(remote, config, previous, now);
    await upsertProposal(env.DB, current);

    if (initialized) {
      const eventType = transitionEvent(previous, current);
      if (eventType !== null) {
        await enqueue(env, current, eventType, now);
      }
      const remaining = current.endsAt === null ? Number.POSITIVE_INFINITY : current.endsAt - now;
      if (current.state === "active" && remaining > 0 && remaining <= 86_400) {
        await enqueue(env, current, "reminder_24h", now);
      }
    }
  }

  await setCursor(env.DB, "snapshot", "initialized", now);
}
