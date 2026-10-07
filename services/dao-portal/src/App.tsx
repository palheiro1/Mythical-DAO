import { DecisionList } from "./Journal";
import { BlockDuration } from "./HumanTime";
import { CampBreadcrumb, campPlaces } from "./Camp";
import {
  JournalCamp,
  JournalGovernance,
  JournalTreasury,
  JournalIcon,
} from "./Journal";
import { TokenAmount } from "./TokenAmount";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import type { Health, PortalConfig } from "../shared/domain";
import type {
  ProposalList,
  SnapshotRecord,
  ListResponse,
  GovernanceParameters,
} from "./data-types";
import { useApi } from "./api";
import { SyncStatus } from "./SyncStatus";
import { Wallet, Status, Empty, ProposalCard, AddressLink } from "./components";
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
  ReadFreshness,
  Notice,
  PageHeading,
  AssetIcon,
  DateStamp,
  usePortal,
} from "./ui";
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
  journal = false,
}: {
  journal?: boolean;
  route: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <p className="nav-label">{m("Around the camp")}</p>
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
            aria-label={
              key === "overview"
                ? m("Camp · Overview")
                : `${campPlaces.find((p) => p.route === key)?.name} · ${campPlaces.find((p) => p.route === key)?.task}`
            }
            aria-current={
              route === key ||
              (key === "governance" && route.startsWith("proposal/"))
                ? "page"
                : undefined
            }
            href={"#" + key}
            onClick={onNavigate}
          >
            {journal ? <JournalIcon name={key} /> : <Icon name={key} />}
            <span className="nav-destination">
              <strong>
                {key === "overview"
                  ? m("Camp")
                  : campPlaces.find((p) => p.route === key)?.name}
              </strong>
              <small>
                {key === "overview"
                  ? t(key)
                  : campPlaces.find((p) => p.route === key)?.task}
              </small>
            </span>
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
  const journal = true;
  useLayoutEffect(() => {
    document.documentElement.dataset.design = journal ? "journal" : "camp";
    return () => {
      delete document.documentElement.dataset.design;
    };
  }, [journal]);
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
    !!address &&
    chainId === config.chainId &&
    config.enabled &&
    (health?.signingAllowed === true ||
      health?.operationVerification === "on-demand");
  return (
    <PortalContext.Provider value={{ config, health }}>
      <TransactionProvider config={config}>
        <div className={journal ? "journal-root" : "portal-root"}>
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
          <div
            className={"app-shell" + (route === "overview" ? " is-camp" : "")}
          >
            <aside className="sidebar">
              <Navigation route={route} journal={journal} />
            </aside>
            <div className="main-column">
              <div className={journal ? "journal-health" : undefined}>
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
                {(health?.status !== "ok" || health?.liveReason) && (
                  <div className="setup-banner" role="status">
                    <Icon name="info" />
                    <details>
                      <summary>
                        <strong>
                          {!health && !healthQuery.error
                            ? m("Checking live data…")
                            : health?.liveReason
                              ? m("We couldn’t verify the latest data.")
                              : health?.status === "setup"
                                ? m("The portal is being prepared.")
                                : health?.status === "syncing"
                                  ? m("History is synchronizing.")
                                  : health?.head
                                    ? m("History is incomplete.")
                                    : m("We couldn’t verify the latest data.")}
                        </strong>
                      </summary>
                      <span>
                        {!health && !healthQuery.error
                          ? m("Loading balances and governance status.")
                          : health?.status === "setup"
                            ? m("Explore the portal and save a proposal draft.")
                            : health?.signingAllowed
                              ? m(
                                  "Wallet and treasury balances are read directly from the network. Each wallet operation is verified and simulated before signing; historical lists and metrics are incomplete.",
                                )
                              : m(
                                  "Previously retrieved data may be out of date. Wallet operations require verified data.",
                                )}
                      </span>
                      {(health?.reason || health?.liveReason) && (
                        <code>
                          {[health.liveReason, health.reason]
                            .filter(Boolean)
                            .join(" · ")}
                        </code>
                      )}
                    </details>
                    {(healthQuery.error ||
                      health?.status === "degraded" ||
                      health?.liveReason) && (
                      <button
                        className="button small"
                        onClick={() => void healthQuery.refetch()}
                      >
                        {m("Try again")}
                      </button>
                    )}
                  </div>
                )}
                {config.enabled && <SyncStatus health={health} />}
              </div>
              <main
                id="main-content"
                tabIndex={-1}
                className={`page-${route.split("/")[0]}`}
              >
                {route !== "overview" && <CampBreadcrumb route={route} />}
                {route === "overview" ? (
                  <JournalCamp />
                ) : route === "governance" ? (
                  <JournalGovernance />
                ) : route === "treasury" ? (
                  <JournalTreasury />
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
                    <a
                      href="/api/openapi.json"
                      target="_blank"
                      rel="noreferrer"
                    >
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
            <Navigation
              route={route}
              journal={journal}
              onNavigate={() => menu.current?.close()}
            />
            <a href="https://my.mythicalbeings.io/">
              {m("Back to Mythical Beings")} ↗
            </a>
          </dialog>
        </div>
      </TransactionProvider>
    </PortalContext.Provider>
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
function History() {
  const { config } = usePortal(),
    [tab, setTab] = useState("legacy"),
    [before, setBefore] = useState(""),
    proposals = useApi<ProposalList>(
      "proposals?kind=" + "legacy" + (before ? "&before=" + before : ""),
      tab !== "snapshot",
    ),
    archive = useApi<ListResponse<SnapshotRecord>>(
      "history/snapshot",
      tab === "snapshot",
    );
  return (
    <>
      <PageHeading
        art="map"
        chapter="05 / THE CHRONICLE"
        title={m("Governance history")}
        description={m(
          "Original decisions, with their sources and verification limits.",
        )}
      />
      <div className="segmented history-tabs">
        {[
          ["legacy", m("Original Governor")],
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
              <h2>{m("Original Governor")}</h2>
              {config.contracts["governor"] ? (
                <AddressLink address={config.contracts["governor"]!.address} />
              ) : (
                <span className="muted">{m("Awaiting deployment")}</span>
              )}
            </div>
            <p>
              {m(
                "The original Governor remains active. Proposals retain their original identities, actions and execution state.",
              )}
            </p>
          </section>
          <DataState
            read={proposals.data?.read}
            loading={proposals.isPending}
            error={proposals.error}
            unavailable={proposals.data?.unavailable}
            empty={!proposals.data?.items.length}
            retry={() => void proposals.refetch()}
          >
            <DecisionList items={proposals.data?.items ?? []} />
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
  const { config } = usePortal();
  const rules = useApi<GovernanceParameters>("governance-parameters");
  return (
    <>
      <PageHeading
        art="shahmaran"
        chapter="FIELD GUIDE / KNOW THE CAMP"
        title={m("How governance works")}
        description={m("Community-governed. Powered by MANA.")}
      />
      <section className="panel" aria-busy={rules.isPending}>
        <h2>{m("Current Governor rules")}</h2>
        <ReadFreshness read={rules.data?.read} />
        {rules.data ? (
          <dl>
            <dt>{m("Proposal threshold")}</dt>
            <dd>
              <TokenAmount
                value={rules.data.proposalThreshold}
                token={config.contracts.mana?.address}
                showSymbol
              />
            </dd>
            <dt>{m("Voting delay / period")}</dt>
            <dd>
              <div>
                Delay: <BlockDuration blocks={rules.data.votingDelay} />
              </div>
              <div>
                Voting: <BlockDuration blocks={rules.data.votingPeriod} />
              </div>
            </dd>
            <dt>{m("Quorum")}</dt>
            <dd>
              {rules.data.quorumNumerator} / {rules.data.quorumDenominator}
            </dd>
            <dt>{m("Rule verification")}</dt>
            <dd>
              <details>
                <summary>{m("Technical details")}</summary>
                <p>
                  {m("Counting mode")}: {rules.data.countingMode}
                </p>
                <p>
                  {m("Verified at block")}: {rules.data.block}
                </p>
              </details>
            </dd>
          </dl>
        ) : (
          <p>
            {rules.isPending
              ? m("Checking current rules…")
              : m("Current rules could not be verified.")}
          </p>
        )}
      </section>
      <div className="guide-grid guide-chapters">
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
              "Create an executable proposal for contract actions, or use Snapshot for an advisory preference. The existing Governor enforces the current proposal threshold.",
            ),
          ],
          [
            m("3. Review and vote"),
            m(
              "Voting power is fixed at the proposal snapshot. The current Governor determines quorum, voting deadlines and the result.",
            ),
          ],
          [
            m("4. Execute approved actions"),
            m(
              "Approved proposals execute directly through the existing Governor, without a timelock step. Approval does not reserve treasury assets.",
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
          "Exits burn MANA permanently for GEM, WETH and native USDC. The DAO can spend treasury funds or revoke allowances. There is no mandatory exit window.",
        )}
      </Notice>
      <a className="button primary" href="#create">
        {t("create")}
      </a>
    </>
  );
}
