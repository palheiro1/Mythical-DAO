import { useState } from "react";
import {
  encodeFunctionData,
  keccak256,
  stringToHex,
  decodeFunctionData,
  formatUnits,
  type Address,
} from "viem";
import { useAccount } from "wagmi";
import { governorAbi, ballotsAbi, vaultAbi } from "../shared/abis";
import {
  verifyProposal,
  type Health,
  type PortalConfig,
  type Proposal,
} from "../shared/domain";
import { useApi } from "./api";
import { useTransaction } from "./Transaction";
import { amount, AddressLink, Empty } from "./components";
import { t } from "./i18n";
export function ActionDetails({
  p,
  config,
}: {
  p: Proposal;
  config: PortalConfig;
}) {
  return (
    <ol className="action-list">
      {p.targets.map((target, i) => {
        let title = "Contract call",
          detail = "Review the exact calldata below.";
        try {
          if (target.toLowerCase() === config.contracts.vault?.address) {
            const decoded = decodeFunctionData({
              abi: vaultAbi,
              data: p.calldatas[i],
            });
            if (decoded.functionName === "payNative") {
              title = "Pay POL";
              detail =
                formatUnits(decoded.args[1], 18) + " POL to " + decoded.args[0];
            }
            if (decoded.functionName === "payToken") {
              const [asset, to, value] = decoded.args;
              title = "Token payment";
              const usdc =
                asset.toLowerCase() === config.contracts.usdc?.address;
              detail =
                formatUnits(value, usdc ? 6 : 18) +
                " " +
                (usdc
                  ? "USDC.e"
                  : asset.toLowerCase() === config.contracts.weth?.address
                    ? "WETH"
                    : asset) +
                " to " +
                to;
            }
          }
        } catch {
          /* Unknown calldata stays explicit and visible. */
        }
        return (
          <li key={i}>
            <strong>{title}</strong>
            <p className="break">{detail}</p>
            <dl>
              <dt>Target</dt>
              <dd>
                <AddressLink address={target} />
              </dd>
              <dt>Native value</dt>
              <dd>{amount(p.values[i])} POL</dd>
            </dl>
            <details>
              <summary>Exact calldata</summary>
              <code className="calldata">{p.calldatas[i]}</code>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
export function ProposalDetail({
  contract,
  id,
  config,
  health,
  canSign,
}: {
  contract: string;
  id: string;
  config: PortalConfig;
  health?: Health;
  canSign: boolean;
}) {
  const {
      data: p,
      isPending,
      error,
    } = useApi<Proposal>("proposals/" + contract + "/" + id),
    tx = useTransaction(),
    { address } = useAccount();
  const [choice, setChoice] = useState(1),
    [localError, setLocalError] = useState("");
  if (isPending) return <p role="status">Loading proposal…</p>;
  if (error || !p)
    return (
      <Empty title="Proposal unavailable">
        {error?.message ?? "This proposal has not been indexed."}
      </Empty>
    );
  let intact = true;
  try {
    verifyProposal(p);
  } catch {
    intact = false;
  }
  const advisory = p.kind === "community",
    legacy = p.kind === "legacy";
  const votes = p.votes ?? [],
    total = votes.reduce((a, v) => a + BigInt(v), 0n);
  const choices = advisory
    ? ["Abstain", ...p.options]
    : ["Against", "For", "Abstain"];
  const action = async (operation: "vote" | "queue" | "execute" | "cancel") => {
    try {
      if (!intact)
        throw new Error("The proposal content failed its integrity check.");
      const args = [
        p.targets,
        p.values.map(BigInt),
        p.calldatas,
        keccak256(stringToHex(p.description)),
      ] as const;
      const data =
        operation === "vote"
          ? encodeFunctionData({
              abi: advisory ? ballotsAbi : governorAbi,
              functionName: "castVote",
              args: [BigInt(p.id), choice],
            })
          : advisory
            ? encodeFunctionData({
                abi: ballotsAbi,
                functionName: "cancel",
                args: [BigInt(p.id)],
              })
            : encodeFunctionData({
                abi: governorAbi,
                functionName: operation,
                args,
              });
      await tx.review({
        title:
          operation === "vote"
            ? "Cast your vote"
            : operation === "queue"
              ? "Schedule execution"
              : operation === "execute"
                ? "Execute approved actions"
                : "Cancel proposal",
        to: p.contract,
        data,
        effect:
          operation === "vote"
            ? advisory
              ? t("advisoryNotice")
              : t("fundingNotice")
            : operation === "queue"
              ? "Start the timelock. Members retain the right to exit during the wait."
              : operation === "execute"
                ? "Execute every approved action atomically. Any failure reverts the entire batch."
                : "Cancel this pending proposal.",
        details: [
          { label: "Proposal", value: p.description.split("\n")[0] },
          {
            label: operation === "vote" ? "Your choice" : "Action count",
            value:
              operation === "vote" ? choices[choice] : String(p.targets.length),
          },
        ],
      });
    } catch (e) {
      setLocalError((e as Error).message);
    }
  };
  const estimate = (block: string) =>
    health?.head
      ? new Date(
          Date.now() + Number(BigInt(block) - BigInt(health.head)) * 2000,
        ).toLocaleString() + " (estimated)"
      : "Block time determines the date";
  return (
    <>
      <a className="back" href="#governance">
        ← Governance
      </a>
      <div className="page-heading">
        <div className="section-top">
          <span className="eyebrow">
            {advisory
              ? "Community ballot"
              : legacy
                ? "Historical Governor"
                : "Executable proposal"}
          </span>
          <span className="badge">{p.state}</span>
        </div>
        <h1>{p.description.split("\n")[0].replace(/^#+\s*/, "")}</h1>
        <p>
          Proposed by <AddressLink address={p.proposer} />
        </p>
      </div>
      {!intact && (
        <p role="alert" className="notice error">
          Proposal content does not match its on-chain identifier. Signing is
          disabled.
        </p>
      )}
      {legacy && (
        <p className="notice">
          This proposal belongs to the old Governor. It has not been converted
          into a V2 proposal. This archive is read-only.
        </p>
      )}
      <div className="split-layout">
        <article className="panel">
          <h2>The proposal</h2>
          <pre className="proposal-text">{p.description}</pre>
          {!advisory && (
            <>
              <h2>Approved execution payload</h2>
              <p>
                These actions are enforced on-chain. Other promises in the
                proposal text are not automatically enforced.
              </p>
              <ActionDetails p={p} config={config} />
              <p className="notice">{t("fundingNotice")}</p>
            </>
          )}
          <details>
            <summary>On-chain identity</summary>
            <p>
              Chain {p.chainId} · Contract <AddressLink address={p.contract} />
            </p>
            <code className="calldata">{p.id}</code>
            <a
              href={"https://polygonscan.com/tx/" + p.transactionHash}
              target="_blank"
              rel="noreferrer"
            >
              Publication transaction ↗
            </a>
          </details>
        </article>
        <aside className="stack">
          <section className="panel">
            <span className="eyebrow">Collective decision</span>
            <h2>Voting results</h2>
            {choices.map((c, i) => (
              <div className="vote-row" key={i}>
                <div className="section-top">
                  <strong>{c}</strong>
                  <span>{amount(votes[i] ?? "0")} MANA</span>
                </div>
                <progress
                  aria-label={c + " vote share"}
                  value={
                    total > 0n
                      ? Number((BigInt(votes[i] ?? "0") * 10000n) / total) / 100
                      : 0
                  }
                  max={100}
                />
              </div>
            ))}
            {advisory ? (
              <p>
                {p.state === "Ended"
                  ? p.winner
                    ? "Winner: " + p.options[p.winner - 1]
                    : p.tied
                      ? "Tied · no winner"
                      : p.quorumReached
                        ? "No winning alternative"
                        : "Quorum not reached"
                  : t("advisoryNotice")}
              </p>
            ) : (
              <p>
                Quorum:{" "}
                {p.quorum
                  ? amount(p.quorum) + " MANA"
                  : "Available after snapshot"}
                . For + abstain count. At least ⅔ of directional votes must be
                for.
              </p>
            )}
            <dl className="timing">
              <dt>Voting begins after block {p.snapshot}</dt>
              <dd>{estimate(p.snapshot)}</dd>
              <dt>Voting ends at block {p.deadline}</dt>
              <dd>{estimate(p.deadline)}</dd>
              {p.eta && BigInt(p.eta) > 0n && (
                <>
                  <dt>Earliest execution</dt>
                  <dd>{new Date(Number(p.eta) * 1000).toLocaleString()}</dd>
                </>
              )}
            </dl>
            {!legacy && p.state === "Active" && (
              <>
                <label>
                  Your vote
                  <select
                    value={choice}
                    onChange={(e) => setChoice(Number(e.target.value))}
                  >
                    {choices.map((c, i) => (
                      <option key={i} value={i}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button primary full"
                  disabled={!canSign || !intact || tx.busy}
                  onClick={() => void action("vote")}
                >
                  Review vote →
                </button>
                <p className="muted">
                  One vote per address. It cannot be changed. Weight is fixed at
                  the snapshot block.
                </p>
              </>
            )}
            {!legacy && !advisory && p.state === "Succeeded" && (
              <button
                className="button primary full"
                disabled={!canSign || !intact || tx.busy}
                onClick={() => void action("queue")}
              >
                Schedule · 72h minimum →
              </button>
            )}
            {!legacy && !advisory && p.state === "Queued" && (
              <button
                className="button primary full"
                disabled={
                  !canSign ||
                  !intact ||
                  tx.busy ||
                  Number(p.eta ?? 0) > Date.now() / 1000
                }
                onClick={() => void action("execute")}
              >
                Review execution →
              </button>
            )}
            {!legacy &&
              p.state === "Pending" &&
              address?.toLowerCase() === p.proposer.toLowerCase() && (
                <button
                  className="button full"
                  disabled={!canSign || tx.busy}
                  onClick={() => void action("cancel")}
                >
                  Cancel pending proposal
                </button>
              )}
            {localError && (
              <p role="alert" className="error">
                {localError}
              </p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
