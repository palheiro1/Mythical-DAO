import { TokenAmount } from "./TokenAmount";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import {
  encodeFunctionData,
  isAddress,
  parseUnits,
  zeroAddress,
  type Address,
} from "viem";
import { tokenAbi, ragequitAbi } from "../shared/abis";
import type { PortalConfig } from "../shared/domain";
import { basketAssets } from "../shared/assets";
import { validRagequitRecipient } from "../shared/ragequit-security";
import type { RedeemPreview, Member, ListResponse } from "./data-types";
import { api, useApi } from "./api";
import { amount, AddressLink } from "./components";
import { useTransaction } from "./Transaction";
import { t, m } from "./i18n";
import {
  PageHeading,
  AssetIcon,
  Notice,
  DataState,
  ActionAvailability,
  DateStamp,
} from "./ui";
import { percentToBps, previewLifetime, assertCurrentExit } from "./exit-model";
export function Delegation({
  config,
  canSign,
}: {
  config: PortalConfig;
  canSign: boolean;
}) {
  const { address } = useAccount(),
    memberQuery = useApi<Member>("members/" + address, !!address),
    member = memberQuery.data;
  const delegates =
    useApi<ListResponse<{ address: Address; votes: string }>>("delegates");
  const [delegate, setDelegate] = useState(""),
    [message, setMessage] = useState(""),
    tx = useTransaction();
  async function review(to: string) {
    if (!isAddress(to) || to === zeroAddress) {
      setMessage(m("Enter a valid representative address."));
      return;
    }
    const mana = config.contracts.mana?.address;
    if (!mana) return;
    await tx.review({
      title:
        to.toLowerCase() === address?.toLowerCase()
          ? m("Vote in your own name")
          : m("Delegate voting power"),
      to: mana,
      data: encodeFunctionData({
        abi: tokenAbi,
        functionName: "delegate",
        args: [to],
      }),
      effect: m(
        "Delegation changes future voting power. Your MANA stays in your wallet. Representatives cannot spend or redeem your tokens. Existing snapshots remain unchanged.",
      ),
      details: [
        { label: m("Representative"), value: to },
        {
          label: m("MANA balance"),
          value: member ? amount(member.balance) : m("Unavailable"),
        },
      ],
    });
  }
  return (
    <>
      <PageHeading
        title={m("Delegation")}
        description={m(
          "Activate your voting power or choose someone to represent you.",
        )}
      />
      <div className="metric-grid">
        <div className="metric">
          <span>
            <AssetIcon symbol="MANA" />
            {m("Your MANA balance")}
          </span>
          <strong>
            <TokenAmount
              value={member?.balance}
              token={config.contracts.mana?.address}
            />
          </strong>
          <p>{m("Tokens held in your wallet")}</p>
        </div>
        <div className="metric">
          <span>{m("Voting power received")}</span>
          <strong>
            <TokenAmount
              value={member?.votes}
              token={config.contracts.mana?.address}
            />
          </strong>
          <p>{m("Delegated power for future snapshots")}</p>
        </div>
        <div className="metric">
          <span>{m("Chosen representative")}</span>
          <strong className="small-value">
            {member && member.delegate !== zeroAddress ? (
              <AddressLink address={member.delegate} />
            ) : member ? (
              m("Not delegated")
            ) : address && memberQuery.isPending ? (
              m("Loading verified data…")
            ) : address ? (
              m("Data unavailable")
            ) : (
              m("Wallet disconnected")
            )}
          </strong>
          <p>{m("Delegation does not transfer MANA")}</p>
        </div>
      </div>
      {member?.asOfBlock && !memberQuery.error && (
        <p className="muted">
          {m("Membership verified at block {block}", {
            block: member.asOfBlock,
          })}
        </p>
      )}
      {memberQuery.error && (
        <Notice tone="warning">
          {m(
            "Your latest membership data could not be verified. Previously retrieved values may be out of date.",
          )}
          <button
            className="button small"
            disabled={memberQuery.isFetching}
            onClick={() => void memberQuery.refetch()}
          >
            {m("Retry membership data")}
          </button>
        </Notice>
      )}
      <div className="split-layout">
        <section className="panel">
          <h2>{m("Choose your representative")}</h2>
          <p>
            {m(
              "Delegates can vote with your delegated power. They cannot spend or redeem your tokens.",
            )}
          </p>
          <button
            className="button primary full"
            disabled={!canSign || tx.busy || !address}
            onClick={() => void review(address!)}
          >
            {m("Delegate to myself")}
          </button>
          <p className="field-help">
            {m("Choose yourself to vote directly with your MANA.")}
          </p>
          <label>
            {m("Representative address")}
            <input
              value={delegate}
              onChange={(e) => {
                setDelegate(e.target.value);
                setMessage("");
              }}
              placeholder="0x…"
            />
          </label>
          <button
            className="button full"
            disabled={!canSign || tx.busy}
            onClick={() => void review(delegate)}
          >
            {m("Review delegation")}
          </button>
          <ActionAvailability />
          {message && (
            <p role="alert" className="error">
              {message}
            </p>
          )}
        </section>
        <section className="panel">
          <h2>{m("Delegates")}</h2>
          <p className="muted">
            {m(
              "Voting power is read from the contract. The list covers up to {count} indexed addresses.",
              { count: delegates.data?.limitedTo ?? 100 },
            )}
          </p>
          <DataState
            loading={delegates.isPending}
            error={delegates.error}
            unavailable={delegates.data?.unavailable}
            empty={!delegates.data?.items.length}
            retry={() => void delegates.refetch()}
          >
            {delegates.data?.items.map((d) => (
              <div className="table-row" key={d.address}>
                <AddressLink address={d.address} />
                <TokenAmount
                  value={d.votes}
                  token={config.contracts.mana?.address}
                  showSymbol
                />
                <button
                  aria-label={m("Choose {address}", { address: d.address })}
                  onClick={() => setDelegate(d.address)}
                >
                  {m("Choose")}
                </button>
              </div>
            ))}
          </DataState>
        </section>
      </div>
    </>
  );
}
interface Quote extends RedeemPreview {
  amount: string;
  block: string;
  time: number;
  owner: string;
  chain: number;
}
export function Ragequit({
  config,
  canSign,
}: {
  config: PortalConfig;
  canSign: boolean;
}) {
  const { address, chainId } = useAccount(),
    memberQuery = useApi<Member>("members/" + address, !!address),
    member = memberQuery.data,
    tx = useTransaction();
  const [input, setInput] = useState(""),
    [recipient, setRecipient] = useState(""),
    [customRecipient, setCustomRecipient] = useState(false),
    [tolerance, setTolerance] = useState("0.5"),
    [error, setError] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null),
    [quoting, setQuoting] = useState(false),
    [ackFor, setAckFor] = useState<string | null>(null),
    [now, setNow] = useState(Date.now());
  const current = useRef(""),
    requestId = useRef(0),
    module = config.contracts.ragequitModule?.address,
    mana = config.contracts.mana?.address,
    to = customRecipient ? recipient : (address ?? "");
  let units = 0n;
  try {
    if (/^\d+(\.\d{1,18})?$/.test(input)) units = parseUnits(input, 18);
  } catch {
    /* Invalid inputs remain disabled. */
  }
  const bps = percentToBps(tolerance),
    validQuote =
      !!quote &&
      quote.amount === units.toString() &&
      quote.owner === address &&
      quote.chain === chainId &&
      quote.module?.toLowerCase() === module?.toLowerCase() &&
      quote.basket.every(
        (a, i) =>
          a.address?.toLowerCase() ===
          basketAssets(config)[i].address?.toLowerCase(),
      ) &&
      now < quote.time + previewLifetime;
  const fingerprint = [
    units,
    to.toLowerCase(),
    bps,
    address,
    chainId,
    quote?.time,
    module,
    JSON.stringify(basketAssets(config)),
    JSON.stringify(quote?.basket),
    JSON.stringify(quote?.amounts),
  ].join(":");
  current.current = fingerprint;
  const ack = ackFor === fingerprint && validQuote;
  const allowance = BigInt(member?.allowance ?? "0"),
    minimums =
      quote && bps !== null
        ? quote.amounts.map((a) =>
            ((BigInt(a) * BigInt(10000 - bps)) / 10000n).toString(),
          )
        : [];
  const validRecipient = validRagequitRecipient(to, config);
  useEffect(() => {
    if (!quote) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [quote]);
  function resetAmount(value: string) {
    requestId.current++;
    setInput(value);
    setQuote(null);
    setAckFor(null);
    setError("");
  }
  async function preview() {
    const id = ++requestId.current;
    setError("");
    setQuote(null);
    setAckFor(null);
    setQuoting(true);
    try {
      if (!canSign || !address || !chainId)
        throw Error(
          m("Connect to the correct network and wait for verified data."),
        );
      if (units <= 0n || units > BigInt(member?.balance ?? 0))
        throw Error(m("Choose a positive amount within your MANA balance."));
      const q = await api<RedeemPreview>("redeem-preview?amount=" + units);
      if (q.amounts.length !== 3 || q.amounts.every((a) => BigInt(a) === 0n))
        throw Error(m("This amount produces no payout."));
      if (id !== requestId.current) return;
      const time = Date.now();
      setNow(time);
      setQuote({
        ...q,
        amount: units.toString(),
        time,
        owner: address,
        chain: chainId,
      });
    } catch (e) {
      if (id === requestId.current) setError((e as Error).message);
    } finally {
      setQuoting(false);
    }
  }
  async function approve() {
    if (!module || !mana || !validQuote || !quote?.available) return;
    const expected = fingerprint,
      validUntil = quote.time + previewLifetime;
    await tx.review({
      title: m("Authorize the exact MANA amount"),
      to: mana,
      data: encodeFunctionData({
        abi: tokenAbi,
        functionName: "approve",
        args: [module, units],
      }),
      effect: m(
        "Authorize only the MANA you selected. This approval does not burn tokens or perform your exit.",
      ),
      details: [
        { label: m("Allowance"), value: amount(units) + " MANA" },
        { label: m("Spender"), value: module },
      ],
      validUntil,
      assertCurrent: () =>
        assertCurrentExit(expected, current.current, validUntil),
    });
  }
  async function redeem() {
    try {
      if (!validRecipient)
        throw Error(
          m(
            "Choose a recipient other than zero, the treasury, module or token contracts.",
          ),
        );
      if (!module || !validQuote || bps === null || !ack || !quote?.available)
        throw Error(
          m("Refresh the preview and acknowledge the permanent burn."),
        );
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900),
        expected = fingerprint,
        validUntil = quote.time + previewLifetime;
      await tx.review({
        title: m("Review MANA burn and assets to receive"),
        to: module,
        data: encodeFunctionData({
          abi: ragequitAbi,
          functionName: "redeem",
          args: [
            units,
            to as Address,
            minimums.map(BigInt) as [bigint, bigint, bigint],
            deadline,
          ],
        }),
        effect:
          t("exitNotice") +
          " " +
          m(
            "If any payout fails, the entire transaction reverts, including the burn.",
          ),
        details: [
          { label: m("Permanent burn"), value: amount(units) + " MANA" },
          { label: m("Recipient"), value: to },
          ...quote.amounts.map((v, i) => ({
            label: m("Expected {asset}", {
              asset: ["GEM", "WETH", "USDC"][i],
            }),
            value: amount(v, i === 2 ? 6 : 18),
          })),
          ...minimums.map((v, i) => ({
            label: m("Minimum {asset}", {
              asset: ["GEM", "WETH", "USDC"][i],
            }),
            value: amount(v, i === 2 ? 6 : 18),
          })),
          {
            label: m("Preview valid until"),
            value: new Date(validUntil).toISOString(),
          },
          { label: m("Module"), value: module },
          {
            label: m("Transaction expiry (UTC)"),
            value: new Date(Number(deadline) * 1000).toISOString(),
          },
        ],
        validUntil,
        assertCurrent: () =>
          assertCurrentExit(expected, current.current, validUntil),
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <PageHeading
        title={m("Exit DAO")}
        eyebrow={m("DAO treasury · optional exit")}
        description={m(
          "Burn MANA for a proportional share of GEM, WETH and native USDC, paid directly from the DAO treasury.",
        )}
      />
      <div className="exit-steps">
        <strong>{m("1. Choose an amount")}</strong>
        <span>{m("2. Preview assets")}</span>
        <span>{m("3. Authorize and review")}</span>
      </div>
      <div className="split-layout">
        <section className="panel">
          <h2>{m("Amount and recipient")}</h2>
          <p>{t("exitNotice")}</p>
          <label htmlFor="burn-amount">{m("MANA to burn")}</label>
          <div className="input-suffix">
            <input
              id="burn-amount"
              inputMode="decimal"
              value={input}
              onChange={(e) => resetAmount(e.target.value)}
              placeholder="0.00"
            />
            <button
              disabled={!member}
              onClick={() => resetAmount(amount(member!.balance))}
            >
              {m("Max")}
            </button>
          </div>
          <p className="field-help">
            {member ? (
              <>
                {m("Available")}:{" "}
                <TokenAmount
                  value={member.balance}
                  token={config.contracts.mana?.address}
                  showSymbol
                />
              </>
            ) : (
              m("Connect your wallet to check your available MANA.")
            )}
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={customRecipient}
              onChange={(e) => {
                setCustomRecipient(e.target.checked);
                setAckFor(null);
              }}
            />
            <span>{m("Send assets to another address")}</span>
          </label>
          {customRecipient ? (
            <label>
              {m("Payout recipient")}
              <input
                value={recipient}
                onChange={(e) => {
                  setRecipient(e.target.value);
                  setAckFor(null);
                }}
                placeholder="0x…"
              />
            </label>
          ) : (
            <p className="muted">
              {m("Recipient")}:{" "}
              {address ? (
                <AddressLink address={address} />
              ) : (
                m("Your connected wallet")
              )}
            </p>
          )}
          <label>
            {m("Maximum decrease from preview (%)")}
            <input
              inputMode="decimal"
              aria-label={m("Maximum decrease from preview (%)")}
              value={tolerance}
              onChange={(e) => {
                setTolerance(e.target.value);
                setAckFor(null);
              }}
              aria-invalid={bps === null}
            />
            <span className="field-help">
              {m(
                "Default 0.5%. Choose 0–5%, with up to two decimal places. Each asset has its own minimum.",
              )}
            </span>
          </label>
          <button
            className="button primary full"
            disabled={!canSign || quoting || bps === null}
            onClick={() => void preview()}
          >
            {quoting ? m("Reading current treasury…") : m("Preview my exit")}
          </button>
          <ActionAvailability
            extra={
              !module
                ? m("The ragequit module has not been deployed and configured.")
                : null
            }
          />
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>
        <section className="panel">
          <h2>{m("Assets to receive")}</h2>
          <p className="muted">
            {m(
              "Expected amounts are a preview. Only the minimums are protected by the transaction.",
            )}
          </p>
          {["GEM", "WETH", "USDC"].map((symbol, i) => (
            <div className="asset-row" key={symbol}>
              <AssetIcon symbol={symbol} />
              <div>
                {symbol}
                {quote?.basket[i] && (
                  <p className="muted">
                    {m("Treasury balance")}:{" "}
                    <TokenAmount
                      value={quote.basket[i].balance}
                      token={quote.basket[i].address}
                    />{" "}
                    · {m("Treasury allowance")}:{" "}
                    <TokenAmount
                      value={quote.basket[i].allowance}
                      token={quote.basket[i].address}
                      allowance
                    />
                  </p>
                )}
                <p className="muted">
                  {m("Minimum")}:{" "}
                  <TokenAmount
                    value={minimums[i]}
                    token={basketAssets(config)[i].address}
                  />
                </p>
              </div>
              <strong>
                <TokenAmount
                  value={quote?.amounts[i]}
                  token={basketAssets(config)[i].address}
                />
              </strong>
            </div>
          ))}
          {quote && (
            <>
              <p className="field-help">
                {m("Preview block {block} · total supply", {
                  block: quote.block,
                })}{" "}
                <TokenAmount
                  value={quote.supply}
                  token={config.contracts.mana?.address}
                  showSymbol
                />
              </p>
              <p
                className={validQuote ? "muted" : "quote-invalid"}
                role="status"
              >
                {validQuote ? (
                  <>
                    {m("Preview valid until")}{" "}
                    <DateStamp
                      value={new Date(
                        quote.time + previewLifetime,
                      ).toISOString()}
                    />
                  </>
                ) : (
                  m("Preview expired or changed. Refresh it before continuing.")
                )}
              </p>
            </>
          )}
          {quote?.reasons.map((reason) => (
            <Notice key={reason} tone="warning">
              {reason}
            </Notice>
          ))}
          <Notice>
            {m(
              "The DAO can spend funds or revoke treasury allowances. There is no guaranteed exit window or reservation of funds.",
            )}
          </Notice>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={ack}
              disabled={!validQuote}
              onChange={(e) => setAckFor(e.target.checked ? fingerprint : null)}
            />
            <span>
              {m("I understand that my MANA will be permanently burned.")}
            </span>
          </label>
          {allowance !== units && (
            <button
              className="button full"
              disabled={
                !canSign ||
                !validQuote ||
                !quote?.available ||
                bps === null ||
                tx.busy
              }
              onClick={() => void approve()}
            >
              {m("1. Authorize {amount} MANA", { amount: input || "0" })}
            </button>
          )}
          <button
            className="button primary full"
            disabled={
              !canSign ||
              !validQuote ||
              !quote?.available ||
              allowance !== units ||
              bps === null ||
              !ack ||
              tx.busy ||
              !validRecipient
            }
            onClick={() => void redeem()}
          >
            {m("Review permanent exit")}
          </button>
          <ActionAvailability
            extra={
              !validQuote
                ? m(
                    "Get a fresh preview before authorizing or reviewing an exit.",
                  )
                : !validRecipient
                  ? m(
                      "Choose a recipient other than zero, the treasury, module or token contracts.",
                    )
                  : allowance !== units
                    ? m("Authorize exactly the selected amount of MANA first.")
                    : !ack
                      ? m("Acknowledge the permanent burn before continuing.")
                      : null
            }
          />
          <p className="field-help">
            {m(
              "The transaction expires 15 minutes after review. A paused or incompatible basket token can prevent an exit; failed atomic transactions preserve your MANA.",
            )}
          </p>
          <details>
            <summary>{m("Calculation and contract details")}</summary>
            <p>
              {m(
                "Each payout is rounded down: asset balance × MANA burned ÷ total supply before burn. Supply includes MANA held by the treasury.",
              )}
            </p>
            <p>
              {m("Tolerance in basis points")}: {bps ?? "—"}
            </p>
            <p>
              {m(
                "You can call previewRedeem and redeem directly on the verified ragequit module, independently of this portal.",
              )}
            </p>
            {module ? (
              <AddressLink address={module} />
            ) : (
              <p>
                {m("The ragequit module has not been deployed and configured.")}
              </p>
            )}
          </details>
        </section>
      </div>
    </>
  );
}
