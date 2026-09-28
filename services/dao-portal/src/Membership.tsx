import { useState } from "react";
import { useAccount } from "wagmi";
import {
  encodeFunctionData,
  isAddress,
  parseUnits,
  zeroAddress,
  type Address,
} from "viem";
import { tokenAbi, vaultAbi } from "../shared/abis";
import type { PortalConfig } from "../shared/domain";
import { api, useApi } from "./api";
import { amount, AddressLink, Empty } from "./components";
import { useTransaction } from "./Transaction";
import { t } from "./i18n";
interface Member {
  balance: string;
  votes: string;
  delegate: Address;
  supply: string;
  allowance: string;
}
export function Delegation({
  config,
  canSign,
}: {
  config: PortalConfig;
  canSign: boolean;
}) {
  const { address } = useAccount(),
    { data: member } = useApi<Member>("members/" + address, !!address);
  const { data, error } = useApi<{
    items: { address: Address; votes: string }[];
    limitedTo: number;
  }>("delegates");
  const [delegate, setDelegate] = useState(""),
    [message, setMessage] = useState(""),
    tx = useTransaction();
  async function review(to: string) {
    if (!isAddress(to) || to === zeroAddress) {
      setMessage("Enter a valid representative address.");
      return;
    }
    const mana = config.contracts.mana?.address;
    if (!mana) return;
    await tx.review({
      title:
        to.toLowerCase() === address?.toLowerCase()
          ? "Vote in your own name"
          : "Delegate voting power",
      to: mana,
      data: encodeFunctionData({
        abi: tokenAbi,
        functionName: "delegate",
        args: [to],
      }),
      effect:
        "Delegation changes future voting power. Your MANA stays in your wallet, and only you can redeem it. Existing snapshots remain unchanged.",
      details: [
        { label: "Representative", value: to },
        {
          label: "MANA balance",
          value: member ? amount(member.balance) : "Unavailable",
        },
      ],
    });
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">Representation, on your terms</span>
        <h1>Your voice. Your choice.</h1>
        <p>
          Vote for yourself or delegate to someone you trust. Ownership stays
          with you.
        </p>
      </div>
      <div className="metric-grid">
        <div className="metric">
          <span>Your MANA balance</span>
          <strong>{member ? amount(member.balance) : "—"}</strong>
        </div>
        <div className="metric">
          <span>Voting power received</span>
          <strong>{member ? amount(member.votes) : "—"}</strong>
        </div>
        <div className="metric">
          <span>Chosen representative</span>
          <strong className="small-value">
            {member && member.delegate !== zeroAddress ? (
              <AddressLink address={member.delegate} />
            ) : member ? (
              "Not delegated"
            ) : (
              "Connect wallet"
            )}
          </strong>
        </div>
      </div>
      <div className="split-layout">
        <section className="panel">
          <h2>Choose your representative</h2>
          <p>
            Delegates can vote with your delegated power. They cannot spend or
            redeem your tokens.
          </p>
          <label>
            Representative address
            <input
              value={delegate}
              onChange={(e) => setDelegate(e.target.value)}
              placeholder="0x…"
            />
          </label>
          <div className="button-row">
            <button
              className="button primary"
              disabled={!canSign || tx.busy}
              onClick={() => void review(delegate)}
            >
              Review delegation →
            </button>
            <button
              className="button"
              disabled={!canSign || tx.busy || !address}
              onClick={() => void review(address!)}
            >
              Delegate to myself
            </button>
          </div>
          {message && (
            <p role="alert" className="error">
              {message}
            </p>
          )}
        </section>
        <section className="panel">
          <span className="eyebrow">On-chain representatives</span>
          <h2>Delegates</h2>
          {error ? (
            <p role="alert">{error.message}</p>
          ) : data?.items.length ? (
            <>
              <p className="muted">
                Up to {data.limitedTo} indexed addresses. Voting power is read
                from the contract.
              </p>
              {data.items.map((d) => (
                <div className="table-row" key={d.address}>
                  <AddressLink address={d.address} />
                  <span>{amount(d.votes)} MANA</span>
                  <button
                    aria-label={"Choose " + d.address}
                    onClick={() => setDelegate(d.address)}
                  >
                    Choose ↗
                  </button>
                </div>
              ))}
            </>
          ) : (
            <Empty title="No delegates indexed yet">
              Representatives will appear as the MANA history is indexed.
            </Empty>
          )}
        </section>
      </div>
    </>
  );
}
export function Ragequit({
  config,
  canSign,
}: {
  config: PortalConfig;
  canSign: boolean;
}) {
  const { address } = useAccount(),
    { data: member } = useApi<Member>("members/" + address, !!address),
    tx = useTransaction();
  const [input, setInput] = useState(""),
    [recipient, setRecipient] = useState(""),
    [slippage, setSlippage] = useState("50"),
    [error, setError] = useState("");
  const [quote, setQuote] = useState<{
    amounts: string[];
    supply: string;
    amount: string;
    block: string;
    time: number;
  } | null>(null);
  const [quoting, setQuoting] = useState(false),
    [ack, setAck] = useState(false);
  const vault = config.contracts.vault?.address,
    mana = config.contracts.mana?.address;
  let units = 0n;
  try {
    units = parseUnits(input, 18);
  } catch {
    /* Invalid input is handled before preview. */
  }
  const validQuote =
    !!quote &&
    quote.amount === units.toString() &&
    Date.now() - quote.time < 120000;
  const allowance = BigInt(member?.allowance ?? "0");
  const bps = Number(slippage),
    validBps = Number.isInteger(bps) && bps >= 0 && bps <= 500;
  const minimums =
    quote && validBps
      ? quote.amounts.map((a) =>
          ((BigInt(a) * BigInt(10000 - bps)) / 10000n).toString(),
        )
      : [];
  async function preview() {
    setError("");
    setQuote(null);
    setQuoting(true);
    try {
      if (units <= 0n || units > BigInt(member?.balance ?? 0))
        throw new Error("Choose a positive amount within your MANA balance.");
      if (!vault) throw new Error("The new treasury is not deployed.");
      const q = await api<{ amounts: string[]; supply: string; block: string }>(
        "redeem-preview?amount=" + units,
      );
      if (q.amounts.every((a) => BigInt(a) === 0n))
        throw new Error("This amount produces no payout.");
      setQuote({ ...q, amount: units.toString(), time: Date.now() });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setQuoting(false);
    }
  }
  async function approve() {
    if (!vault || !mana || units <= 0n) return;
    await tx.review({
      title: "Authorize the exact MANA amount",
      to: mana,
      data: encodeFunctionData({
        abi: tokenAbi,
        functionName: "approve",
        args: [vault, units],
      }),
      effect:
        "Authorize only the MANA you selected. This approval does not burn tokens or perform your exit.",
      details: [
        { label: "Allowance", value: amount(units) + " MANA" },
        { label: "Spender", value: vault },
      ],
    });
  }
  async function redeem() {
    try {
      const to = recipient || address;
      if (
        !to ||
        !isAddress(to) ||
        to === zeroAddress ||
        to.toLowerCase() === vault?.toLowerCase()
      )
        throw new Error("Choose a valid payout recipient.");
      if (!vault || !validQuote || !validBps || !ack)
        throw new Error(
          "Refresh the preview and acknowledge the permanent burn.",
        );
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 900);
      await tx.review({
        title: "Burn MANA and exit the DAO",
        to: vault,
        data: encodeFunctionData({
          abi: vaultAbi,
          functionName: "redeem",
          args: [
            units,
            to,
            minimums.map(BigInt) as [bigint, bigint, bigint],
            deadline,
          ],
        }),
        effect:
          t("exitNotice") +
          " If any payout fails, the entire transaction reverts, including the burn.",
        details: [
          { label: "Permanent burn", value: amount(units) + " MANA" },
          { label: "Recipient", value: to },
          ...minimums.map((v, i) => ({
            label: "Minimum " + ["POL", "WETH", "USDC.e"][i],
            value: amount(v, i === 2 ? 6 : 18),
          })),
          {
            label: "Expires",
            value: new Date(Number(deadline) * 1000).toLocaleString(),
          },
        ],
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">An open door, always</span>
        <h1>Leave on your own terms.</h1>
        <p>Redeem your share of the treasury by permanently burning MANA.</p>
      </div>
      <div className="split-layout">
        <section className="panel">
          <h2>Your exit</h2>
          <p>{t("exitNotice")}</p>
          <label>
            MANA to burn
            <div className="input-suffix">
              <input
                inputMode="decimal"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setQuote(null);
                  setAck(false);
                }}
                placeholder="0.00"
              />
              <button
                disabled={!member}
                onClick={() => {
                  setInput(amount(member!.balance));
                  setQuote(null);
                }}
              >
                Max
              </button>
            </div>
          </label>
          <p className="muted">
            Available:{" "}
            {member ? amount(member.balance) + " MANA" : "Connect your wallet"}
          </p>
          <label>
            Payout recipient
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={address ?? "Your wallet address"}
            />
          </label>
          <label>
            Maximum decrease from preview (basis points)
            <input
              type="number"
              min={0}
              max={500}
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
            />
          </label>
          <p className="muted">
            50 basis points = 0.5%. Each asset has its own minimum. Your
            transaction expires in 15 minutes.
          </p>
          <button
            className="button full"
            disabled={!address || quoting || !vault}
            onClick={() => void preview()}
          >
            {quoting ? "Reading current treasury…" : "Preview my exit"}
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </section>
        <aside className="stack">
          <section className="panel">
            <span className="eyebrow">Your proportional share</span>
            <h2>You receive</h2>
            {["POL", "WETH", "USDC.e"].map((a, i) => (
              <div className="asset-row" key={a}>
                <span className="asset-icon">{["P", "Ξ", "$"][i]}</span>
                <span>{a}</span>
                <strong>
                  {quote ? amount(quote.amounts[i], i === 2 ? 6 : 18) : "—"}
                </strong>
              </div>
            ))}
            <p className="muted">
              Rounded down per asset. Total MANA supply includes tokens held by
              the treasury.
            </p>
            {quote && (
              <p className="muted">
                Supply: {amount(quote.supply)} MANA · Preview block{" "}
                {quote.block}
              </p>
            )}
            <p className="notice">{t("fundingNotice")}</p>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
              />
              I understand that my MANA will be permanently burned.
            </label>
            {allowance !== units && (
              <button
                className="button full"
                disabled={!canSign || !validQuote || !validBps || tx.busy}
                onClick={() => void approve()}
              >
                1. Authorize {input || "0"} MANA
              </button>
            )}
            <button
              className="button primary full"
              disabled={
                !canSign ||
                !validQuote ||
                allowance !== units ||
                !validBps ||
                !ack ||
                tx.busy
              }
              onClick={() => void redeem()}
            >
              Review permanent exit →
            </button>
            <p className="muted">
              A paused or incompatible basket token can prevent an exit. Failed
              atomic transactions preserve your MANA.
            </p>
          </section>
          <section className="panel soft">
            <h3>Independent of this portal</h3>
            <p>
              You can call <code>previewRedeem</code> and <code>redeem</code>{" "}
              directly on the verified treasury contract.
            </p>
            {vault ? (
              <AddressLink address={vault} />
            ) : (
              <span className="muted">
                Treasury address available after deployment.
              </span>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
