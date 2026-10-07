import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePortal, AssetIcon } from "./ui";
import { AddressLink } from "./components";
import {
  buildManaTrade,
  discordEmbed,
  parseIntegrations,
  type TradeAsset,
  type TradeSide,
} from "../shared/integrations";
import "./community.css";

function ServiceIcon({ service }: { service: "telegram" | "discord" }) {
  return (
    <span className={`community-icon ${service}`}>
      <img src={`/community/${service}.svg`} width="28" height="28" alt="" />
    </span>
  );
}
function ExternalLink({
  href,
  children,
  className = "text-button",
  onClick,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
    >
      {children} <span aria-hidden="true">↗</span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
function CommunityDialog({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const origin = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      if (origin?.isConnected) origin.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`community-dialog${wide ? " community-chat" : ""}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClose={close}
    >
      <header className="community-dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="button small"
          onClick={close}
          autoFocus
        >
          Close<span className="sr-only"> {title}</span>
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function TelegramAccess({ compact = false }: { compact?: boolean }) {
  const { config } = usePortal(),
    telegram = parseIntegrations(config.integrations).telegram;
  const webOnly = telegram?.channelUrl.startsWith("https://web.telegram.org/");
  return (
    <div className={compact ? "community-shortcut" : "community-service"}>
      {compact ? null : (
        <>
          <ServiceIcon service="telegram" />
          <p className="journal-kicker">Telegram</p>
          <h3>Governance alerts</h3>
          <p>
            Follow Governor and Snapshot decisions as the camp moves forward.
          </p>
        </>
      )}
      {telegram ? (
        <ExternalLink
          href={telegram.channelUrl}
          className={compact ? "text-button" : "button"}
        >
          {webOnly ? "Open governance alerts" : "Get governance alerts"}
        </ExternalLink>
      ) : (
        <span className="community-pending">
          Telegram · official channel link pending
        </span>
      )}
      {!compact && (
        <p className="field-help">
          {!telegram
            ? "Public alerts are being prepared. The channel join link will appear here when available."
            : webOnly
              ? "Public access is being prepared. This link opens Telegram Web for existing channel members; new members still need a join link."
              : "Open to everyone — no MANA or wallet connection required. Open the channel in Telegram, select Join, then enable notifications."}{" "}
          Alerts are checked every 15 minutes; delivery is not instant.
        </p>
      )}
    </div>
  );
}
export function DiscordAccess({ compact = false }: { compact?: boolean }) {
  const { config } = usePortal(),
    discord = parseIntegrations(config.integrations).discord;
  const [open, setOpen] = useState(false),
    [loaded, setLoaded] = useState(false),
    [delayed, setDelayed] = useState(false);
  const embed = discord && discordEmbed(discord);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setDelayed(true), 12000);
    return () => clearTimeout(timer);
  }, [open]);
  return (
    <div className={compact ? "community-shortcut" : "community-service"}>
      {!compact && (
        <>
          <ServiceIcon service="discord" />
          <p className="journal-kicker">Discord</p>
          <h3>Campfire</h3>
          <p>
            Discuss an idea, ask a question, or continue a Council conversation.
          </p>
        </>
      )}
      {discord && embed ? (
        <>
          <button
            type="button"
            className={compact ? "text-button" : "button"}
            onClick={() => {
              setLoaded(false);
              setDelayed(false);
              setOpen(true);
            }}
          >
            Open DAO chat
          </button>
          {!compact && (
            <p>
              <ExternalLink href={discord.channelUrl}>
                Open in Discord
              </ExternalLink>
            </p>
          )}
          {open && (
            <CommunityDialog
              title="Campfire"
              wide
              close={() => setOpen(false)}
            >
              <p className="muted">
                Discord chat is provided by WidgetBot. Discord sign-in and
                existing channel permissions apply.
              </p>
              <p role="status" className="field-help">
                {!loaded && !delayed
                  ? "Loading Discord chat…"
                  : "If chat is blocked, unavailable or asks you to sign in, open the channel directly in Discord."}
              </p>
              <iframe
                title="Discord · Campfire chat"
                src={embed}
                referrerPolicy="no-referrer"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                onLoad={() => setLoaded(true)}
                onError={() => setDelayed(true)}
              />
              <footer>
                <ExternalLink href={discord.channelUrl} className="button">
                  Open in Discord
                </ExternalLink>
              </footer>
            </CommunityDialog>
          )}
        </>
      ) : (
        <span className="community-pending">
          Discord · official channel link pending
        </span>
      )}
      {!compact && (
        <p className="field-help">
          Opening the chat loads external Discord/WidgetBot content. It stays
          unloaded until you choose to open it.
        </p>
      )}
    </div>
  );
}
function TradeForm({ onContinue }: { onContinue: () => void }) {
  const { config } = usePortal();
  const [side, setSide] = useState<TradeSide>("buy"),
    [asset, setAsset] = useState<TradeAsset>("usdcNative"),
    [amount, setAmount] = useState("");
  const inputId = useId(),
    errorId = useId(),
    helpId = useId();
  const quoteSymbol = asset === "usdcNative" ? "USDC" : "WETH",
    sendSymbol = side === "buy" ? quoteSymbol : "MANA";
  const result = buildManaTrade(config, side, asset, amount);
  return (
    <div className="trade-mana-form">
      <p className="journal-kicker">Polygon · personal wallet</p>
      <div className="segmented" role="group" aria-label="Trade direction">
        <button
          type="button"
          className={side === "buy" ? "selected" : ""}
          aria-pressed={side === "buy"}
          onClick={() => {
            setSide("buy");
            setAmount("");
          }}
        >
          Buy MANA
        </button>
        <button
          type="button"
          className={side === "sell" ? "selected" : ""}
          aria-pressed={side === "sell"}
          onClick={() => {
            setSide("sell");
            setAmount("");
          }}
        >
          Sell MANA
        </button>
      </div>
      <label>
        {side === "buy" ? "Pay with" : "Receive"}
        <select
          value={asset}
          onChange={(e) => {
            setAsset(e.target.value as TradeAsset);
            setAmount("");
          }}
        >
          <option value="usdcNative">USDC · native Polygon</option>
          <option value="weth">WETH</option>
        </select>
      </label>
      <div className="trade-route">
        <span>
          <AssetIcon symbol={sendSymbol} />
          You send <strong>{sendSymbol}</strong>
        </span>
        <span aria-hidden="true">→</span>
        <span>
          <AssetIcon symbol={side === "buy" ? "MANA" : quoteSymbol} />
          You receive <strong>{side === "buy" ? "MANA" : quoteSymbol}</strong>
        </span>
      </div>
      <label htmlFor={inputId}>
        Amount to send in {sendSymbol} <span className="muted">(optional)</span>
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        maxLength={100}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Enter amount"
        aria-invalid={!!result.error}
        aria-describedby={`${helpId}${result.error ? ` ${errorId}` : ""}`}
      />
      <p id={helpId} className="field-help">
        Leave blank to choose on Uniswap. Amounts are passed exactly as entered;
        no quote is calculated here.
      </p>
      {result.error && (
        <p id={errorId} role="alert" className="error">
          {result.error}
        </p>
      )}
      <p className="trade-token-id">
        Mythical DAO MANA{" "}
        {config.contracts.mana && (
          <AddressLink address={config.contracts.mana.address} />
        )}
      </p>
      <p>
        Uniswap will show the current quote, liquidity, slippage and any
        required approvals before you sign.
      </p>
      {result.url ? (
        <ExternalLink
          className="button primary full"
          href={result.url}
          onClick={onContinue}
        >
          Continue on Uniswap
        </ExternalLink>
      ) : (
        <button className="button primary full" disabled>
          Continue on Uniswap ↗
        </button>
      )}
      <p className="field-help">
        Buying MANA does not change votes in proposals already open. Delegate
        your MANA to activate voting power for future proposal snapshots.
      </p>
    </div>
  );
}
export function TradeManaAccess({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false),
    queries = useQueryClient(),
    returning = useRef(false);
  useEffect(() => {
    const refresh = () => {
      if (!returning.current || document.visibilityState !== "visible") return;
      returning.current = false;
      void queries.invalidateQueries({
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          (q.queryKey[0].startsWith("members/") ||
            q.queryKey[0].startsWith("vote-status/")),
      });
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [queries]);
  return (
    <div
      className={
        compact ? "community-shortcut" : "community-service community-market"
      }
    >
      {!compact && (
        <>
          <span className="community-icon">
            <AssetIcon symbol="MANA" />
          </span>
          <p className="journal-kicker">MANA</p>
          <h3>Buy &amp; sell</h3>
          <p>
            Prepare a Polygon swap, then continue on Uniswap to review and sign.
          </p>
        </>
      )}
      <button
        type="button"
        className={compact ? "button" : "button primary"}
        onClick={() => setOpen(true)}
      >
        Buy / Sell MANA
      </button>
      {!compact && (
        <p className="field-help">
          Use native USDC or WETH. No wallet connection is needed to prepare a
          link.
        </p>
      )}
      {open && (
        <CommunityDialog title="Trade MANA" close={() => setOpen(false)}>
          <TradeForm
            onContinue={() => {
              returning.current = true;
            }}
          />
        </CommunityDialog>
      )}
    </div>
  );
}
export function CommunityShortcuts() {
  return (
    <div className="community-shortcuts" aria-label="DAO community">
      <TelegramAccess compact />
      <DiscordAccess compact />
    </div>
  );
}
export function StayConnected() {
  return (
    <section
      className="journal-section stay-connected"
      aria-labelledby="stay-connected-title"
    >
      <div className="journal-section-title">
        <div>
          <p className="journal-kicker">Around the campfire</p>
          <h2 id="stay-connected-title">Stay connected</h2>
        </div>
        <p className="muted">Follow the decisions. Join the conversation.</p>
      </div>
      <div className="community-columns">
        <TelegramAccess />
        <DiscordAccess />
        <TradeManaAccess />
      </div>
    </section>
  );
}
