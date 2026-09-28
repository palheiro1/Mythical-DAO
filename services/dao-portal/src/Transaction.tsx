import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { formatEther, type Address, type Hex } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import type { Action, Health, PortalConfig } from "../shared/domain";
import { api } from "./api";
import { actionSummary } from "../shared/action-summary";
import { waitForOperation } from "./transaction-receipt";
export interface TransactionIntent {
  title: string;
  to: Address;
  data: Hex;
  value?: string;
  effect: string;
  details: { label: string; value: string }[];
  actions?: Action[];
}
interface BatchSimulation {
  ok: boolean;
  warning: string;
  block: string;
}
interface Review {
  intent: TransactionIntent;
  account: Address;
  gas: string;
  estimatedFee: string;
  batch?: BatchSimulation;
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
    dialog = useRef<HTMLDialogElement>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [review, setReview] = useState<Review | null>(null),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [hash, setHash] = useState<Hex>(),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (review && !dialog.current?.open) dialog.current?.showModal();
  }, [review]);
  async function prepare(intent: TransactionIntent) {
    setError("");
    setHash(undefined);
    setStatus("Checking current state…");
    setBusy(true);
    try {
      if (!address || chainId !== config.chainId)
        throw new Error("Connect your wallet to the correct network first.");
      const health = await api<Health>("health");
      if (!health.signingAllowed)
        throw new Error(health.reason ?? "Signing is unavailable.");
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
      setAcknowledged(false);
      setReview({ intent, account: address, ...result, batch });
      setStatus("Review before signing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed.");
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
        address !== review.account ||
        (await wallet.getChainId()) !== config.chainId
      )
        throw new Error(
          "Wallet or network changed. Review the operation again.",
        );
      setStatus("Simulating again before signature…");
      if (intent.actions) {
        const latest = await api<BatchSimulation>("simulate-actions", {
          actions: intent.actions,
        });
        if (!latest.ok && (!acknowledged || review.batch?.ok))
          throw new Error(
            "Proposed actions are not currently executable. Close this review and review the new simulation result.",
          );
      }
      await api("preflight", {
        account: review.account,
        to: intent.to,
        data: intent.data,
        value: intent.value ?? "0",
      });
      setStatus("Waiting for wallet signature…");
      const sent = await wallet.sendTransaction({
        account: review.account,
        chain: wallet.chain,
        to: intent.to,
        data: intent.data,
        value: BigInt(intent.value ?? "0"),
      });
      setHash(sent);
      setStatus("Pending · waiting for inclusion");
      await waitForOperation(client, sent, config.confirmations, (progress) => {
        setHash(progress.hash);
        setStatus(
          progress.phase === "included"
            ? "Included · waiting for " +
                config.confirmations +
                " confirmations"
            : "Replaced · checking replacement",
        );
        if (progress.phase === "included") void queries.invalidateQueries();
      });
      setStatus("Confirmed · operation completed");
      await queries.invalidateQueries();
    } catch (e) {
      setStatus("Operation not completed");
      const message = e instanceof Error ? e.message : "Transaction failed.";
      setError(
        /reject|denied/i.test(message)
          ? "Signature declined. Nothing was submitted."
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
        <div role="alert" className="toast error">
          {error}
          <button aria-label="Dismiss" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setReview(null);
        }}
        aria-labelledby="review-title"
      >
        {review && (
          <>
            <div className="section-top">
              <span className="eyebrow">Wallet operation</span>
              <button
                aria-label="Close review"
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
                <dt>Network</dt>
                <dd>
                  {config.chainId === 137
                    ? "Polygon"
                    : config.chainId === 80002
                      ? "Polygon Amoy"
                      : "Local test chain"}{" "}
                  · {config.chainId}
                </dd>
              </div>
              {review.intent.details.map((d, i) => (
                <div key={i}>
                  <dt>{d.label}</dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
              <div>
                <dt>Estimated network fee</dt>
                <dd>{formatEther(BigInt(review.estimatedFee))} POL</dd>
              </div>
            </dl>
            {review.intent.actions && (
              <section>
                <h3>Every proposed action</h3>
                {review.intent.actions.map((a, i) => (
                  <div className="action-item" key={i}>
                    <strong>Action {i + 1}</strong>
                    <p>{actionSummary(a, config)}</p>
                    <p>
                      Target: <code>{a.target}</code>
                    </p>
                    <p>Native value: {formatEther(BigInt(a.value))} POL</p>
                    <code className="calldata">{a.data}</code>
                  </div>
                ))}
                {review.batch && (
                  <p className="notice">
                    {review.batch.warning} Simulated at block{" "}
                    {review.batch.block}.
                  </p>
                )}
                {review.batch && !review.batch.ok && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                    />
                    I understand these actions are not currently executable and
                    still want to publish them for voting.
                  </label>
                )}
              </section>
            )}
            <details>
              <summary>Technical details</summary>
              <p>
                Signing account: <code>{review.account}</code>
              </p>
              <p>
                Contract: <code>{review.intent.to}</code>
              </p>
              <p>Native value: {review.intent.value ?? "0"} wei</p>
              <code className="calldata">{review.intent.data}</code>
            </details>
            <p role="status" className="status-line">
              {status}
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
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
                  View transaction ↗
                </a>
              </p>
            )}
            {!hash && (
              <button
                className="button primary full"
                disabled={
                  busy ||
                  address !== review.account ||
                  chainId !== config.chainId ||
                  (review.batch?.ok === false && !acknowledged)
                }
                onClick={() => void sign()}
              >
                {busy ? "Please wait…" : "Confirm in wallet"}
              </button>
            )}
          </>
        )}
      </dialog>
    </TransactionContext.Provider>
  );
}
