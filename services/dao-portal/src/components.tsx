import {
  useConnect,
  useAccount,
  useDisconnect,
  useSwitchChain,
  useConnectors,
} from "wagmi";
import { formatUnits, type Address } from "viem";
import { useState } from "react";
import type { Health, PortalConfig, Proposal } from "../shared/domain";
import { t } from "./i18n";
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
  const [open, setOpen] = useState(false);
  if (address)
    return (
      <div className="wallet">
        {chainId !== config.chainId && (
          <button
            className="button small"
            onClick={() => switchChain({ chainId: config.chainId })}
          >
            Switch network
          </button>
        )}
        <button
          className="button wallet-button"
          title="Disconnect wallet"
          onClick={() => disconnect()}
        >
          {short(address)} ↗
        </button>
      </div>
    );
  return (
    <div className="wallet">
      <button
        className="button primary small"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {t("connect")}
      </button>
      {open && (
        <div className="wallet-menu">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              disabled={isPending}
              onClick={() =>
                connect({ connector }, { onSuccess: () => setOpen(false) })
              }
            >
              {connector.name}
            </button>
          ))}
          <p>
            Choose an installed wallet
            {import.meta.env.VITE_WALLETCONNECT_PROJECT_ID
              ? " or scan with WalletConnect."
              : ". WalletConnect needs a configured project ID."}
          </p>
          {error && <p role="alert">{error.message.slice(0, 140)}</p>}
        </div>
      )}
    </div>
  );
}
export function Status({ health }: { health?: Health }) {
  return (
    <span
      className={"network-status " + (health?.status === "ok" ? "live" : "")}
    >
      <i />
      {health?.status === "ok"
        ? "Index verified"
        : health?.status === "setup"
          ? "Setup mode"
          : health?.status === "syncing"
            ? "Index syncing"
            : health?.status === "degraded"
              ? "Data unavailable"
              : "Checking network"}
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
      <span aria-hidden="true" className="empty-symbol">
        ◇
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function AddressLink({ address }: { address: Address }) {
  return (
    <a
      className="address"
      href={"https://polygonscan.com/address/" + address}
      target="_blank"
      rel="noreferrer"
      title={address}
    >
      {short(address)} ↗
    </a>
  );
}
export function ProposalCard({ p }: { p: Proposal }) {
  return (
    <a className="proposal-card" href={"#proposal/" + p.contract + "/" + p.id}>
      <div className="section-top">
        <span className="eyebrow">
          {p.kind === "community"
            ? "Community ballot"
            : p.kind === "legacy"
              ? "Legacy governance"
              : "Executable proposal"}
        </span>
        <span className={"badge " + p.state.toLowerCase()}>{p.state}</span>
      </div>
      <h3>
        {p.description.split("\n")[0].replace(/^#+\s*/, "") ||
          "Untitled proposal"}
      </h3>
      <p>
        {p.kind === "community"
          ? p.options.length + " alternatives · advisory result"
          : p.targets.length +
            " on-chain action" +
            (p.targets.length === 1 ? "" : "s")}
      </p>
      <div className="card-bottom">
        <span>By {short(p.proposer)}</span>
        <span>View proposal ↗</span>
      </div>
    </a>
  );
}
