import { isAddress } from "viem";
import {
  enqueueNotification,
  getCursor,
  getProposal,
  listTrackableGovernorProposals,
  setCursor,
  upsertProposal,
} from "./db";
import { renderGovernanceMessage } from "./messages";
import { governorEventForTransition } from "./governor";
import type { GovernanceEventType, ProposalRecord } from "./types";
interface PortalProposal {
  chainId: number;
  contract: string;
  id: string;
  kind: "executable" | "community" | "legacy";
  description: string;
  snapshot: string;
  deadline: string;
  blockNumber: string;
  transactionHash: string;
  state: string;
  options: string[];
  votes?: string[];
  winner?: number;
  tied?: boolean;
  quorumReached?: boolean;
}
type State =
  | "pending"
  | "active"
  | "cancelled"
  | "defeated"
  | "succeeded"
  | "queued"
  | "expired"
  | "executed";
function validate(p: PortalProposal): PortalProposal {
  if (
    !isAddress(p.contract) ||
    !/^\d+$/.test(p.id) ||
    !/^\d+$/.test(p.snapshot) ||
    !/^\d+$/.test(p.deadline) ||
    !/^\d+$/.test(p.blockNumber) ||
    !["executable", "community"].includes(p.kind) ||
    typeof p.description !== "string" ||
    p.description.length > 100_000 ||
    p.chainId !== 137
  )
    throw new Error("Invalid portal proposal");
  return p;
}
function state(p: PortalProposal): State {
  if (p.state === "Ended") return p.winner ? "succeeded" : "defeated";
  const s = p.state === "Canceled" ? "cancelled" : p.state.toLowerCase();
  if (
    ![
      "pending",
      "active",
      "cancelled",
      "defeated",
      "succeeded",
      "queued",
      "expired",
      "executed",
    ].includes(s)
  )
    throw new Error("Unverified proposal state");
  return s as State;
}
async function read<T>(base: string, path: string): Promise<T> {
  const response = await fetch(base + "/api/" + path, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Portal read failed");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty portal response");
  let text = "",
    size = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_000_000) throw new Error("Portal response too large");
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(text + decoder.decode()) as T;
}
export function portalIdentity(
  p: Pick<PortalProposal, "chainId" | "contract" | "id">,
) {
  return String(p.chainId) + ":" + p.contract.toLowerCase() + ":" + p.id;
}
async function store(
  env: Env,
  base: string,
  p: PortalProposal,
  head: bigint,
  now: number,
  silent: boolean,
) {
  validate(p);
  const id = portalIdentity(p),
    previous = await getProposal(env.DB, "governor", id),
    current = state(p);
  const baseline =
    previous?.metadata.lastNotifiedState ?? (silent ? current : "");
  const proposal: ProposalRecord = {
    source: "governor",
    proposalId: id,
    title: (p.description.split("\n")[0] ?? "Untitled proposal").replace(
      /^#+\s*/,
      "",
    ),
    url: base + "/#proposal/" + p.contract + "/" + p.id,
    state: current,
    createdAt: null,
    startsAt: now + Number(BigInt(p.snapshot) - head) * 2,
    endsAt: now + Number(BigInt(p.deadline) - head) * 2,
    startBlock: Number(p.snapshot),
    endBlock: Number(p.deadline),
    choices: p.kind === "community" ? p.options : null,
    scores: null,
    metadata: {
      portal: "v2",
      kind: p.kind,
      chainId: String(p.chainId),
      contract: p.contract.toLowerCase(),
      onchainId: p.id,
      transactionHash: p.transactionHash,
      transactionUrl: "https://polygonscan.com/tx/" + p.transactionHash,
      againstVotes: p.votes?.[0] ?? "0",
      forVotes: p.votes?.[1] ?? "0",
      abstainVotes: p.votes?.[2] ?? "0",
      result:
        p.kind === "community"
          ? p.winner
            ? "Winner: " + (p.options[p.winner - 1] ?? "Unknown option")
            : p.tied
              ? "Tie — no winner"
              : p.quorumReached
                ? "No winning alternative"
                : "Quorum not reached"
          : "",
      lastNotifiedState: baseline,
    },
    notificationsEnabled: true,
    firstSeenAt: previous?.firstSeenAt ?? now,
    updatedAt: now,
  };
  // Persist the old emission checkpoint before enqueuing; a crash retries the same deterministic event.
  await upsertProposal(env.DB, proposal);
  const enqueue = async (eventType: GovernanceEventType) => {
    await enqueueNotification(
      env.DB,
      {
        eventKey: "portal:" + id + ":" + eventType,
        source: "governor",
        proposalId: id,
        eventType,
        occurredAt: now,
        messageHtml: renderGovernanceMessage(proposal, eventType),
      },
      env.TELEGRAM_CHANNEL_ID,
      now,
    );
  };
  if (!silent) {
    const event = governorEventForTransition(baseline || null, current);
    if (event) await enqueue(event);
    if (
      current === "active" &&
      BigInt(p.deadline) > head &&
      (BigInt(p.deadline) - head) * 2n <= 86400n
    )
      await enqueue("reminder_24h");
  }
  proposal.metadata.lastNotifiedState = current;
  await upsertProposal(env.DB, proposal);
}
export async function pollPortal(env: Env, now: number): Promise<void> {
  const url = new URL(env.PORTAL_URL);
  if (url.protocol !== "https:") throw new Error("Portal URL must use HTTPS");
  const base = url.origin;
  const health = await read<{
    signingAllowed: boolean;
    confirmedHead: string | null;
  }>(base, "health");
  if (!health.signingAllowed || !health.confirmedHead)
    throw new Error("Portal index is not verified");
  const head = BigInt(health.confirmedHead);
  let watermark = await getCursor(env.DB, "portal_seed_head");
  if (watermark === null) {
    watermark = String(head);
    await setCursor(env.DB, "portal_seed_head", watermark, now);
  }
  // Bounded, resumable history scan; imports at/before the activation watermark are silent.
  let cursor = await getCursor(env.DB, "portal_events");
  for (let batch = 0; batch < 3; batch++) {
    const feed = await read<{
      items: PortalProposal[];
      nextCursor: string | null;
    }>(
      base,
      "notification-feed" +
        (cursor ? "?after=" + encodeURIComponent(cursor) : ""),
    );
    for (const raw of feed.items)
      await store(
        env,
        base,
        validate(raw),
        head,
        now,
        BigInt(raw.blockNumber) <= BigInt(watermark),
      );
    if (!feed.nextCursor) break;
    cursor = feed.nextCursor;
    await setCursor(env.DB, "portal_events", cursor, now);
    if (feed.items.length < 20) break;
  }
  const active = (await listTrackableGovernorProposals(env.DB))
    .filter(
      (p) =>
        p.metadata.portal === "v2" &&
        !(p.metadata.kind === "community" && p.state === "succeeded"),
    )
    .slice(0, 20);
  for (const previous of active) {
    const contract = previous.metadata.contract,
      id = previous.metadata.onchainId;
    if (!contract || !id) throw new Error("Portal proposal identity missing");
    const path = "proposals/" + contract + "/" + id;
    await store(
      env,
      base,
      validate(await read<PortalProposal>(base, path)),
      head,
      now,
      false,
    );
  }
}
