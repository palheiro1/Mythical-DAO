import { formatUnits } from "viem";
import type { GovernanceEventType, ProposalRecord } from "./types";
import { escapeHtml, formatUtc, truncate } from "./utils";

function eventHeading(source: ProposalRecord["source"], eventType: GovernanceEventType): string {
  const sourceName = source === "snapshot" ? "Snapshot — off-chain vote" : "Polygon Governor — on-chain governance";
  const labels: Record<GovernanceEventType, string> = {
    created: "New proposal",
    active: "Voting is open",
    reminder_24h: source === "snapshot" ? "24 hours left to vote" : "Approximately 24 hours left to vote",
    succeeded: source === "snapshot" ? "Voting closed" : "Proposal passed",
    defeated: "Proposal defeated",
    cancelled: "Proposal cancelled",
    expired: "Proposal expired",
    executed: "Proposal executed",
  };
  return `<b>${escapeHtml(labels[eventType])}</b>\n${escapeHtml(sourceName)}`;
}

function snapshotResult(proposal: ProposalRecord): string | null {
  if (!proposal.choices || !proposal.scores || proposal.choices.length === 0) {
    return null;
  }
  const maximum = Math.max(...proposal.scores, 0);
  if (maximum === 0) {
    return "Result: No votes recorded";
  }
  const winners = proposal.choices.filter((_, index) => proposal.scores?.[index] === maximum);
  const label = winners.length > 1 ? "Tie" : "Result";
  return `${label}: ${winners.map((winner) => escapeHtml(truncate(winner, 100))).join(" / ")} (${maximum.toLocaleString("en-US", { maximumFractionDigits: 2 })} MANA)`;
}

function governorVotes(proposal: ProposalRecord): string | null {
  const against = proposal.metadata.againstVotes;
  const forVotes = proposal.metadata.forVotes;
  const abstain = proposal.metadata.abstainVotes;
  if (against === undefined || forVotes === undefined || abstain === undefined) {
    return null;
  }
  return `Votes: For ${formatUnits(BigInt(forVotes), 18)} · Against ${formatUnits(BigInt(against), 18)} · Abstain ${formatUnits(BigInt(abstain), 18)} MANA`;
}

export function renderGovernanceMessage(
  proposal: ProposalRecord,
  eventType: GovernanceEventType,
): string {
  const heading = proposal.metadata.kind === "community" ? `<b>${eventType === "succeeded" || eventType === "defeated" ? "Community ballot closed" : eventType === "active" ? "Community ballot voting is open" : eventType === "reminder_24h" ? "Approximately 24 hours left to vote" : eventType === "cancelled" ? "Community ballot cancelled" : "New community ballot"}</b>\nCommunity ballot — on-chain, advisory; no treasury authority` : eventHeading(proposal.source, eventType);
  const lines = [heading, "", `<b>${escapeHtml(truncate(proposal.title))}</b>`];

  if (eventType === "created" || eventType === "active" || eventType === "reminder_24h") {
    lines.push(`Starts: ${formatUtc(proposal.startsAt)}`, `Ends: ${formatUtc(proposal.endsAt)}`);
  }

  if (eventType === "succeeded" || eventType === "defeated" || eventType === "executed") {
    const result = proposal.metadata.kind === "community" ? escapeHtml(proposal.metadata.result ?? "No result") : proposal.source === "snapshot" ? snapshotResult(proposal) : governorVotes(proposal);
    if (result) {
      lines.push(result);
    }
  }

  lines.push("", `<a href="${escapeHtml(proposal.url)}">View proposal</a>`);
  const transactionHash = proposal.metadata.transactionHash;
  const transactionUrl = proposal.metadata.transactionUrl;
  if (transactionHash && transactionUrl) {
    lines.push(`<a href="${escapeHtml(transactionUrl)}">View transaction</a>`);
  }
  return lines.join("\n").slice(0, 4000);
}

export function renderOperatorMessage(environment: string, summary: string): string {
  return `<b>Mythical DAO notifier — ${escapeHtml(environment)}</b>\n${escapeHtml(truncate(summary, 700))}`;
}
