import { JournalHeading, type ChapterArt } from "./JournalHeading";
import { createContext, useContext, type ReactNode } from "react";
import { useAccount } from "wagmi";
import type { Health, PortalConfig } from "../shared/domain";
import { m } from "./i18n";
import { messages } from "./messages.en";
import { ragequitErrors } from "../shared/ragequit-errors";
export const PortalContext = createContext<{
  config: PortalConfig;
  health?: Health;
}>({ config: null! });
export const usePortal = () => useContext(PortalContext);
export function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const paths: Record<string, string> = {
    council:
      "M12 3c2 4-1 5 2 7 2-2 3-2 3-4 6 8 2 14-5 14-7 0-10-7-4-13 0 3 2 3 4 5 0-3-2-4 0-9z",
    planning: "M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z M9 3v16 M15 5v16",
    chronicle:
      "M4 4h12a3 3 0 0 1 3 3v14H6a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2 M3 17h16 M8 8h7 M8 12h5",
    compass: "M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0 M15 9l-2 4-4 2 2-4z",
    overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    governance: "m5 3 4 4-4 4 M11 7h9 M5 16h15 M5 21h10",
    treasury: "m3 8 9-5 9 5z M5 11v7 M10 11v7 M15 11v7 M20 11v7 M3 21h18",
    delegation:
      "M9 8a3 3 0 1 0-6 0 3 3 0 1 0 6 0 M15 8a3 3 0 1 0 6 0 3 3 0 1 0-6 0 M2 21v-3a4 4 0 0 1 8 0v3 M14 21v-3a4 4 0 0 1 8 0v3 M10 12h4",
    ragequit: "M11 3H4v18h7 M9 12h12 m-5-5 5 5-5 5",
    history: "M4 8a9 9 0 1 1-1 8 M4 3v5h5 M12 7v5l3 2",
    menu: "M4 6h16 M4 12h16 M4 18h16",
    close: "m6 6 12 12 M18 6 6 18",
    arrow: "M5 12h14 m-6-6 6 6-6 6",
    plus: "M12 5v14 M5 12h14",
    info: "M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0",
    check: "m5 12 4 4 10-10",
  };
  return (
    <svg
      className={"icon " + className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.info} />
    </svg>
  );
}
export function Brand() {
  return (
    <a
      className="brand"
      href="#overview"
      aria-label={m("Mythical DAO overview")}
    >
      <img
        className="logo-light"
        src="/brand/logo-black.png"
        alt=""
        width="48"
        height="48"
      />
      <img
        className="logo-dark"
        src="/brand/logo-white.png"
        alt=""
        width="48"
        height="48"
      />
      <span>
        Mythical <strong>DAO</strong>
      </span>
    </a>
  );
}
export function AssetIcon({ symbol }: { symbol: string }) {
  const src: Record<string, string> = {
    MANA: "/brand/mana.png",
    WETH: "/brand/weth.png",
    POL: "/brand/polygon.png",
    GEM: "/brand/gem.png",
    USDC: "/brand/usdc.svg",
    "USDC.e": "/brand/usdc.svg",
  };
  return src[symbol] ? (
    <img
      className="asset-icon"
      src={src[symbol]}
      alt=""
      width="32"
      height="32"
    />
  ) : (
    <span className="asset-icon asset-fallback" aria-hidden="true">
      {symbol.slice(0, 1)}
    </span>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "error";
}) {
  return (
    <div className={"notice " + tone}>
      <Icon name="info" />
      <div>{children}</div>
    </div>
  );
}
export function PageHeading({
  art,
  chapter,
  title,
  description,
  eyebrow,
  action,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  art?: ChapterArt;
  chapter?: string;
}) {
  if (art)
    return (
      <JournalHeading
        art={art}
        chapter={chapter ?? eyebrow ?? ""}
        title={title}
        description={description}
      >
        {action}
      </JournalHeading>
    );
  return (
    <div className="page-heading with-action">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function blockedReason(
  config: PortalConfig,
  health: Health | undefined,
  address?: string,
  chainId?: number,
) {
  if (!address) return m("Connect a Polygon wallet to continue.");
  if (chainId !== config.chainId)
    return m("Switch your wallet to the portal network to continue.");
  if (!config.enabled || health?.status === "setup")
    return m("The portal is being prepared. Signing is not available yet.");
  if (!health?.signingAllowed)
    return m(
      "Latest data is not verified. Signing will be available after verification.",
    );
  return null;
}
export function ActionAvailability({ extra }: { extra?: string | null }) {
  const { config, health } = usePortal(),
    { address, chainId } = useAccount();
  const reason = blockedReason(config, health, address, chainId) ?? extra;
  return reason ? <p className="action-help">{reason}</p> : null;
}
export function DataState({
  loading,
  error,
  unavailable,
  empty,
  children,
  retry,
  emptyTitle,
  independent = false,
}: {
  loading?: boolean;
  error?: unknown;
  unavailable?: boolean;
  empty?: boolean;
  children: ReactNode;
  retry?: () => void;
  emptyTitle?: string;
  independent?: boolean;
}) {
  const { health } = usePortal();
  const stale = !!error && !empty && !unavailable;
  let message: string | undefined;
  if (loading) message = m("Loading verified data…");
  else if (error && !stale)
    message = m("We couldn’t verify the latest data. Try again.");
  else if (unavailable || (empty && !independent && health?.status !== "ok"))
    message =
      health?.status === "setup"
        ? m(
            "The portal is being prepared. Explore the portal and save a proposal draft.",
          )
        : health?.status === "syncing"
          ? m("History is synchronizing. Confirmed data will appear here.")
          : health?.head && !unavailable
            ? m(
                "History is incomplete. More records will appear after indexing.",
              )
            : m("We couldn’t verify the latest data. Try again.");
  else if (empty)
    message = emptyTitle ?? m("No records in this confirmed view.");
  if (message)
    return (
      <div className="data-state" role={error ? "alert" : "status"}>
        <Icon name={loading ? "history" : "info"} />
        <p>{message}</p>
        {retry && !loading && (error || health?.status === "degraded") ? (
          <button className="button small" onClick={retry}>
            {m("Try again")}
          </button>
        ) : null}
      </div>
    );
  return (
    <>
      {stale || (!independent && health && health.status !== "ok") ? (
        <Notice tone="warning">
          {m(
            "Historical records may be incomplete or out of date. Each wallet operation is verified directly before signing.",
          )}
          {retry && (
            <button className="text-button" onClick={retry}>
              {m("Try again")}
            </button>
          )}
        </Notice>
      ) : null}
      {children}
    </>
  );
}
export function StateBadge({ state }: { state: string }) {
  const labels: Record<string, string> = {
    Pending: m("Voting not started"),
    Active: m("Voting open"),
    Succeeded: m("Approved"),
    Queued: m("Timelock · waiting"),
    Executed: m("Execution confirmed"),
    Canceled: m("Canceled"),
    Defeated: m("Not approved"),
    Expired: m("Expired"),
    Ended: m("Voting ended"),
    Unknown: m("State unverified"),
  };
  return (
    <span className={"badge " + state.toLowerCase()}>
      {labels[state] ?? state}
    </span>
  );
}
export function exactDate(value: string | number) {
  const d = new Date(typeof value === "number" ? value * 1000 : value);
  return Number.isNaN(d.getTime()) ? null : d;
}
export function DateStamp({ value }: { value: string | number }) {
  const date = exactDate(value);
  return date ? (
    <time dateTime={date.toISOString()} title={date.toISOString()}>
      {new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(date)}{" "}
      UTC
    </time>
  ) : (
    <span>{m("Date unavailable")}</span>
  );
}

export function ErrorNotice({ error }: { error: string }) {
  const explanations: Record<string, string> = {
    ALREADY_VOTED: m("This wallet has already voted on this proposal."),
    PROPOSAL_STATE_CHANGED: m(
      "The proposal state changed. Refresh and review it again.",
    ),
    PROPOSAL_THRESHOLD_NOT_MET: m(
      "Your voting power is below the current proposal threshold.",
    ),
    PROPOSAL_AWAITING_CONFIRMATIONS: m(
      "This proposal is still awaiting network confirmations. Try again shortly.",
    ),
  };
  const readable = [
    ...Object.values(messages),
    ...Object.values(ragequitErrors),
  ].some((value) => value === error);
  return (
    <div role="alert" className="error">
      <p>
        {readable
          ? error
          : (explanations[error] ??
            m("We couldn’t verify the latest data. Try again."))}
      </p>
      {!readable && (
        <details>
          <summary>{m("Technical details")}</summary>
          <code className="calldata">{error}</code>
        </details>
      )}
    </div>
  );
}
