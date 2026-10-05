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
import {
  ReadFreshness,
  StateBadge,
  Notice,
  ActionAvailability,
  DateStamp,
} from "./ui";
import { actionSummary } from "../shared/action-summary";
import { proposalActions } from "./action-view";
import { useApi } from "./api";
import { useTransaction } from "./Transaction";
import { amount, AddressLink, Empty } from "./components";
import { t, m } from "./i18n";
export function ActionDetails({
  p,
  config,
}: {
  p: Proposal;
  config: PortalConfig;
}) {
  return (
    <ol className="actions">
      {proposalActions(p).map((action, i) => (
        <li className="action-item" key={i}>
          <strong>{m("Action {number}", { number: i + 1 })}</strong>
          <p>{actionSummary(action, config)}</p>
          <dl>
            <dt>{m("Target")}</dt>
            <dd>
              <AddressLink address={action.target} />
            </dd>
            <dt>{m("Native value")}</dt>
            <dd>
              {amount(action.value)} {m("POL")}
            </dd>
          </dl>
          <details>
            <summary>{m("Exact calldata")}</summary>
            <code className="calldata">{action.data}</code>
          </details>
        </li>
      ))}
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
  if (isPending) return <p role="status">{m("Loading proposal…")}</p>;
  if (error || !p)
    return (
      <Empty title={m("Proposal unavailable")}>
        {error?.message ?? m("This proposal has not been indexed.")}
      </Empty>
    );
  let intact = true;
  try {
    verifyProposal(p);
  } catch {
    intact = false;
  }
  const advisory = p.kind === "community",
    legacy =
      p.contract.toLowerCase() !==
      config.contracts.governor?.address.toLowerCase();
  const votes = p.votes ?? [],
    total = votes.reduce((a, v) => a + BigInt(v), 0n);
  const choices = advisory
    ? [m("Abstain"), ...p.options]
    : [m("Against"), m("For"), m("Abstain")];
  const action = async (operation: "vote" | "execute" | "cancel") => {
    try {
      if (!intact)
        throw new Error(m("The proposal content failed its integrity check."));
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
            ? m("Cast your vote")
            : operation === "execute"
              ? m("Execute approved actions")
              : m("Cancel proposal"),
        to: p.contract,
        data,
        effect:
          operation === "vote"
            ? advisory
              ? t("advisoryNotice")
              : t("fundingNotice")
            : operation === "execute"
              ? m(
                  "Execute every approved action atomically. Any failure reverts the entire batch.",
                )
              : m("Cancel this pending proposal."),
        displayActions: !advisory ? proposalActions(p) : undefined,
        details: [
          { label: "Proposal", value: p.description.split("\n")[0] },
          {
            label: operation === "vote" ? m("Your choice") : m("Action count"),
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
      : m("Block time determines the date");
  return (
    <>
      <a className="back" href="#governance">
        {m("← Governance")}
      </a>
      <div className="page-heading">
        <div className="section-top">
          <span className="eyebrow">
            {advisory
              ? m("Community ballot")
              : legacy
                ? m("Historical Governor")
                : m("Executable proposal")}
          </span>
          <StateBadge state={p.state} />
        </div>
        <h1>{p.description.split("\n")[0].replace(/^#+\s*/, "")}</h1>
        <p>
          {m("Proposed by")} <AddressLink address={p.proposer} />
        </p>
      </div>
      <ReadFreshness read={p.read} />
      {p.state === "Ended" && (
        <Notice>
          {m(
            "Voting has ended. Review execution to check the outcome and eligibility against the live contract.",
          )}
        </Notice>
      )}
      {!intact && (
        <p role="alert" className="notice error">
          {m(
            "Proposal content does not match its on-chain identifier. Signing is disabled.",
          )}
        </p>
      )}
      {legacy && (
        <p className="notice">
          {m(
            "This record belongs to a historical contract. Its original content is preserved; it cannot be signed through the active Governor.",
          )}
        </p>
      )}
      <Notice tone={p.state === "Canceled" ? "warning" : "info"}>
        {advisory
          ? t("advisoryNotice")
          : p.state === "Executed"
            ? m(
                "Execution is confirmed on-chain. See the source transactions for the exact movements.",
              )
            : p.state === "Succeeded"
              ? m(
                  "Voting approved this proposal. Its actions can now be executed directly through the Governor.",
                )
              : p.state === "Queued"
                ? m(
                    "The proposal is scheduled and waiting for execution. Approval does not reserve treasury assets.",
                  )
                : p.state === "Canceled"
                  ? m("This proposal was canceled. It cannot be executed.")
                  : m(
                      "Review the decision and every action before voting. Approval and treasury execution are separate steps.",
                    )}
      </Notice>
      <div className="split-layout">
        <article className="panel">
          <h2>{m("The proposal")}</h2>
          <pre className="proposal-text">{p.description}</pre>
          {!advisory && intact && (
            <>
              <h2>{m("Proposed on-chain actions")}</h2>
              <p>
                {m(
                  "These actions are enforced on-chain. Other promises in the proposal text are not automatically enforced.",
                )}
              </p>
              <ActionDetails p={p} config={config} />
              <p className="notice">{t("fundingNotice")}</p>
            </>
          )}
          <details>
            <summary>{m("On-chain identity")}</summary>
            <p>
              {m("Chain")} {p.chainId} {m("· Contract")}{" "}
              <AddressLink address={p.contract} />
            </p>
            <code className="calldata">{p.id}</code>
            <a
              href={"https://polygonscan.com/tx/" + p.transactionHash}
              target="_blank"
              rel="noreferrer"
            >
              {m("Publication transaction ↗")}
            </a>
          </details>
        </article>
        <aside className="stack">
          <section className="panel">
            <span className="eyebrow">{m("Collective decision")}</span>
            <h2>{m("Voting results")}</h2>
            {choices.map((c, i) => (
              <div className="vote-row" key={i}>
                <div className="section-top">
                  <strong>{c}</strong>
                  <span>
                    {votes[i] !== undefined
                      ? amount(votes[i]) + m(" MANA")
                      : m("Not verified")}
                  </span>
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
                    ? m("Winner: ") + p.options[p.winner - 1]
                    : p.tied
                      ? m("Tied · no winner")
                      : p.quorumReached
                        ? m("No winning alternative")
                        : m("Quorum not reached")
                  : t("advisoryNotice")}
              </p>
            ) : (
              <p>
                {m("Quorum:")}{" "}
                {p.quorum
                  ? amount(p.quorum) + m(" MANA")
                  : m("Available after snapshot")}
                {m(
                  ". The Governor determines the outcome under its current rules.",
                )}
              </p>
            )}
            <dl className="timing">
              <dt>
                {m("Voting begins after block")} {p.snapshot}
              </dt>
              <dd>{estimate(p.snapshot)}</dd>
              <dt>
                {m("Voting ends at block")} {p.deadline}
              </dt>
              <dd>{estimate(p.deadline)}</dd>
              {p.eta && BigInt(p.eta) > 0n && (
                <>
                  <dt>{m("Earliest execution")}</dt>
                  <dd>
                    <DateStamp value={Number(p.eta)} />
                  </dd>
                </>
              )}
            </dl>
            {!legacy && p.state === "Active" && (
              <>
                <label>
                  {m("Your vote")}
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
                  {m("Review vote →")}
                </button>
                <p className="muted">
                  {m(
                    "One vote per address. It cannot be changed. Weight is fixed at the snapshot block.",
                  )}
                </p>
              </>
            )}
            {!legacy &&
              !advisory &&
              ["Succeeded", "Ended"].includes(p.state) && (
                <button
                  className="button primary full"
                  disabled={!canSign || !intact || tx.busy}
                  onClick={() => void action("execute")}
                >
                  {m("Review execution →")}
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
                  {m("Cancel pending proposal")}
                </button>
              )}
            {!legacy && (
              <ActionAvailability
                extra={
                  !intact
                    ? m("Proposal integrity could not be verified.")
                    : null
                }
              />
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
