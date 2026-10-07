import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { createPublicClient, fallback, http } from "viem";
import { polygon } from "viem/chains";
import { usePortal } from "./ui";
import { blockDate, duration, readableDate } from "./time-format";
import type { Proposal } from "../shared/domain";

// Read-only calendar metadata. Never used for balances, calldata or signing checks.
// dRPC is listed in Polygon's official RPC endpoint documentation.
const polygonCalendar = createPublicClient({
  chain: polygon,
  transport: fallback(
    [
      http("https://polygon.drpc.org", { timeout: 8000, retryCount: 0 }),
      http("https://polygon-bor-rpc.publicnode.com", {
        timeout: 8000,
        retryCount: 0,
      }),
    ],
    { retryCount: 0 },
  ),
});
function useCalendarClient(chainId: number) {
  const configured = usePublicClient({ chainId });
  return chainId === polygon.id ? polygonCalendar : configured;
}

export function useChainClock() {
  const { config } = usePortal();
  const client = useCalendarClient(config.chainId);
  return useQuery({
    queryKey: ["display-block-clock", config.chainId],
    enabled: !!client,
    queryFn: async () => {
      const head = await client!.getBlock({ blockTag: "latest" });
      if (head.number === null || head.number < 512n)
        throw Error("Block clock unavailable");
      const prior = await client!.getBlock({ blockNumber: head.number - 512n });
      const secondsPerBlock = Number(head.timestamp - prior.timestamp) / 512;
      if (!(secondsPerBlock > 0 && secondsPerBlock < 60))
        throw Error("Invalid block clock");
      return {
        number: head.number,
        timestamp: head.timestamp,
        secondsPerBlock,
      };
    },
    staleTime: 300000,
    refetchInterval: 300000,
    retry: false,
  });
}
export function BlockTime({
  block,
  futureLabel = "Estimated date",
  pastLabel = "",
  compact = false,
}: {
  block: string;
  futureLabel?: string;
  pastLabel?: string;
  compact?: boolean;
}) {
  const { config, health } = usePortal();
  const client = useCalendarClient(config.chainId);
  const clock = useChainClock();
  const valid = /^\d+$/.test(block),
    target = valid ? BigInt(block) : 0n;
  const head = clock.data?.number ?? BigInt(health?.head ?? "0");
  const past = target <= head;
  const confirmed = target <= BigInt(health?.confirmedHead ?? "0");
  const timestamp = useQuery({
    queryKey: ["display-block-time", config.chainId, block],
    enabled: !!client && valid && past,
    queryFn: async () =>
      Number((await client!.getBlock({ blockNumber: target })).timestamp) *
      1000,
    staleTime: confirmed ? Infinity : 10000,
    gcTime: 86400000,
    retry: false,
  });
  const fresh =
    clock.data && Date.now() - Number(clock.data.timestamp) * 1000 < 600000;
  const estimate = !past && fresh ? blockDate(target, clock.data!) : null;
  const date = past ? timestamp.data : estimate;
  const known = date != null && Number.isFinite(date);
  const relative = estimate
    ? duration(Math.max(0, estimate - Date.now()) / 1000)
    : null;
  const label = known
    ? past
      ? `${pastLabel ? pastLabel + " · " : ""}${readableDate(date!)}`
      : `${futureLabel} in about ${relative}`
    : clock.isFetching || timestamp.isFetching
      ? "Checking date…"
      : "Date unavailable";
  const Container = compact ? "span" : "div";
  return (
    <Container className={`human-time${compact ? " time-compact" : ""}`}>
      <span>
        {known && past ? (
          <time dateTime={new Date(date!).toISOString()}>{label}</time>
        ) : (
          label
        )}
      </span>
      {known && !past && !compact && (
        <time
          dateTime={new Date(date!).toISOString()}
          className="time-secondary"
        >
          {readableDate(date!)} · estimated
        </time>
      )}
      {!compact && (
        <details className="time-details">
          <summary>Timing details</summary>
          {known && !past && (
            <p>
              Estimated {readableDate(date!)}. Based on the recent observed
              block pace; the Governor’s block number determines the actual
              deadline.
            </p>
          )}
          {known && past && <p>Confirmed timestamp from the block.</p>}
          {!known && (
            <p>
              The date could not be verified. The proposal state and signing
              checks remain independent of this display.
            </p>
          )}
          <a
            href={`https://polygonscan.com/block/${block}`}
            target="_blank"
            rel="noreferrer"
          >
            Block {valid ? target.toLocaleString("en-US") : "—"} ↗
          </a>
        </details>
      )}
    </Container>
  );
}
export function ProposalTiming({
  proposal,
  compact = false,
}: {
  proposal: Proposal;
  compact?: boolean;
}) {
  const pending = proposal.state === "Pending",
    active = proposal.state === "Active";
  return (
    <BlockTime
      block={
        proposal.kind === "community"
          ? proposal.blockNumber
          : pending
            ? proposal.snapshot
            : proposal.deadline
      }
      futureLabel={pending ? "Opens" : active ? "Closes" : "Voting ends"}
      pastLabel={
        proposal.kind === "community"
          ? "Published"
          : pending
            ? "Opened"
            : "Voting ended"
      }
      compact={compact}
    />
  );
}
export function BlockDuration({ blocks }: { blocks: string }) {
  const clock = useChainClock();
  const seconds =
    clock.data && /^\d+$/.test(blocks)
      ? Number(BigInt(blocks)) * clock.data.secondsPerBlock
      : null;
  return (
    <div className="block-duration">
      {seconds != null
        ? `About ${duration(seconds)}`
        : "Duration estimate unavailable"}
      <details className="time-details">
        <summary>Exact rule</summary>
        <p>
          {blocks} blocks. Time is an estimate based on the recent block pace;
          the contract uses the exact block count.
        </p>
      </details>
    </div>
  );
}
