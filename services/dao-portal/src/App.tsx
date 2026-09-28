import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import type {
  ChainEvent,
  Health,
  PortalConfig,
  Proposal,
} from "../shared/domain";
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
import { t, type MessageKey } from "./i18n";
type List = {
  items: Proposal[];
  unavailable?: boolean;
  nextBefore?: string | null;
};
type Treasury = {
  accounts: {
    role: string;
    address: Address;
    assets: { symbol: string; balance: string; decimals: number }[];
  }[];
  asOfBlock: string;
};
function useRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || "overview");
  useEffect(() => {
    const cb = () => {
      setRoute(location.hash.slice(1) || "overview");
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", cb);
    return () => removeEventListener("hashchange", cb);
  }, []);
  return route;
}
function Emblem() {
  return (
    <svg className="emblem" viewBox="0 0 44 44" aria-hidden="true">
      <path
        d="M22 2 29 15 42 22 29 29 22 42 15 29 2 22 15 15Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="m22 10 12 12-12 12-12-12Z" fill="none" stroke="currentColor" />
      <circle cx="22" cy="22" r="4" fill="currentColor" />
    </svg>
  );
}
export function App() {
  const route = useRoute(),
    { data: config, error } = useApi<PortalConfig>("config", true, 60000),
    { data: health } = useApi<Health>("health", true, 20000);
  const { address, chainId } = useAccount();
  if (!config)
    return (
      <main className="loading">
        <Emblem />
        <h1>Mythical DAO</h1>
        <p role={error ? "alert" : "status"}>
          {error
            ? "The portal configuration could not be loaded. Start the API service or retry."
            : "Opening the commons…"}
        </p>
        <button className="button" onClick={() => location.reload()}>
          Retry
        </button>
      </main>
    );
  const canSign =
    !!address && chainId === config.chainId && health?.signingAllowed === true;
  const links: MessageKey[] = [
    "overview",
    "governance",
    "treasury",
    "delegation",
    "ragequit",
    "history",
  ];
  return (
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
        <a className="brand" href="#overview">
          <Emblem />
          <span>
            MYTHICAL<span className="brand-sub">THE DAO</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          {links.map((key) => (
            <a
              key={key}
              className={route === key ? "current" : ""}
              href={"#" + key}
            >
              {t(key)}
            </a>
          ))}
        </nav>
        <Wallet config={config} />
      </header>
      <div className="network-bar">
        <span>
          <span className="chain-dot" />{" "}
          {config.chainId === 137
            ? "Polygon"
            : config.chainId === 80002
              ? "Polygon Amoy"
              : "Local test chain"}{" "}
          <span className="muted">/ Community governance</span>
        </span>
        <Status health={health} />
      </div>
      {health?.status !== "ok" && (
        <div className="setup-banner" role="status">
          <strong>
            {health?.status === "setup"
              ? "Deployment in preparation"
              : health?.status === "syncing"
                ? "Synchronizing on-chain history"
                : "Verifying network data"}
          </strong>
          <span>
            {health?.reason ?? "Waiting for the index health check."} Wallet
            operations require verified data.
          </span>
        </div>
      )}
      <main id="main-content" tabIndex={-1}>
        {route === "overview" ? (
          <Overview config={config} />
        ) : route === "governance" ? (
          <Governance />
        ) : route === "treasury" ? (
          <TreasuryPage config={config} />
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
          <History config={config} />
        ) : (
          <Empty title="Page not found">
            <a href="#overview">Return to the overview</a>
          </Empty>
        )}
      </main>
      <footer>
        <a className="brand footer-brand" href="#overview">
          <Emblem />
          <span>MYTHICAL DAO</span>
        </a>
        <p>A world shaped by its members.</p>
        <div>
          <a href="/api/openapi.json" target="_blank" rel="noreferrer">
            Public API ↗
          </a>
          <a href="#history">Governance history</a>
          <span>Built on Polygon</span>
        </div>
      </footer>
    </TransactionProvider>
  );
}
function Overview({ config }: { config: PortalConfig }) {
  const { data: proposals } = useApi<List>("proposals"),
    { data: ballots } = useApi<List>("ballots"),
    { data: treasury } = useApi<Treasury>("treasury");
  const all = [
    ...(proposals?.items ?? []).filter((p) => p.kind !== "legacy"),
    ...(ballots?.items ?? []),
  ];
  const active = all.filter((p) => p.state === "Active"),
    queued = all.filter((p) => p.state === "Queued");
  const { data: totals } = useApi<{
    activeVotes: number;
    queuedExecutions: number;
    complete: boolean;
  }>("overview");
  const vault = treasury?.accounts.find((a) => a.role === "vault");
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="tiny-star">✦</span> THE MYTHICAL COMMONS
          </span>
          <h1>
            A shared world.
            <br />
            <em>A collective future.</em>
          </h1>
          <p>
            Shape what comes next for Mythical Beings.
            <br />
            Propose an idea, cast your vote, and govern the treasury together.
          </p>
          <div className="button-row">
            <a className="button primary" href="#governance">
              Explore governance <span>↗</span>
            </a>
            <a className="button text-button" href="#create">
              Create a proposal <span>→</span>
            </a>
          </div>
          <div className="hero-note">
            <i /> Member-owned. Governed on-chain.
          </div>
        </div>
        <div
          className="commons-art"
          aria-label="An open circle represents a community governed by its members"
          role="img"
        >
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="art-star">✧</div>
          <div className="art-center">
            <Emblem />
            <span>
              OUR WORLD.
              <br />
              OUR DECISIONS.
            </span>
          </div>
          <span className="art-label top">PARTICIPATE</span>
          <span className="art-label bottom">BUILD TOGETHER</span>
          <div className="orbit-dot one" />
          <div className="orbit-dot two" />
          <div className="art-caption">THE POWER OF MANY</div>
        </div>
      </section>
      <section className="metric-grid" aria-label="Governance summary">
        <div className="metric">
          <span>
            Open votes <small>↗</small>
          </span>
          <strong>{totals?.complete ? totals.activeVotes : "—"}</strong>
          <p>Decisions ready for your voice</p>
        </div>
        <div className="metric">
          <span>
            Awaiting execution <small>◷</small>
          </span>
          <strong>{totals?.complete ? totals.queuedExecutions : "—"}</strong>
          <p>A minimum 72-hour exit window</p>
        </div>
        <div className="metric">
          <span>
            Treasury · USDC.e <small>◇</small>
          </span>
          <strong>
            {vault
              ? amount(
                  vault.assets.find((a) => a.symbol === "USDC.e")?.balance ??
                    "0",
                  6,
                )
              : "—"}
          </strong>
          <p>On-chain balances, shared ownership</p>
        </div>
      </section>
      <div className="overview-grid">
        <section>
          <div className="section-top section-heading">
            <div>
              <span className="eyebrow">THE CONVERSATION IN ACTION</span>
              <h2>Decisions we make together</h2>
            </div>
            <a href="#governance">View all ↗</a>
          </div>
          {all.length ? (
            <div className="proposal-grid">
              {all.slice(0, 4).map((p) => (
                <ProposalCard key={p.contract + p.id} p={p} />
              ))}
            </div>
          ) : (
            <div className="panel">
              <Empty
                title={
                  config.enabled
                    ? "A new chapter starts with an idea"
                    : "The next chapter is taking shape"
                }
              >
                {config.enabled
                  ? "No proposals have been indexed yet. Create a proposal to start the next decision."
                  : "The independent governance contracts are being prepared. Published proposals will appear here after activation."}
              </Empty>
              <a className="inline-link" href="#create">
                Start a local draft →
              </a>
            </div>
          )}
        </section>
        <aside className="principles">
          <span className="eyebrow">YOUR MEMBERSHIP</span>
          <h2>
            A voice.
            <br />A stake.
            <br />A way forward.
          </h2>
          <div>
            <span>01</span>
            <p>
              <strong>Govern with MANA</strong>Delegate to yourself or choose a
              representative.
            </p>
          </div>
          <div>
            <span>02</span>
            <p>
              <strong>Know what you approve</strong>Review every action before
              you sign.
            </p>
          </div>
          <div>
            <span>03</span>
            <p>
              <strong>Keep the freedom to leave</strong>Burn MANA to redeem your
              share of the fixed basket.
            </p>
          </div>
          <a href="#delegation">Manage your voting power ↗</a>
        </aside>
      </div>
      <section className="wide-callout">
        <div>
          <span className="eyebrow">COMMUNITY PREFERENCES, ON-CHAIN</span>
          <h2>Some decisions begin with a choice.</h2>
          <p>
            Community ballots bring multiple alternatives to a single vote.
            Treasury spending follows a separate executable proposal.
          </p>
        </div>
        <a className="button" href="#governance">
          Discover community ballots ↗
        </a>
      </section>
    </>
  );
}
function Governance() {
  const [tab, setTab] = useState("executable"),
    [search, setSearch] = useState(""),
    [before, setBefore] = useState("");
  const { data, error, isPending } = useApi<List>(
    (tab === "community"
      ? "ballots?kind=community"
      : "proposals?kind=executable") + (before ? "&before=" + before : ""),
  );
  const items = (data?.items ?? [])
    .filter((p) => tab === "community" || p.kind === "executable")
    .filter((p) => p.description.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <div className="page-heading with-action">
        <div>
          <span className="eyebrow">A voice in what comes next</span>
          <h1>Governance</h1>
          <p>Explore the proposals and choices shaping our shared world.</p>
        </div>
        <a className="button primary" href="#create">
          + Create proposal
        </a>
      </div>
      <div className="toolbar">
        <div className="segmented">
          {["executable", "community"].map((kind) => (
            <button
              key={kind}
              className={tab === kind ? "selected" : ""}
              onClick={() => {
                setTab(kind);
                setBefore("");
              }}
            >
              {kind === "executable"
                ? "Executable proposals"
                : "Community ballots"}
            </button>
          ))}
        </div>
        <label className="search">
          <span className="sr-only">Search proposals on this page</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this page…"
          />
        </label>
      </div>
      <p className="notice">
        {tab === "community" ? t("advisoryNotice") : t("fundingNotice")}
      </p>
      {error ? (
        <p role="alert" className="error">
          {error.message}
        </p>
      ) : isPending ? (
        <p role="status">Loading governance…</p>
      ) : items.length ? (
        <div className="proposal-grid">
          {items.map((p) => (
            <ProposalCard key={p.contract + p.id} p={p} />
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title={search ? "No matching proposals" : "No proposals to display"}
          >
            {search
              ? "Try another search term."
              : "Published on-chain decisions will appear once the index is ready."}
          </Empty>
        </section>
      )}
      <div className="button-row">
        {before && (
          <button className="button" onClick={() => setBefore("")}>
            Latest proposals
          </button>
        )}
        {data?.nextBefore && (
          <button
            className="button"
            onClick={() => setBefore(data.nextBefore!)}
          >
            Older proposals →
          </button>
        )}
      </div>
    </>
  );
}
function TreasuryPage({ config }: { config: PortalConfig }) {
  const { data, error } = useApi<Treasury>("treasury"),
    { data: events } = useApi<{ items: ChainEvent[] }>("events"),
    { data: proposals } = useApi<List>("proposals");
  const payments = (proposals?.items ?? []).filter(
    (p) => p.kind === "executable" && ["Succeeded", "Queued"].includes(p.state),
  );
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">Shared resources. Visible decisions.</span>
        <h1>The treasury</h1>
        <p>
          Follow the assets we own together and the decisions that put them to
          work.
        </p>
      </div>
      {error && (
        <p role="alert" className="notice">
          {error.message}
        </p>
      )}
      {data?.accounts.map((account) => (
        <section className="panel treasury-panel" key={account.role}>
          <div className="section-top">
            <div>
              <span className="eyebrow">
                {account.role === "vault"
                  ? "V2 · fixed exit basket"
                  : "Legacy · outside the exit basket"}
              </span>
              <h2>
                {account.role === "vault"
                  ? "Member treasury"
                  : "Old Governor holdings"}
              </h2>
            </div>
            <AddressLink address={account.address} />
          </div>
          <div className="metric-grid">
            {account.assets.map((asset) => (
              <div className="metric" key={asset.symbol}>
                <span>{asset.symbol}</span>
                <strong>{amount(asset.balance, asset.decimals)}</strong>
                <p>
                  {account.role === "vault"
                    ? "Included in ragequit"
                    : "Not redeemable from V2"}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
      {!config.contracts.vault && (
        <section className="panel">
          <Empty title="The new treasury is not active yet">
            Assets enter the exit basket only after they are deposited into the
            new vault.
          </Empty>
        </section>
      )}
      <div className="split-layout">
        <section className="panel">
          <h2>Approved, awaiting payment</h2>
          <p className="notice">{t("fundingNotice")}</p>
          {payments.length ? (
            payments.map((p) => <ProposalCard key={p.id} p={p} />)
          ) : (
            <p className="muted">
              No pending payments in the latest indexed proposals.
            </p>
          )}
        </section>
        <section className="panel">
          <h2>Recent treasury activity</h2>
          {events?.items
            .filter(
              (e) =>
                ["Redeemed", "Payment", "NativeDeposit", "Transfer"].includes(
                  e.event_name,
                ) && e.contract !== config.contracts.mana?.address,
            )
            .map((e) => (
              <div className="activity-row" key={e.tx_hash + e.log_index}>
                <span className="activity-icon">↗</span>
                <div>
                  <strong>{e.event_name}</strong>
                  <p className="muted">Block {e.block_number} · confirmed</p>
                </div>
                <a
                  href={"https://polygonscan.com/tx/" + e.tx_hash}
                  target="_blank"
                  rel="noreferrer"
                >
                  Receipt ↗
                </a>
              </div>
            ))}
          {!events?.items.length && (
            <p className="muted">Confirmed movements will appear here.</p>
          )}
        </section>
      </div>
      <p className="muted">
        MANA, NFTs, other tokens, and assets outside this vault are excluded
        from ragequit. Unsolicited assets require governance to transfer them.
        Balances are read directly from Polygon
        {data ? " at block " + data.asOfBlock : ""}.
      </p>
    </>
  );
}
function History({ config }: { config: PortalConfig }) {
  const { data: proposals } = useApi<List>("proposals?kind=legacy"),
    { data: archive } = useApi<{
      items: {
        id: string;
        source_url: string;
        verification: string;
        payload: { title?: string; body?: string; choices?: string[] };
        imported_at: string;
      }[];
    }>("history/snapshot");
  const legacy = proposals?.items.filter((p) => p.kind === "legacy") ?? [];
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">Where we came from</span>
        <h1>Governance history</h1>
        <p>Preserving our decisions, with their original sources and limits.</p>
      </div>
      <section className="panel">
        <h2>Contract generations</h2>
        <div className="table-row">
          <span>Original Governor · historical</span>
          {config.contracts.legacyGovernor && (
            <AddressLink address={config.contracts.legacyGovernor.address} />
          )}
        </div>
        <div className="table-row">
          <span>Mythical Governor V2</span>
          {config.contracts.governor ? (
            <AddressLink address={config.contracts.governor.address} />
          ) : (
            <span>Awaiting deployment</span>
          )}
        </div>
        <p>
          Legacy proposals keep their original identities. Unfinished proposals
          and residual funds must be handled explicitly during migration.
        </p>
      </section>
      <h2 className="spaced">Legacy on-chain proposals</h2>
      {legacy.length ? (
        <div className="proposal-grid">
          {legacy.map((p) => (
            <ProposalCard key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty title="Legacy history is being prepared">
            The archive will populate from confirmed events, independently of
            Tally.
          </Empty>
        </section>
      )}
      <h2 className="spaced">
        Snapshot archive <span className="badge">Read-only</span>
      </h2>
      {archive?.items.length ? (
        archive.items.map((item) => (
          <article className="panel archive-item" key={item.id}>
            <h3>{item.payload.title ?? item.id}</h3>
            <p className="muted">
              Imported {item.imported_at} · {item.verification}
            </p>
            <details>
              <summary>Archived content</summary>
              <pre className="proposal-text">{item.payload.body}</pre>
              <p>{item.payload.choices?.join(" · ")}</p>
            </details>
          </article>
        ))
      ) : (
        <section className="panel">
          <Empty title="No Snapshot archive imported">
            Historical off-chain records will be labeled with their source and
            verification limitations.
          </Empty>
        </section>
      )}
    </>
  );
}
