import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { zeroAddress } from "viem";
import type { Health, PortalConfig, Proposal } from "../shared/domain";
import type {
  ProposalList,
  TreasuryResponse,
  EventList,
  Member,
  SnapshotRecord,
  ListResponse,
} from "./data-types";
import { useApi } from "./api";
import {
  Wallet,
  Status,
  Empty,
  ProposalCard,
  AddressLink,
  amount,
} from "./components";
import { TransactionProvider } from "./Transaction";
import { CreateProposal } from "./CreateProposal";
import { ProposalDetail } from "./ProposalDetail";
import { Delegation, Ragequit } from "./Membership";
import { t, m, type MessageKey } from "./i18n";
import { ThemePicker } from "./theme";
import {
  Brand,
  Icon,
  PortalContext,
  DataState,
  Notice,
  PageHeading,
  AssetIcon,
  DateStamp,
  usePortal,
} from "./ui";
import { paymentFor, proposalActions } from "./action-view";
const links: MessageKey[] = [
  "overview",
  "governance",
  "treasury",
  "delegation",
  "ragequit",
  "history",
];
function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || "overview");
  useEffect(() => {
    const cb = () => {
      setRoute(location.hash.slice(1) || "overview");
      window.scrollTo(0, 0);
      requestAnimationFrame(() =>
        document.getElementById("main-content")?.focus(),
      );
    };
    addEventListener("hashchange", cb);
    return () => removeEventListener("hashchange", cb);
  }, []);
  return route;
}
function Navigation({
  route,
  onNavigate,
}: {
  route: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <p className="nav-label">{m("DAO portal")}</p>
      <nav aria-label={m("Main navigation")}>
        {links.map((key) => (
          <a
            key={key}
            className={
              route === key ||
              (key === "governance" && route.startsWith("proposal/"))
                ? "current"
                : ""
            }
            aria-current={route === key ? "page" : undefined}
            href={"#" + key}
            onClick={onNavigate}
          >
            <Icon name={key} />
            {t(key)}
          </a>
        ))}
      </nav>
      <a
        className="button primary full nav-create"
        href="#create"
        onClick={onNavigate}
      >
        <Icon name="plus" />
        {t("create")}
      </a>
      <a className="nav-guide" href="#guide" onClick={onNavigate}>
        <Icon name="info" />
        {m("How governance works")}
      </a>
      <div className="sidebar-note">
        <AssetIcon symbol="MANA" />
        <p>
          {m("Community-governed.")}
          <br />
          {m("Powered by MANA.")}
        </p>
      </div>
    </>
  );
}
export function App() {
  const route = useRoute(),
    configuration = useApi<PortalConfig>("config", true, 60000),
    healthQuery = useApi<Health>("health", true, 20000),
    { address, chainId } = useAccount();
  const menu = useRef<HTMLDialogElement>(null),
    menuButton = useRef<HTMLButtonElement>(null);
  const config = configuration.data,
    health = healthQuery.error
      ? healthQuery.data
        ? {
            ...healthQuery.data,
            signingAllowed: false,
            status: "degraded" as const,
          }
        : undefined
      : healthQuery.data;
  useEffect(() => {
    const wide = matchMedia("(min-width: 1024px)");
    const close = () => {
      if (wide.matches) menu.current?.close();
    };
    wide.addEventListener("change", close);
    return () => wide.removeEventListener("change", close);
  }, []);
  if (!config)
    return (
      <main className="loading">
        <Brand />
        <h1>{t("brand")}</h1>
        <p role={configuration.error ? "alert" : "status"}>
          {configuration.error
            ? m("We couldn’t verify the latest data. Try again.")
            : m("Loading the DAO portal…")}
        </p>
        {configuration.error && (
          <button
            className="button"
            onClick={() => void configuration.refetch()}
          >
            {m("Try again")}
          </button>
        )}
      </main>
    );
  const canSign =
    !!address && chainId === config.chainId && health?.signingAllowed === true;
  return (
    <PortalContext.Provider value={{ config, health }}>
      <TransactionProvider config={config}>
        <a
          href="#main-content"
          className="skip-link"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("main-content")?.focus();
          }}
        >
          {t("skip")}
        </a>
        <header className="site-header">
          <div className="header-brand">
            <button
              ref={menuButton}
              className="icon-button mobile-menu-button"
              aria-label={m("Open navigation")}
              onClick={() => menu.current?.showModal()}
            >
              <Icon name="menu" />
            </button>
            <Brand />
          </div>
          <div className="header-actions">
            <a className="back-to-game" href="https://my.mythicalbeings.io/">
              {m("Back to Mythical Beings")} ↗
            </a>
            <ThemePicker />
            <Wallet config={config} />
          </div>
        </header>
        <div className="app-shell">
          <aside className="sidebar">
            <Navigation route={route} />
          </aside>
          <div className="main-column">
            <div className="network-bar">
              <span className="inline">
                <AssetIcon symbol="POL" />
                {config.chainId === 137
                  ? m("Polygon")
                  : config.chainId === 80002
                    ? m("Polygon Amoy")
                    : m("Local test chain")}
              </span>
              <Status health={health} />
            </div>
            {health?.status !== "ok" && (
              <div className="setup-banner" role="status">
                <Icon name="info" />
                <div>
                  <strong>
                    {health?.status === "setup"
                      ? m("V2 is being prepared.")
                      : health?.status === "syncing"
                        ? m("History is synchronizing.")
                        : m("We couldn’t verify the latest data.")}
                  </strong>
                  <span>
                    {health?.status === "setup"
                      ? m("Explore the portal and save a proposal draft.")
                      : m(
                          "Previously retrieved data may be out of date. Wallet operations require verified data.",
                        )}
                  </span>
                </div>
                {health?.status === "degraded" && (
                  <button
                    className="button small"
                    onClick={() => void healthQuery.refetch()}
                  >
                    {m("Try again")}
                  </button>
                )}
                {health?.reason && (
                  <details>
                    <summary>{m("Details")}</summary>
                    <code>{health.reason}</code>
                  </details>
                )}
              </div>
            )}
            <main id="main-content" tabIndex={-1}>
              {route === "overview" ? (
                <Overview />
              ) : route === "governance" ? (
                <Governance />
              ) : route === "treasury" ? (
                <TreasuryPage />
              ) : route === "delegation" ? (
                <Delegation config={config} canSign={canSign} />
              ) : route === "ragequit" ? (
                <Ragequit config={config} canSign={canSign} />
              ) : route === "create" ? (
                <CreateProposal config={config} canSign={canSign} />
              ) : route.startsWith("proposal/") ? (
                <ProposalDetail
                  contract={route.split("/")[1]}
                  id={route.split("/")[2]}
                  config={config}
                  health={health}
                  canSign={canSign}
                />
              ) : route === "history" ? (
                <History />
              ) : route === "guide" ? (
                <Guide />
              ) : (
                <Empty title={m("Page not found")}>
                  <a href="#overview">{m("Return to the overview")}</a>
                </Empty>
              )}
            </main>
            <footer>
              <span>
                {t("brand")} · {m("Community governance on Polygon")}
              </span>
              <div>
                <a
                  href="https://mythicalbeings.io/"
                  target="_blank"
                  rel="noreferrer"
                >
                  {m("Official website")} ↗
                </a>
                <a href="#history">{t("history")}</a>
                <details>
                  <summary>{m("Technical resources")}</summary>
                  <a href="/api/openapi.json" target="_blank" rel="noreferrer">
                    {m("Public API")} ↗
                  </a>
                </details>
              </div>
            </footer>
          </div>
        </div>
        <dialog
          ref={menu}
          className="navigation-dialog"
          aria-labelledby="navigation-title"
          onClose={() => menuButton.current?.focus()}
        >
          <div className="section-top">
            <h2 id="navigation-title">{m("Navigation")}</h2>
            <button
              className="icon-button"
              aria-label={m("Close navigation")}
              onClick={() => menu.current?.close()}
            >
              <Icon name="close" />
            </button>
          </div>
          <Navigation route={route} onNavigate={() => menu.current?.close()} />
          <a href="https://my.mythicalbeings.io/">
            {m("Back to Mythical Beings")} ↗
          </a>
        </dialog>
      </TransactionProvider>
    </PortalContext.Provider>
  );
}
function Overview() {
  const proposals = useApi<ProposalList>("proposals?kind=executable"),
    ballots = useApi<ProposalList>("ballots"),
    treasury = useApi<TreasuryResponse>("treasury"),
    totals = useApi<{
      activeVotes: number;
      queuedExecutions: number;
      complete: boolean;
    }>("overview"),
    { address } = useAccount(),
    member = useApi<Member>("members/" + address, !!address);
  const all = [
      ...(proposals.data?.items ?? []).filter((p) => p.kind !== "legacy"),
      ...(ballots.data?.items ?? []),
    ]
      .sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)))
      .slice(0, 4),
    vault = treasury.data?.accounts.find((a) => a.role === "vault");
  return (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">{m("Community-governed. Powered by MANA.")}</p>
          <h1>{m("Help shape the world of Mythical Beings.")}</h1>
          <p>
            {m(
              "Explore proposals, vote with MANA and follow the DAO treasury.",
            )}
          </p>
          <div className="button-row">
            <a className="button primary" href="#create">
              <Icon name="plus" />
              {t("create")}
            </a>
            <a className="button" href="#guide">
              {m("How governance works")}
            </a>
          </div>
        </div>
        <img
          src="/brand/mana.png"
          alt="MANA"
          className="welcome-mana"
          width="90"
          height="90"
        />
      </section>
      <section className="metric-grid" aria-label={m("Governance summary")}>
        <div className="metric">
          <span>
            <Icon name="governance" />
            {m("Open votes")}
          </span>
          <strong>
            {totals.data?.complete ? totals.data.activeVotes : "—"}
          </strong>
          <p>{m("Executable proposals and community ballots")}</p>
        </div>
        <div className="metric">
          <span>
            <Icon name="history" />
            {m("Awaiting execution")}
          </span>
          <strong>
            {totals.data?.complete ? totals.data.queuedExecutions : "—"}
          </strong>
          <p>{m("Approved actions in the timelock")}</p>
        </div>
        <div className="metric">
          <span>
            <Icon name="treasury" />
            {m("V2 treasury assets")}
          </span>
          {vault && !treasury.error ? (
            <div className="balance-list">
              {vault.assets.map((a) => (
                <div key={a.symbol}>
                  <AssetIcon symbol={a.symbol} />
                  <span>
                    {amount(a.balance, a.decimals)} {a.symbol}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <>
              <strong>—</strong>
              <p>{m("Verified balances appear when available")}</p>
            </>
          )}
        </div>
      </section>
      <div className="overview-grid">
        <section>
          <div className="section-top section-heading">
            <h2>{m("Recent decisions")}</h2>
            <a href="#governance">{m("View all")} ↗</a>
          </div>
          <DataState
            loading={proposals.isPending || ballots.isPending}
            error={proposals.error || ballots.error}
            unavailable={
              proposals.data?.unavailable || ballots.data?.unavailable
            }
            empty={!all.length}
            retry={() => {
              void proposals.refetch();
              void ballots.refetch();
            }}
            emptyTitle={m("No decisions in this confirmed view.")}
          >
            <div className="proposal-grid">
              {all.map((p) => (
                <ProposalCard key={p.contract + p.id} p={p} />
              ))}
            </div>
          </DataState>
        </section>
        <section className="panel participation">
          <AssetIcon symbol="MANA" />
          <h2>{m("Your participation")}</h2>
          {!address ? (
            <>
              <p>
                {m(
                  "Connect a Polygon wallet to see your MANA balance and voting power.",
                )}
              </p>
              <p className="muted">
                {m(
                  "You can explore decisions and save drafts without connecting.",
                )}
              </p>
            </>
          ) : member.data ? (
            <>
              <p className="participation-balance">
                {amount(member.data.votes)} MANA
              </p>
              <p>{m("Voting power received")}</p>
              <p>
                {member.data.delegate === zeroAddress
                  ? m(
                      "Choose a representative or delegate to yourself to activate your voting power.",
                    )
                  : m(
                      "Your delegation is recorded on-chain. Snapshot rules determine your power in each vote.",
                    )}
              </p>
            </>
          ) : (
            <p>{m("Your membership data is not available yet.")}</p>
          )}
          <a className="button full" href="#delegation">
            {m("Manage delegation")}
            <Icon name="arrow" />
          </a>
          <a href="#governance">{m("Explore open votes")} ↗</a>
        </section>
      </div>
      <section className="panel governance-explainer">
        <Icon name="governance" />
        <div>
          <h2>{m("Two ways to make a decision")}</h2>
          <p>
            {m(
              "Executable proposals can authorize contract actions. Community ballots record a preference and cannot spend treasury assets.",
            )}
          </p>
        </div>
        <a href="#guide">{m("Learn about governance")} ↗</a>
      </section>
    </>
  );
}
function Governance() {
  const [tab, setTab] = useState("executable"),
    [search, setSearch] = useState(""),
    [before, setBefore] = useState("");
  const query = useApi<ProposalList>(
    (tab === "community"
      ? "ballots?kind=community"
      : "proposals?kind=executable") + (before ? "&before=" + before : ""),
  );
  const items = (query.data?.items ?? [])
    .filter((p) => tab === "community" || p.kind === "executable")
    .filter((p) => p.description.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <PageHeading
        title={t("governance")}
        description={m(
          "Review the decision, understand its consequences and cast your vote.",
        )}
        action={
          <a className="button primary" href="#create">
            <Icon name="plus" />
            {t("create")}
          </a>
        }
      />
      <div className="toolbar">
        <div className="segmented" aria-label={m("Decision type")}>
          {["executable", "community"].map((kind) => (
            <button
              key={kind}
              aria-pressed={tab === kind}
              className={tab === kind ? "selected" : ""}
              onClick={() => {
                setTab(kind);
                setBefore("");
              }}
            >
              {kind === "executable"
                ? m("Executable proposals")
                : m("Community ballots")}
            </button>
          ))}
        </div>
        <label className="search">
          <span className="sr-only">{m("Search proposals on this page")}</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={m("Search this page…")}
          />
        </label>
      </div>
      <p className="muted">
        {m("Search covers the proposals on this page only.")}
      </p>
      <Notice>
        {tab === "community" ? t("advisoryNotice") : t("fundingNotice")}
      </Notice>
      <DataState
        loading={query.isPending}
        error={query.error}
        unavailable={query.data?.unavailable}
        empty={!items.length}
        retry={() => void query.refetch()}
        emptyTitle={
          search
            ? m("No proposals match this search on the current page.")
            : m("No proposals in this confirmed view.")
        }
      >
        <div className="proposal-grid">
          {items.map((p) => (
            <ProposalCard key={p.contract + p.id} p={p} />
          ))}
        </div>
      </DataState>
      <Pagination
        before={before}
        next={query.data?.nextBefore}
        change={setBefore}
      />
    </>
  );
}
function Pagination({
  before,
  next,
  change,
}: {
  before: string;
  next?: string | null;
  change: (v: string) => void;
}) {
  return (
    <div className="button-row pagination">
      {before && (
        <button className="button" onClick={() => change("")}>
          {m("Latest proposals")}
        </button>
      )}
      {next && (
        <button className="button" onClick={() => change(next)}>
          {m("Older proposals")} →
        </button>
      )}
    </div>
  );
}
function TreasuryPage() {
  const { config } = usePortal(),
    query = useApi<TreasuryResponse>("treasury"),
    events = useApi<EventList>("events"),
    proposals = useApi<ProposalList>("proposals?kind=executable");
  const payments = (proposals.data?.items ?? [])
    .filter(
      (p) =>
        p.kind === "executable" && ["Succeeded", "Queued"].includes(p.state),
    )
    .map((p) => ({
      p,
      payments: proposalActions(p)
        .map((a) => paymentFor(a, config))
        .filter(Boolean),
    }))
    .filter((p) => p.payments.length);
  const movements = (events.data?.items ?? []).filter(
    (e) =>
      ["Redeemed", "Payment", "NativeDeposit", "Transfer"].includes(
        e.event_name,
      ) && e.contract !== config.contracts.mana?.address,
  );
  return (
    <>
      <PageHeading
        title={m("Treasury")}
        description={m(
          "Follow verified holdings and the decisions that authorize spending.",
        )}
      />
      {["vault", "legacy"].map((role) => {
        const account = query.data?.accounts.find((a) => a.role === role),
          address =
            config.contracts[role === "vault" ? "vault" : "legacyGovernor"]
              ?.address;
        return (
          <section className="panel treasury-panel" key={role}>
            <div className="section-top">
              <div>
                <p className="eyebrow">
                  {role === "vault"
                    ? m("Fixed V2 exit basket")
                    : m("Outside the V2 exit basket")}
                </p>
                <h2>
                  {role === "vault" ? m("V2 treasury") : m("Legacy holdings")}
                </h2>
              </div>
              {address && <AddressLink address={address} />}
            </div>
            <DataState
              loading={query.isPending}
              error={query.error}
              unavailable={query.data?.unavailable || !account}
              empty={false}
              retry={() => void query.refetch()}
            >
              <div className="metric-grid">
                {account?.assets.map((asset) => (
                  <div className="metric" key={asset.symbol}>
                    <span>
                      <AssetIcon symbol={asset.symbol} />
                      {asset.symbol}
                    </span>
                    <strong>{amount(asset.balance, asset.decimals)}</strong>
                    {asset.address ? (
                      <AddressLink address={asset.address} />
                    ) : (
                      <p>{m("Native Polygon asset")}</p>
                    )}
                  </div>
                ))}
              </div>
              {query.data && !query.data.unavailable && (
                <p className="muted">
                  {m("Balances verified at block {block}", {
                    block: query.data.asOfBlock,
                  })}
                </p>
              )}
            </DataState>
            {role === "vault" && <Notice>{t("fundingNotice")}</Notice>}
          </section>
        );
      })}
      <div className="split-layout">
        <section className="panel">
          <h2>{m("Identified pending payments")}</h2>
          <p className="muted">
            {m(
              "Only payment actions identified in the loaded proposals are shown. This is not a complete commitment ledger.",
            )}
          </p>
          <DataState
            loading={proposals.isPending}
            error={proposals.error}
            unavailable={proposals.data?.unavailable}
            empty={!payments.length}
            emptyTitle={m(
              "No identified pending payments in the loaded proposals.",
            )}
          >
            {payments.map(({ p, payments }) => (
              <article className="pending-payment" key={p.id}>
                <ProposalCard p={p} />
                {payments.map((payment, i) => (
                  <p key={i}>
                    <strong>
                      {payment!.quantity} {payment!.symbol}
                    </strong>{" "}
                    →{" "}
                    <AddressLink
                      address={payment!.recipient as `0x${string}`}
                    />
                  </p>
                ))}
              </article>
            ))}
          </DataState>
        </section>
        <section className="panel">
          <h2>{m("Recent treasury activity")}</h2>
          <DataState
            loading={events.isPending}
            error={events.error}
            unavailable={events.data?.unavailable}
            empty={!movements.length}
          >
            {movements.map((e) => (
              <div className="activity-row" key={e.tx_hash + e.log_index}>
                <Icon name="arrow" />
                <div>
                  <strong>{e.event_name}</strong>
                  <p className="muted">
                    {m("Block {block} · confirmed", { block: e.block_number })}
                  </p>
                </div>
                <a
                  href={"https://polygonscan.com/tx/" + e.tx_hash}
                  target="_blank"
                  rel="noreferrer"
                >
                  {m("Receipt")} ↗
                </a>
              </div>
            ))}
          </DataState>
        </section>
      </div>
      <p className="muted">
        {m(
          "MANA, NFTs, other tokens and assets outside the V2 vault are excluded from the exit basket. Transferring excluded assets requires governance.",
        )}
      </p>
    </>
  );
}
function History() {
  const { config } = usePortal(),
    [tab, setTab] = useState("legacy"),
    [before, setBefore] = useState(""),
    proposals = useApi<ProposalList>(
      "proposals?kind=" +
        (tab === "v2" ? "executable" : "legacy") +
        (before ? "&before=" + before : ""),
      tab !== "snapshot",
    ),
    archive = useApi<ListResponse<SnapshotRecord>>(
      "history/snapshot",
      tab === "snapshot",
    );
  return (
    <>
      <PageHeading
        title={m("Governance history")}
        description={m(
          "Original decisions, with their sources and verification limits.",
        )}
      />
      <div className="segmented history-tabs">
        {[
          ["legacy", m("Original Governor")],
          ["v2", m("Governor V2")],
          ["snapshot", m("Snapshot archive")],
        ].map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? "selected" : ""}
            aria-pressed={tab === value}
            onClick={() => {
              setTab(value);
              setBefore("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "snapshot" ? (
        <>
          <Notice>
            {m(
              "Read-only off-chain archive. Results and signatures have not been independently verified. These records do not prove treasury execution.",
            )}
          </Notice>
          <DataState
            independent
            loading={archive.isPending}
            error={archive.error}
            unavailable={archive.data?.unavailable}
            empty={!archive.data?.items.length}
            retry={() => void archive.refetch()}
          >
            {archive.data?.items.map((item) => (
              <article className="panel archive-item" key={item.id}>
                <div className="section-top">
                  <span className="eyebrow">
                    {m("Archived Snapshot decision")}
                  </span>
                  <span className="badge">{m("Read-only")}</span>
                </div>
                <h2>{item.payload.title ?? item.id}</h2>
                <p className="muted">
                  <DateStamp
                    value={item.created_at ?? item.payload.created ?? ""}
                  />{" "}
                  · {item.payload.type ?? m("Off-chain vote")}
                </p>
                <a
                  href={
                    item.source_url.startsWith("https://")
                      ? item.source_url
                      : undefined
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  {m("Original source")} ↗
                </a>
                <details>
                  <summary>{m("Archived content and provenance")}</summary>
                  <pre className="proposal-text">{item.payload.body}</pre>
                  <p>{item.payload.choices?.join(" · ")}</p>
                  <p>
                    {m("Imported")} <DateStamp value={item.imported_at} />
                  </p>
                  <p>{item.verification}</p>
                  <code className="calldata">{item.id}</code>
                </details>
              </article>
            ))}
          </DataState>
        </>
      ) : (
        <>
          <section className="panel compact">
            <div className="section-top">
              <h2>
                {tab === "legacy" ? m("Original Governor") : m("Governor V2")}
              </h2>
              {config.contracts[
                tab === "legacy" ? "legacyGovernor" : "governor"
              ] ? (
                <AddressLink
                  address={
                    config.contracts[
                      tab === "legacy" ? "legacyGovernor" : "governor"
                    ]!.address
                  }
                />
              ) : (
                <span className="muted">{m("Awaiting deployment")}</span>
              )}
            </div>
            <p>
              {tab === "legacy"
                ? m(
                    "Legacy proposals retain their original identities. Residual funds and unfinished decisions remain part of the migration process.",
                  )
                : m(
                    "V2 decisions retain their on-chain identities and execution state.",
                  )}
            </p>
          </section>
          <DataState
            loading={proposals.isPending}
            error={proposals.error}
            unavailable={proposals.data?.unavailable}
            empty={!proposals.data?.items.length}
            retry={() => void proposals.refetch()}
          >
            <div className="proposal-grid">
              {proposals.data?.items.map((p) => (
                <ProposalCard key={p.contract + p.id} p={p} />
              ))}
            </div>
          </DataState>
          <Pagination
            before={before}
            next={proposals.data?.nextBefore}
            change={setBefore}
          />
        </>
      )}
    </>
  );
}
function Guide() {
  return (
    <>
      <PageHeading
        title={m("How governance works")}
        description={m("Community-governed. Powered by MANA.")}
      />
      <div className="guide-grid">
        {[
          [
            m("1. Activate voting power"),
            m(
              "Hold MANA and delegate to yourself or a representative. Delegation does not transfer your tokens. Voting power is fixed at each proposal’s snapshot.",
            ),
          ],
          [
            m("2. Propose a decision"),
            m(
              "Create an executable proposal for contract actions, or a community ballot for an advisory preference. The initial proposal threshold is 250 delegated MANA at the previous block.",
            ),
          ],
          [
            m("3. Review and vote"),
            m(
              "Initial rules: voting starts after 41,143 blocks and lasts 288,000 blocks. Executable proposals need 10% quorum from for plus abstain votes and at least two-thirds support among directional votes.",
            ),
          ],
          [
            m("4. Wait, then execute"),
            m(
              "Approved executable proposals must be scheduled and wait at least 72 hours. Anyone can schedule or execute an eligible proposal. Approval does not reserve assets.",
            ),
          ],
        ].map(([title, body]) => (
          <section className="panel" key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </section>
        ))}
      </div>
      <Notice>
        {m(
          "V2 exits burn MANA permanently for a proportional share of the configured basket. Availability depends on the deployed vault, current assets and successful atomic transfers.",
        )}
      </Notice>
      <a className="button primary" href="#create">
        {t("create")}
      </a>
    </>
  );
}
