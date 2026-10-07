import type { Proposal } from "../shared/domain";
import { displayAsset, formatTokenAmount } from "./token-format";
import { usePortal } from "./ui";

/** Non-interactive: safe inside the proposal link. Exact figures remain in detail. */
export function VoteResults({ proposal: p }: { proposal: Proposal }) {
  const { config } = usePortal();
  const fresh =
    p.results?.fresh &&
    Date.now() - p.results.checkedAt <= 180000 &&
    Date.now() >= p.results.checkedAt;
  if (
    !p.votes?.length ||
    (p.kind !== "community" && p.votes.length !== 3) ||
    p.votes.some((v) => !/^\d+$/.test(v))
  )
    return (
      <div className="decision-results results-unavailable">
        Results unavailable · open for details
      </div>
    );
  const votes = p.votes.map(BigInt),
    total = votes.reduce((a, b) => a + b, 0n);
  const labels =
    p.kind === "community"
      ? ["Abstain", ...p.options]
      : ["Against", "For", "Abstain"];
  const order = p.kind === "community" ? votes.map((_, i) => i) : [1, 0, 2];
  const asset = displayAsset(config, config.contracts.mana?.address);
  return (
    <div className="decision-results" aria-label="Voting results">
      <div className="result-track" aria-hidden="true">
        {order.map((i) => (
          <span
            key={i}
            className={`result-segment result-${i}`}
            style={{
              width: `${total ? Number((votes[i] * 10000n) / total) / 100 : 0}%`,
            }}
          />
        ))}
      </div>
      <div className="result-legend">
        {order.map((i) => (
          <span key={i}>
            <i className={`result-dot result-${i}`} aria-hidden="true" />
            {labels[i]}{" "}
            <strong>{formatTokenAmount(String(votes[i]), asset).text}</strong>
          </span>
        ))}
      </div>
      <span className="result-freshness">
        {p.read
          ? `${p.read.source === "The Graph" ? "Indexed by The Graph" : "Cached totals"} · ${new Date(p.read.checkedAt).toLocaleTimeString("en-GB")}${p.read.status === "stale" ? " · update delayed" : ""}`
          : p.results
            ? `${fresh ? "Checked" : "Last verified"} ${new Date(p.results.checkedAt).toLocaleTimeString("en-GB")} · ${fresh ? "updates every 2 minutes" : "refresh delayed"}`
            : "MANA · latest available totals"}
      </span>
    </div>
  );
}
