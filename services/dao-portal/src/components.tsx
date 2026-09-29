import {
  useConnect,
  useAccount,
  useDisconnect,
  useSwitchChain,
  useConnectors,
} from "wagmi";
import { formatUnits, type Address } from "viem";
import { useEffect, useRef, useState } from "react";
import type { Health, PortalConfig, Proposal } from "../shared/domain";
import { t, m } from "./i18n";
import { Icon, StateBadge, usePortal } from "./ui";
import { paymentFor, proposalActions } from "./action-view";
export const short = (value: string) =>
  value.length > 16 ? value.slice(0, 6) + "…" + value.slice(-4) : value;
export function amount(value: string | bigint, decimals = 18) {
  return formatUnits(BigInt(value), decimals);
}
export function Wallet({ config }: { config: PortalConfig }) {
  const { address, chainId } = useAccount(),
    { mutate: connect, isPending, error } = useConnect(),
    connectors = useConnectors();
  const { mutate: disconnect } = useDisconnect(),
    { mutate: switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="wallet" ref={root}>
      {address && chainId !== config.chainId && (
        <button
          className="button small"
          onClick={() => switchChain({ chainId: config.chainId })}
        >
          {m("Switch network")}
        </button>
      )}
      <button
        ref={trigger}
        className={"button small " + (address ? "" : "primary")}
        aria-expanded={open}
        aria-controls="wallet-options"
        onClick={() => setOpen(!open)}
      >
        {address ? short(address) : t("connect")}
        {address && <span aria-hidden="true">⌄</span>}
      </button>
      {open && (
        <div id="wallet-options" className="wallet-menu">
          {address ? (
            <>
              <p className="eyebrow">{m("Connected Polygon wallet")}</p>
              <p className="break-word">{address}</p>
              <a href="#delegation" onClick={() => setOpen(false)}>
                {m("Manage delegation")}
              </a>
              <button
                className="button full"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
              >
                {m("Disconnect")}
              </button>
            </>
          ) : (
            <>
              <p>
                {m("Choose your Polygon wallet. The game login is separate.")}
              </p>
              {connectors.map((connector) => (
                <button
                  className="button full"
                  key={connector.uid}
                  disabled={isPending}
                  onClick={() =>
                    connect({ connector }, { onSuccess: () => setOpen(false) })
                  }
                >
                  {connector.name}
                </button>
              ))}
              {!connectors.length && (
                <p>{m("No supported wallet was detected in this browser.")}</p>
              )}
              {error && (
                <p role="alert">
                  {m("The wallet could not connect. Try again in your wallet.")}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
export function Status({ health }: { health?: Health }) {
  const labels = {
    ok: m("Data verified"),
    setup: m("Portal in preparation"),
    syncing: m("Synchronizing"),
    degraded: health?.head ? m("History incomplete") : m("Data unavailable"),
  };
  return (
    <span
      className={"network-status " + (health?.status === "ok" ? "live" : "")}
    >
      <span aria-hidden="true" className="status-dot" />
      {health ? labels[health.status] : m("Checking data")}
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name="info" />
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
export function AddressLink({
  address,
  full = false,
}: {
  address: Address;
  full?: boolean;
}) {
  return (
    <a
      className="address"
      href={"https://polygonscan.com/address/" + address}
      target="_blank"
      rel="noreferrer"
      title={address}
    >
      {full ? address : short(address)} <span aria-hidden="true">↗</span>
    </a>
  );
}
export function ProposalCard({ p }: { p: Proposal }) {
  const { config } = usePortal(),
    payments = proposalActions(p)
      .map((a) => paymentFor(a, config))
      .filter(Boolean);
  return (
    <a className="proposal-card" href={"#proposal/" + p.contract + "/" + p.id}>
      <div className="section-top">
        <span className="eyebrow">
          {p.kind === "community"
            ? m("Community ballot")
            : p.kind === "legacy"
              ? m("Original Governor")
              : m("Executable proposal")}
        </span>
        <StateBadge state={p.state} />
      </div>
      <h3>
        {p.description.split("\n")[0].replace(/^#+\s*/, "") ||
          m("Untitled proposal")}
      </h3>
      <p>
        {p.kind === "community"
          ? m("{count} alternatives · advisory result", {
              count: p.options.length,
            })
          : payments.length
            ? payments.map((a) => a!.quantity + " " + a!.symbol).join(" + ") +
              m(" · treasury payment")
            : m("{count} on-chain actions", { count: p.targets.length })}
      </p>
      <p className="muted">
        {m("Publication block {block}", { block: p.blockNumber })}
      </p>
      <div className="card-bottom">
        <span>{m("By {author}", { author: short(p.proposer) })}</span>
        <span>
          {m("View proposal")} <Icon name="arrow" />
        </span>
      </div>
    </a>
  );
}

export function allowanceAmount(value: string, decimals = 18) {
  return BigInt(value) === 2n ** 256n - 1n
    ? m("Unlimited (revocable)")
    : amount(value, decimals);
}
