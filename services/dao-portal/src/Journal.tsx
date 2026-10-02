import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { decodeFunctionData, zeroAddress } from "viem";
import type { Proposal } from "../shared/domain";
import { tokenAbi } from "../shared/abis";
import type {
  EventList,
  Member,
  ProposalList,
  TreasuryResponse,
} from "./data-types";
import { useApi } from "./api";
import { m, t } from "./i18n";
import {
  AssetIcon,
  DataState,
  Icon,
  Notice,
  StateBadge,
  usePortal,
} from "./ui";
import { AddressLink, short } from "./components";
import { TokenAmount } from "./TokenAmount";
import { displayAsset, formatTokenAmount } from "./token-format";
import { paymentFor, proposalActions, type Payment } from "./action-view";
import { campPlaces } from "./Camp";
import { RecoverProposal } from "./RecoverProposal";

const navImages: Record<string, string> = {
  overview: "overview",
  governance: "messages",
  treasury: "inventory",
  delegation: "account",
  history: "history",
  create: "book",
  guide: "book",
};
export function JournalIcon({ name }: { name: string }) {
  return (
    <span className={`journal-symbol symbol-${name}`} aria-hidden="true">
      {navImages[name] ? (
        <img
          src={`/journal/nav/${navImages[name]}.png`}
          width="28"
          height="28"
          alt=""
        />
      ) : (
        <Icon name={name} />
      )}
    </span>
  );
}

function ChapterHeading({
  chapter,
  title,
  description,
  art,
  children,
}: {
  chapter: string;
  title: string;
  description: string;
  art: "bahana" | "golden-fronds";
  children?: ReactNode;
}) {
  return (
    <header className={`chapter-heading chapter-${art}`}>
      <div className="chapter-copy">
        <p className="journal-kicker">{chapter}</p>
        <h1>{title}</h1>
        <p>{description}</p>
        {children}
      </div>
      <img
        className="chapter-art"
        src={`/journal/${art}.webp`}
        alt=""
        width={art === "bahana" ? 500 : 720}
        height={art === "bahana" ? 382 : 416}
      />
    </header>
  );
}

function MapArtwork({
  expanded = false,
  close,
}: {
  expanded?: boolean;
  close?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={`camp-map journal-map${expanded ? " map-expanded" : ""}${failed ? " camp-map-fallback" : ""}`}
    >
      <img
        src={expanded ? "/journal/map.webp" : "/journal/map-small.webp"}
        alt=""
        width="1536"
        height="1024"
        onError={() => setFailed(true)}
        onLoad={() => setFailed(false)}
      />
      {failed && (
        <p className="map-fallback-note">
          {m("Choose a place to explore the camp.")}
        </p>
      )}
      <nav
        className="camp-hotspots"
        aria-label={expanded ? m("Expanded camp map") : m("Camp map")}
      >
        {campPlaces.map((place, index) => (
          <a
            key={place.route}
            className="camp-hotspot"
            style={
              { "--x": `${place.x}%`, "--y": `${place.y}%` } as CSSProperties
            }
            href={`#${place.route}`}
            onClick={close}
            aria-label={`${place.name} · ${place.task}`}
          >
            <span className="map-number" aria-hidden="true">
              {index + 1}
            </span>
            {expanded && (
              <span className="map-label">
                <strong>{place.name}</strong>
                <small>{place.task}</small>
              </span>
            )}
          </a>
        ))}
      </nav>
    </div>
  );
}
function CampAtlas() {
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  return (
    <aside className="camp-atlas" aria-labelledby="atlas-title">
      <div className="atlas-caption">
        <span className="journal-kicker">{m("FIELD MAP / 01")}</span>
        <h2 id="atlas-title">{m("Find your place")}</h2>
      </div>
      <MapArtwork />
      <div className="atlas-bottom">
        <span>{m("Six places. One shared journey.")}</span>
        <button
          ref={trigger}
          type="button"
          className="text-button"
          onClick={() => dialog.current?.showModal()}
        >
          {m("Expand map")} <span aria-hidden="true">↗</span>
        </button>
      </div>
      <dialog
        ref={dialog}
        className="atlas-dialog"
        aria-labelledby="expanded-map-title"
        onClose={() => trigger.current?.focus()}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              "button, a[href]",
            ),
          ).filter((element) => element.getClientRects().length > 0);
          const first = controls[0],
            last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="section-top">
          <h2 id="expanded-map-title">{m("The Seekers’ Camp")}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={m("Close map")}
            onClick={() => dialog.current?.close()}
          >
            <Icon name="close" />
          </button>
        </div>
        <MapArtwork expanded close={() => dialog.current?.close()} />
        <nav className="atlas-legend" aria-label={m("Map legend")}>
          {campPlaces.map((p, i) => (
            <a
              key={p.route}
              href={`#${p.route}`}
              onClick={() => dialog.current?.close()}
            >
              {i + 1}. {p.name} · {p.task}
            </a>
          ))}
        </nav>
      </dialog>
    </aside>
  );
}

function Participation() {
  const { config } = usePortal(),
    { address } = useAccount(),
    member = useApi<Member>("members/" + address, !!address);
  return (
    <section
      className="journal-participation"
      aria-labelledby="participation-title"
    >
      <AssetIcon symbol="MANA" />
      <div>
        <h2 id="participation-title">{m("Your participation")}</h2>
        {!address ? (
          <p>
            {m(
              "Connect a Polygon wallet to see your MANA balance and voting power.",
            )}
          </p>
        ) : member.data ? (
          <>
            <p className="participation-balance">
              <TokenAmount
                value={member.data.votes}
                token={config.contracts.mana?.address}
                showSymbol
              />{" "}
              <span>{m("Voting power received")}</span>
            </p>
            <p>
              {member.data.delegate === zeroAddress
                ? m(
                    "Choose a representative or delegate to yourself to activate your voting power.",
                  )
                : m("Your delegation is recorded on-chain.")}
            </p>
          </>
        ) : (
          <p>{m("Your membership data is not available yet.")}</p>
        )}
        {member.error && (
          <p role="status">
            {m("Previously retrieved membership data may be out of date.")}
          </p>
        )}
        <a href="#delegation">
          {m("Manage delegation")} <span aria-hidden="true">↗</span>
        </a>
      </div>
    </section>
  );
}

function DecisionRow({ p }: { p: Proposal }) {
  const { config } = usePortal();
  const actions = proposalActions(p),
    payments = actions.map((a) => paymentFor(a, config)).filter(Boolean);
  const approvals = actions.filter((a) => {
    try {
      return (
        decodeFunctionData({ abi: tokenAbi, data: a.data }).functionName ===
        "approve"
      );
    } catch {
      return false;
    }
  }).length;
  // Summarize repeated payments by token address, using exact integers first.
  // Individual recipients and full-precision calls remain in the proposal detail.
  const paymentTotals = new Map<string, Payment>();
  for (const payment of payments) {
    if (!payment) continue;
    const key = payment.token?.toLowerCase() ?? "native";
    const previous = paymentTotals.get(key);
    paymentTotals.set(key, {
      ...payment,
      raw: String(BigInt(previous?.raw ?? "0") + BigInt(payment.raw)),
    });
  }
  const effectParts = Array.from(paymentTotals.values()).map(
    (payment) =>
      formatTokenAmount(
        payment.raw,
        displayAsset(config, payment.token ?? null, payment.decimals),
      ).text +
      " " +
      payment.symbol,
  );
  if (approvals)
    effectParts.push(m("{count} token authorizations", { count: approvals }));
  const effect =
    p.kind === "community"
      ? m("Advisory result")
      : effectParts.length
        ? effectParts.join(" + ")
        : m("{count} on-chain actions", { count: p.targets.length });
  return (
    <a
      className="proposal-card decision-row"
      href={`#proposal/${p.contract}/${p.id}`}
    >
      <div className="decision-title">
        <span className="journal-kicker">
          {p.kind === "community"
            ? m("Community ballot")
            : m("Executable proposal")}
        </span>
        <h3>
          {p.description.split("\n")[0].replace(/^#+\s*/, "") ||
            m("Untitled proposal")}
        </h3>
        <span className="decision-author">
          {m("By {author}", { author: short(p.proposer) })}
        </span>
      </div>
      <div className="decision-state">
        <StateBadge state={p.state} />
        <span>
          {p.kind === "community"
            ? m("Publication block {block}", { block: p.blockNumber })
            : p.state === "Pending"
              ? m("Opens at block {block}", {
                  block: BigInt(p.snapshot).toLocaleString("en-US"),
                })
              : m("Voting deadline · block {block}", {
                  block: BigInt(p.deadline).toLocaleString("en-US"),
                })}
        </span>
      </div>
      <div className="decision-effect">
        <strong>{effect}</strong>
        <span>
          {payments.length
            ? m("Treasury payment")
            : approvals
              ? m("Treasury permission")
              : m("Review the decision")}
        </span>
      </div>
      <Icon name="arrow" />
    </a>
  );
}
function DecisionList({ items }: { items: Proposal[] }) {
  return (
    <div className="journal-decisions">
      <div className="decision-columns" aria-hidden="true">
        <span>{m("The decision")}</span>
        <span>{m("Status & timing")}</span>
        <span>{m("What changes")}</span>
        <span />
      </div>
      {items.map((p) => (
        <DecisionRow p={p} key={p.contract + p.id} />
      ))}
    </div>
  );
}
function JournalPagination({
  before,
  next,
  change,
}: {
  before: string;
  next?: string | null;
  change: (value: string) => void;
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

export function JournalCamp() {
  const proposals = useApi<ProposalList>("proposals?kind=executable"),
    ballots = useApi<ProposalList>("ballots"),
    treasury = useApi<TreasuryResponse>("treasury");
  const totals = useApi<{
    activeVotes: number;
    readyForExecution: number | null;
    complete: boolean;
    countsVerified?: boolean;
  }>("overview");
  const verified =
      !totals.error && (totals.data?.complete || totals.data?.countsVerified),
    limited = totals.data?.countsVerified && !totals.data.complete;
  const items = [
    ...(proposals.data?.items ?? []).filter((p) => p.kind !== "legacy"),
    ...(ballots.data?.items ?? []),
  ]
    .sort((a, b) =>
      BigInt(a.blockNumber) > BigInt(b.blockNumber)
        ? -1
        : BigInt(a.blockNumber) < BigInt(b.blockNumber)
          ? 1
          : 0,
    )
    .slice(0, 4);
  const vault =
    !treasury.error && !treasury.data?.unavailable
      ? treasury.data?.accounts.find((a) => a.role === "treasury")
      : undefined;
  return (
    <>
      <section className="camp-spread" aria-labelledby="camp-title">
        <div className="camp-cover">
          <div className="camp-cover-intro">
            <div className="camp-cover-copy">
              <p className="journal-kicker">
                {m("MYTHICAL DAO / A BAND OF SEEKERS")}
              </p>
              <h1 id="camp-title">{m("The Seekers’ Camp")}</h1>
              <p className="journal-deck">
                {m(
                  "Gather around an idea. Decide together what comes next for Mythical Beings.",
                )}
              </p>
              <div className="button-row">
                <a className="button primary" href="#governance">
                  {m("Explore proposals")} <Icon name="arrow" />
                </a>
                <a className="camp-guide" href="#guide">
                  {m("Camp guide")} ↗
                </a>
              </div>
            </div>
            <picture className="garuda-art">
              <source
                media="(max-width: 767px)"
                srcSet="/journal/garuda-small.webp"
              />
              <img
                src="/journal/garuda.webp"
                width="720"
                height="705"
                alt=""
                fetchPriority="high"
              />
            </picture>
          </div>
          <Participation />
        </div>
        <CampAtlas />
      </section>
      <section
        className="metric-grid journal-summary"
        aria-label={m("Governance summary")}
      >
        <div className="journal-stat">
          <span>{m("Open votes")}</span>
          <strong>{verified ? totals.data!.activeVotes : "—"}</strong>
          <p>
            {limited && verified
              ? m("Among verified indexed proposals")
              : m("On-chain executable proposals")}
          </p>
        </div>
        <div className="journal-stat">
          <span>{m("Awaiting execution")}</span>
          <strong>
            {verified ? (totals.data!.readyForExecution ?? "—") : "—"}
          </strong>
          <p>
            {limited && verified
              ? m("Among verified indexed proposals")
              : m("Approved actions ready for direct execution")}
          </p>
        </div>
        <div className="journal-resources">
          <div className="section-top">
            <span>{m("DAO treasury assets")}</span>
            <a href="#treasury">{m("View treasury")} ↗</a>
          </div>
          {vault ? (
            <div className="journal-asset-strip">
              {vault.assets
                .filter((a) => a.ragequit)
                .map((a) => (
                  <span key={a.address ?? a.symbol}>
                    <AssetIcon symbol={a.symbol} />
                    <TokenAmount
                      value={a.balance}
                      token={a.address ?? null}
                      decimals={a.decimals}
                      showSymbol
                    />
                  </span>
                ))}
            </div>
          ) : (
            <p>{m("Verified balances appear when available")}</p>
          )}
        </div>
      </section>
      <section className="journal-section">
        <div className="journal-section-title">
          <div>
            <p className="journal-kicker">{m("FROM THE COUNCIL")}</p>
            <h2>{m("Recent decisions")}</h2>
          </div>
          <a href="#governance">{m("View all")} ↗</a>
        </div>
        <DataState
          loading={proposals.isPending || ballots.isPending}
          error={proposals.error || ballots.error}
          unavailable={proposals.data?.unavailable || ballots.data?.unavailable}
          empty={!items.length}
          emptyTitle={m("No decisions in this confirmed view.")}
          retry={() => {
            void proposals.refetch();
            void ballots.refetch();
          }}
        >
          <DecisionList items={items} />
        </DataState>
      </section>
      <section className="camp-paths">
        <div className="journal-section-title">
          <div>
            <p className="journal-kicker">{m("AROUND THE CAMP")}</p>
            <h2>{m("Make yourself at home")}</h2>
          </div>
          <span className="journal-small">
            {m("Choose where your next step leads.")}
          </span>
        </div>
        <nav
          className="journal-destinations"
          aria-label={m("Camp destinations")}
        >
          {campPlaces.map((p, i) => (
            <a key={p.route} href={`#${p.route}`}>
              <JournalIcon name={p.route} />
              <div>
                <span className="journal-destination-number">0{i + 1}</span>
                <h3>
                  {p.name}
                  <small>{p.task}</small>
                </h3>
                <p>{p.description}</p>
              </div>
              <Icon name="arrow" />
            </a>
          ))}
        </nav>
      </section>
      <div className="journal-colophon">
        <span>{m("A shared world. A shared voice.")}</span>
        <a href="#guide">{m("How governance works")} ↗</a>
      </div>
    </>
  );
}

export function JournalGovernance() {
  const { config } = usePortal();
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
      <ChapterHeading
        chapter={m("01 / THE COUNCIL")}
        title={m("Governance")}
        description={m(
          "Every voice helps shape the journey. Bring an idea, weigh a decision, cast your vote.",
        )}
        art="bahana"
      >
        <div className="button-row">
          <a className="button primary" href="#create">
            <Icon name="plus" />
            {t("create")}
          </a>
          <a href="#guide">{m("How decisions work")} ↗</a>
        </div>
      </ChapterHeading>
      <div className="council-layout">
        <section
          className="council-decisions"
          aria-label={m("Council decisions")}
        >
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
              <span className="sr-only">
                {m("Search proposals on this page")}
              </span>
              <input
                type="search"
                placeholder={m("Search this page…")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <p className="journal-small search-scope">
            {m("Search covers the proposals on this page only.")}
          </p>
          {tab === "community" && <Notice>{t("advisoryNotice")}</Notice>}
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
            <DecisionList items={items} />
          </DataState>
          <JournalPagination
            before={before}
            next={query.data?.nextBefore}
            change={setBefore}
          />
          {tab === "executable" && <RecoverProposal />}
        </section>
        <aside className="council-margin">
          <section className="journal-note">
            <span className="journal-kicker">
              {m("THE CONVERSATION CONTINUES")}
            </span>
            <h2>{m("Advisory votes on Snapshot")}</h2>
            <p>
              {m(
                "Explore the ideas and preferences of the community before an on-chain decision.",
              )}
            </p>
            <a
              className="button"
              href={config.snapshotUrl}
              target="_blank"
              rel="noreferrer"
            >
              {m("Open Snapshot ↗")}
            </a>
            <a href="#history">{m("Snapshot archive")} ↗</a>
          </section>
          <div className="margin-note">
            <Icon name="info" />
            <p>
              {tab === "community" ? t("advisoryNotice") : t("fundingNotice")}
            </p>
          </div>
          <img
            className="margin-fronds"
            src="/journal/golden-fronds.webp"
            width="720"
            height="416"
            alt=""
            loading="lazy"
          />
        </aside>
      </div>
    </>
  );
}

export function JournalTreasury() {
  const { config } = usePortal(),
    query = useApi<TreasuryResponse>("treasury"),
    events = useApi<EventList>("events"),
    proposals = useApi<ProposalList>("proposals?kind=executable");
  const account = query.data?.accounts.find((a) => a.role === "treasury"),
    address = config.contracts.treasury?.address;
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
      [
        "RagequitExecuted",
        "Approval",
        "Redeemed",
        "Payment",
        "NativeDeposit",
        "Transfer",
      ].includes(e.event_name) &&
      e.contract.toLowerCase() !== config.contracts.mana?.address.toLowerCase(),
  );
  return (
    <>
      <ChapterHeading
        chapter={m("02 / OUR SHARED RESOURCES")}
        title={m("Treasury")}
        description={m(
          "The resources we hold together. Follow the funds and the decisions that put them to work.",
        )}
        art="golden-fronds"
      >
        <div className="treasury-heading-assets" aria-hidden="true">
          <AssetIcon symbol="GEM" />
          <AssetIcon symbol="WETH" />
          <AssetIcon symbol="USDC" />
        </div>
      </ChapterHeading>
      <section className="treasury-panel journal-ledger">
        <div className="journal-section-title">
          <div>
            <p className="journal-kicker">{m("THE LEDGER")}</p>
            <h2>{m("DAO treasury")}</h2>
          </div>
          {address && <AddressLink address={address} />}
        </div>
        <DataState
          loading={query.isPending}
          error={query.error}
          unavailable={query.data?.unavailable || !account}
          empty={false}
          independent
          retry={() => void query.refetch()}
        >
          <div className="ledger-columns" aria-hidden="true">
            <span>{m("Asset & eligibility")}</span>
            <span>{m("Treasury balance")}</span>
            <span>{m("Treasury allowance")}</span>
          </div>
          <div className="ledger-assets">
            {account?.assets.map((asset) => (
              <article
                className={`ledger-asset${asset.ragequit ? "" : " asset-excluded"}`}
                key={asset.address ?? asset.symbol}
              >
                <div className="ledger-identity">
                  <AssetIcon symbol={asset.symbol} />
                  <div>
                    <h3>{asset.symbol}</h3>
                    <span
                      className={
                        asset.ragequit ? "asset-eligibility" : "journal-small"
                      }
                    >
                      {asset.ragequit
                        ? m("Included in ragequit")
                        : m("Excluded from ragequit")}
                    </span>
                    {asset.address ? (
                      <AddressLink address={asset.address} />
                    ) : (
                      <span className="journal-small">
                        {m("Native Polygon asset")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ledger-balance">
                  <span className="ledger-mobile-label">
                    {m("Treasury balance")}
                  </span>
                  <TokenAmount
                    value={asset.balance}
                    token={asset.address ?? null}
                    decimals={asset.decimals}
                  />
                </div>
                <div className="ledger-allowance">
                  <span className="ledger-mobile-label">
                    {m("Treasury allowance")}
                  </span>
                  {asset.ragequit ? (
                    <TokenAmount
                      value={asset.allowance}
                      token={asset.address ?? null}
                      decimals={asset.decimals}
                      allowance
                    />
                  ) : (
                    <span>{m("Not part of the exit basket")}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
          {query.data && !query.data.unavailable && (
            <p className="ledger-verification">
              <Icon name="check" />
              {m("Balances verified at block {block}", {
                block: query.data.asOfBlock,
              })}
            </p>
          )}
        </DataState>
      </section>
      <aside className="treasury-exit-note">
        <JournalIcon name="treasury" />
        <div>
          <h2>{m("Shared funds, governed together")}</h2>
          <p>{t("fundingNotice")}</p>
          <p>
            {m(
              "POL, WPOL, USDC.e, MANA and NFTs are excluded from ragequit. No assets are automatically converted.",
            )}
          </p>
        </div>
        <a href="#ragequit">{m("Review Exit DAO")} ↗</a>
      </aside>
      <div className="treasury-journal">
        <section>
          <div className="journal-section-title">
            <div>
              <p className="journal-kicker">{m("DECISIONS INTO ACTION")}</p>
              <h2>{m("Identified pending payments")}</h2>
            </div>
          </div>
          <p className="journal-small">
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
              <article className="journal-payment" key={p.contract + p.id}>
                <div className="section-top">
                  <h3>
                    <a href={`#proposal/${p.contract}/${p.id}`}>
                      {p.description.split("\n")[0].replace(/^#+\s*/, "") ||
                        m("Untitled proposal")}
                    </a>
                  </h3>
                  <StateBadge state={p.state} />
                </div>
                {payments.map((payment, i) => (
                  <p key={i}>
                    <TokenAmount
                      value={payment!.raw}
                      token={payment!.token ?? null}
                      decimals={payment!.decimals}
                      showSymbol
                    />
                    <span aria-hidden="true"> → </span>
                    <AddressLink
                      address={payment!.recipient as `0x${string}`}
                    />
                  </p>
                ))}
              </article>
            ))}
          </DataState>
        </section>
        <section>
          <div className="journal-section-title">
            <div>
              <p className="journal-kicker">{m("ON THE RECORD")}</p>
              <h2>{m("Recent treasury activity")}</h2>
            </div>
            <a href="#history">{m("History")} ↗</a>
          </div>
          <DataState
            loading={events.isPending}
            error={events.error}
            unavailable={events.data?.unavailable}
            empty={!movements.length}
          >
            {movements.map((e) => (
              <div className="journal-activity" key={e.tx_hash + e.log_index}>
                <Icon name="arrow" />
                <div>
                  <strong>{e.event_name}</strong>
                  <p className="journal-small">
                    {m("Block {block} · confirmed", { block: e.block_number })}
                  </p>
                </div>
                <a
                  href={`https://polygonscan.com/tx/${e.tx_hash}`}
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
    </>
  );
}
