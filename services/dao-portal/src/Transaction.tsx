import { formatTokenAmount } from "./token-format";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { formatEther, decodeFunctionData, type Address, type Hex } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import type { Action, PortalConfig, Proposal } from "../shared/domain";
import { api } from "./api";
import { governorAbi } from "../shared/abis";
import { actionSummary } from "../shared/action-summary";
import { m } from "./i18n";
import { ErrorNotice } from "./ui";
import { waitForOperation } from "./transaction-receipt";
import { attestRagequitIntent } from "./ragequit-attestation";
export interface TransactionIntent {
  title: string;
  to: Address;
  data: Hex;
  value?: string;
  effect: string;
  details: { label: string; value: string }[];
  actions?: Action[];
  displayActions?: Action[];
  validUntil?: number;
  assertCurrent?: () => void;
}
interface BatchSimulation {
  ok: boolean;
  complete?: boolean;
  warning: string;
  block: string;
}
interface Review {
  intent: TransactionIntent;
  account: Address;
  gas: string;
  estimatedFee: string;
  batch?: BatchSimulation;
  block?: string;
  walletEpoch: number;
}
interface TransactionContextValue {
  review: (intent: TransactionIntent) => Promise<void>;
  busy: boolean;
}
const TransactionContext = createContext<TransactionContextValue | null>(null);
export const useTransaction = () => useContext(TransactionContext)!;
export function TransactionProvider({
  config,
  children,
}: {
  config: PortalConfig;
  children: ReactNode;
}) {
  const { address, chainId } = useAccount(),
    { data: wallet } = useWalletClient(),
    client = usePublicClient({ chainId: config.chainId });
  const queries = useQueryClient(),
    dialog = useRef<HTMLDialogElement>(null),
    reviewOrigin = useRef<HTMLElement | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [review, setReview] = useState<Review | null>(null),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [hash, setHash] = useState<Hex>(),
    [busy, setBusy] = useState(false);
  const [proposalLink, setProposalLink] = useState("");
  const [invalidated, setInvalidated] = useState(false);
  const identity = JSON.stringify([
    address,
    chainId,
    config.enabled,
    config.chainId,
    config.contracts,
  ]);
  const currentWallet = useRef({ identity, epoch: 0 });
  useEffect(() => {
    if (currentWallet.current.identity !== identity) {
      currentWallet.current = {
        identity,
        epoch: currentWallet.current.epoch + 1,
      };
      setInvalidated(true);
    }
  }, [identity]);
  useEffect(() => {
    if (review && !dialog.current?.open) dialog.current?.showModal();
  }, [review]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!review?.intent.validUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [review]);
  async function prepare(intent: TransactionIntent) {
    reviewOrigin.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setError("");
    setHash(undefined);
    setProposalLink("");
    setStatus(m("Checking current state…"));
    setBusy(true);
    const walletEpoch = currentWallet.current.epoch;
    try {
      if (!address || chainId !== config.chainId)
        throw new Error(m("Connect your wallet to the correct network first."));
      if (!config.enabled) throw new Error(m("Signing is unavailable."));
      await attestRagequitIntent(config, intent, client);
      const batch = intent.actions
        ? await api<BatchSimulation>("simulate-actions", {
            actions: intent.actions,
          })
        : undefined;
      const result = await api<{ gas: string; estimatedFee: string }>(
        "preflight",
        {
          account: address,
          to: intent.to,
          data: intent.data,
          value: intent.value ?? "0",
        },
      );
      intent.assertCurrent?.();
      if (currentWallet.current.epoch !== walletEpoch)
        throw new Error(
          m("Wallet or network changed. Review the operation again."),
        );
      setInvalidated(false);
      setNow(Date.now());
      setAcknowledged(false);
      setReview({ intent, account: address, ...result, batch, walletEpoch });
      setStatus(m("Review before signing"));
    } catch (e) {
      setError(e instanceof Error ? e.message : m("Simulation failed."));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }
  async function sign() {
    if (!review || !wallet || !client) return;
    setBusy(true);
    setError("");
    const intent = review.intent;
    try {
      if (
        currentWallet.current.epoch !== review.walletEpoch ||
        address !== review.account ||
        (await wallet.getChainId()) !== config.chainId
      )
        throw new Error(
          m("Wallet or network changed. Review the operation again."),
        );
      intent.assertCurrent?.();
      setStatus(m("Simulating again before signature…"));
      if (intent.actions) {
        const latest = await api<BatchSimulation>("simulate-actions", {
          actions: intent.actions,
        });
        if (
          (!latest.ok && (!acknowledged || review.batch?.ok)) ||
          latest.complete !== review.batch?.complete
        )
          throw new Error(
            m(
              "Proposed actions are not currently executable. Close this review and review the new simulation result.",
            ),
          );
      }
      await api("preflight", {
        account: review.account,
        to: intent.to,
        data: intent.data,
        value: intent.value ?? "0",
      });
      await attestRagequitIntent(config, intent, client);
      intent.assertCurrent?.();
      if (
        currentWallet.current.epoch !== review.walletEpoch ||
        (await wallet.getAddresses())[0]?.toLowerCase() !==
          review.account.toLowerCase() ||
        (await wallet.getChainId()) !== config.chainId
      )
        throw new Error(
          m("Wallet or network changed. Review the operation again."),
        );
      setStatus(m("Waiting for wallet signature…"));
      const sent = await wallet.sendTransaction({
        account: review.account,
        chain: wallet.chain,
        to: intent.to,
        data: intent.data,
        value: BigInt(intent.value ?? "0"),
      });
      setHash(sent);
      setStatus(m("Pending · waiting for inclusion"));
      const receipt = await waitForOperation(
        client,
        sent,
        config.confirmations,
        (progress) => {
          setHash(progress.hash);
          setStatus(
            progress.phase === "included"
              ? m("Included · waiting for ") +
                  config.confirmations +
                  m(" confirmations")
              : m("Replaced · checking replacement"),
          );
          if (progress.phase === "included") void queries.invalidateQueries();
        },
      );
      setStatus(m("Confirmed · operation completed"));
      if (
        intent.to.toLowerCase() ===
          config.contracts.governor?.address.toLowerCase() &&
        decodeFunctionData({ abi: governorAbi, data: intent.data })
          .functionName === "propose"
      ) {
        try {
          const proposal = await api<Proposal>("proposals/resolve", {
            transactionHash: receipt.transactionHash,
          });
          setProposalLink("#proposal/" + proposal.contract + "/" + proposal.id);
        } catch {
          setError(
            m(
              "The transaction is confirmed. Recover the proposal from Governance using its transaction hash once both providers confirm it.",
            ),
          );
        }
      }
      await queries.invalidateQueries();
    } catch (e) {
      setStatus(m("Operation not completed"));
      const message = e instanceof Error ? e.message : m("Transaction failed.");
      setError(
        /reject|denied/i.test(message)
          ? m("Signature declined. Nothing was submitted.")
          : message.slice(0, 280),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <TransactionContext.Provider value={{ review: prepare, busy }}>
      {children}
      {!review && busy && (
        <div role="status" className="toast">
          {status}
        </div>
      )}
      {!review && error && (
        <div className="toast error">
          <ErrorNotice error={error} />
          <button aria-label={m("Dismiss")} onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        onClose={() => {
          if (reviewOrigin.current?.isConnected) reviewOrigin.current.focus();
          else document.getElementById("main-content")?.focus();
        }}
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setReview(null);
        }}
        aria-labelledby="review-title"
      >
        {review && (
          <>
            <div className="section-top">
              <span className="eyebrow">{m("Wallet operation")}</span>
              <button
                aria-label={m("Close review")}
                disabled={busy}
                onClick={() => {
                  dialog.current?.close();
                  setReview(null);
                }}
              >
                ×
              </button>
            </div>
            <h2 id="review-title">{review.intent.title}</h2>
            <p>{review.intent.effect}</p>
            <dl className="review-list">
              <div>
                <dt>{m("Network")}</dt>
                <dd>
                  {config.chainId === 137
                    ? "Polygon"
                    : config.chainId === 80002
                      ? m("Polygon Amoy")
                      : m("Local test chain")}{" "}
                  · {config.chainId}
                </dd>
              </div>
              {review.intent.details.map((d, i) => (
                <div key={i}>
                  <dt>{d.label}</dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
              {review.block && (
                <div>
                  <dt>{m("Live verification block")}</dt>
                  <dd>{review.block}</dd>
                </div>
              )}
              <div>
                <dt>{m("Estimated network fee")}</dt>
                <dd>
                  {
                    formatTokenAmount(
                      review.estimatedFee,
                      { symbol: "POL", decimals: 18 },
                      true,
                    ).text
                  }{" "}
                  {m("POL")}
                  <span className="token-exact">
                    {m("Exact amount")}:{" "}
                    {formatEther(BigInt(review.estimatedFee))} {m("POL")}
                  </span>
                </dd>
              </div>
            </dl>
            {(review.intent.displayActions ?? review.intent.actions) && (
              <section>
                <h3>{m("Every proposed action")}</h3>
                {(review.intent.displayActions ?? review.intent.actions)!.map(
                  (a, i) => (
                    <div className="action-item" key={i}>
                      <strong>{m("Action {number}", { number: i + 1 })}</strong>
                      <p>{actionSummary(a, config)}</p>
                      <p>
                        {m("Target:")} <code>{a.target}</code>
                      </p>
                      <p>
                        {m("Native value:")} {formatEther(BigInt(a.value))}{" "}
                        {m("POL")}
                      </p>
                      <details>
                        <summary>{m("Exact calldata")}</summary>
                        <code className="calldata">{a.data}</code>
                      </details>
                    </div>
                  ),
                )}
                {review.batch && (
                  <p className="notice">
                    {review.batch.warning}
                    {m("Simulated at block")} {review.batch.block}.
                  </p>
                )}
                {review.batch && !review.batch.ok && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                    />
                    {review.batch.complete === false
                      ? m(
                          "I understand that the combined actions have not been verified and still want to publish them for voting.",
                        )
                      : m(
                          "I understand these actions are not currently executable and still want to publish them for voting.",
                        )}
                  </label>
                )}
              </section>
            )}
            <details>
              <summary>{m("Technical details")}</summary>
              <p>
                {m("Signing account:")} <code>{review.account}</code>
              </p>
              <p>
                {m("Contract:")} <code>{review.intent.to}</code>
              </p>
              <p>
                {m("Native value:")} {review.intent.value ?? "0"} {m("wei")}
              </p>
              <code className="calldata">{review.intent.data}</code>
            </details>
            <p role="status" className="status-line">
              {status}
            </p>
            {error && <ErrorNotice error={error} />}
            {proposalLink && (
              <a
                className="button primary"
                href={proposalLink}
                onClick={() => {
                  dialog.current?.close();
                  setReview(null);
                }}
              >
                {m("View proposal")}
              </a>
            )}
            {hash && (
              <p>
                <a
                  href={
                    (config.chainId === 80002
                      ? "https://amoy.polygonscan.com"
                      : "https://polygonscan.com") +
                    "/tx/" +
                    hash
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  {m("View transaction ↗")}
                </a>
              </p>
            )}
            {review.intent.validUntil &&
              now >= review.intent.validUntil &&
              !hash && (
                <p role="alert" className="error">
                  {m(
                    "The preview expired. Close this review and get a fresh preview.",
                  )}
                </p>
              )}
            {!hash &&
              (invalidated ||
                address !== review.account ||
                chainId !== config.chainId) && (
                <p role="alert" className="error">
                  {m("Wallet or network changed. Review the operation again.")}
                </p>
              )}
            {!hash && (
              <button
                className="button primary full"
                disabled={
                  busy ||
                  invalidated ||
                  (!!review.intent.validUntil &&
                    now >= review.intent.validUntil) ||
                  address !== review.account ||
                  chainId !== config.chainId ||
                  (review.batch?.ok === false && !acknowledged)
                }
                onClick={() => void sign()}
              >
                {busy ? m("Please wait…") : m("Confirm in wallet")}
              </button>
            )}
          </>
        )}
      </dialog>
    </TransactionContext.Provider>
  );
}
