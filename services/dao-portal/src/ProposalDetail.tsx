import { CommunityShortcuts } from "./Community";
import { JournalHeading } from "./JournalHeading";
import { BlockTime } from "./HumanTime";
import { compactAddresses } from "./time-format";
import { ReadableText, ProposalDocument } from "./ReadableIdentity";
import { TokenAmount } from "./TokenAmount";
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
import { StateBadge, Notice, ActionAvailability, DateStamp } from "./ui";
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
          <p>
            <ReadableText text={actionSummary(action, config)} />
          </p>
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
      isRefetchError,
    } = useApi<Proposal>("proposals/" + contract + "/" + id),
    tx = useTransaction(),
    { address, chainId } = useAccount();
  const voter = useApi<{
    hasVoted: boolean;
    votingPower?: string | null;
    currentBalance?: string;
    snapshot?: string;
    account: string;
    checkedAt: number;
  }>(
    `vote-status/${contract}/${id}/${address ?? ""}`,
    !!address &&
      chainId === config.chainId &&
      contract.toLowerCase() ===
        config.contracts.governor?.address.toLowerCase(),
    15_000,
  );
  const voteChecked =
    !!address &&
    !voter.isError &&
    voter.data?.account === address.toLowerCase() &&
    Date.now() - voter.data.checkedAt < 30_000;
  const alreadyVoted = voteChecked && voter.data?.hasVoted === true;
  const [choice, setChoice] = useState(1),
    [localError, setLocalError] = useState("");
  if (isPending) return <p role="status">{m("Loading proposal…")}</p>;
  if (!p)
    return (
      <Empty title={m("Proposal unavailable")}>
        {error?.message ?? m("This proposal has not been indexed.")}
      </Empty>
    );
  const resultsStale =
    isRefetchError ||
    p.results?.fresh === false ||
    (!!p.results && Date.now() - p.results.checkedAt > 180000);
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
      if (operation === "vote") {
        const current = await voter.refetch();
        if (current.error || !current.data)
          throw new Error(
            "Your voting status could not be verified. Please try again.",
          );
        if (current.data.hasVoted)
          throw new Error("This wallet has already voted on this proposal.");
      }
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
  return (
    <>
      <a className="back" href="#governance">
        {m("← Governance")}
      </a>
      <JournalHeading
        chapter={
          advisory ? "COUNCIL / ADVISORY RECORD" : "COUNCIL / THE DECISION"
        }
        title={compactAddresses(
          p.description.split("\n")[0].replace(/^#+\s*/, ""),
        )}
        art="haechi"
      >
        <div className="proposal-byline">
          <StateBadge state={p.state} />
          <span>
            {m("Proposed by")} <AddressLink address={p.proposer} />
          </span>
        </div>
      </JournalHeading>
      <CommunityShortcuts />
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
          <ProposalDocument text={p.description} />
          <details className="original-document">
            <summary>Original proposal text</summary>
            <pre className="proposal-text">{p.description}</pre>
          </details>
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
            {resultsStale && (
              <p className="notice warning">
                Results could not be refreshed. The last verified totals are
                shown below.
              </p>
            )}
            {p.results && (
              <p className="muted">
                Checked{" "}
                {new Date(p.results.checkedAt).toLocaleTimeString("en-GB")} ·
                refreshes every 2 minutes
              </p>
            )}
            {choices.map((c, i) => (
              <div className="vote-row" key={i}>
                <div className="section-top">
                  <strong>{c}</strong>
                  <span>
                    {votes[i] !== undefined ? (
                      <TokenAmount
                        value={votes[i]}
                        token={config.contracts.mana?.address}
                        showSymbol
                      />
                    ) : (
                      m("Not verified")
                    )}
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
                {p.quorum ? (
                  <TokenAmount
                    value={p.quorum}
                    token={config.contracts.mana?.address}
                    showSymbol
                  />
                ) : (
                  m("Available after snapshot")
                )}
                {m(
                  ". The Governor determines the outcome under its current rules.",
                )}
              </p>
            )}
            <dl className="timing">
              <dt>Voting opens</dt>
              <dd>
                <BlockTime
                  block={p.snapshot}
                  futureLabel="Opens"
                  pastLabel="Opened"
                />
              </dd>
              <dt>Voting closes</dt>
              <dd>
                <BlockTime
                  block={p.deadline}
                  futureLabel="Closes"
                  pastLabel="Closed"
                />
              </dd>
              {p.eta && BigInt(p.eta) > 0n && (
                <>
                  <dt>{m("Earliest execution")}</dt>
                  <dd>
                    <DateStamp value={Number(p.eta)} />
                  </dd>
                </>
              )}
            </dl>
            {!legacy &&
              address &&
              voteChecked &&
              voter.data?.votingPower != null && (
                <section
                  className="proposal-wallet-power"
                  aria-label="Your voting power"
                >
                  <h3>Your voting power for this proposal</h3>
                  <strong>
                    <TokenAmount
                      value={voter.data.votingPower}
                      token={config.contracts.mana?.address}
                      showSymbol
                    />
                  </strong>
                  <p className="muted">
                    Fixed when voting opened. Later transfers or delegation do
                    not change this proposal.
                  </p>
                  <p>
                    Current wallet balance:{" "}
                    <TokenAmount
                      value={voter.data.currentBalance}
                      token={config.contracts.mana?.address}
                      showSymbol
                    />
                  </p>
                  {voter.data.votingPower === "0" && (
                    <p className="muted">
                      This wallet had no delegated voting power when voting
                      opened. Delegate now to participate in future proposals.
                    </p>
                  )}
                </section>
              )}
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
                  disabled={
                    !canSign ||
                    !intact ||
                    tx.busy ||
                    !voteChecked ||
                    alreadyVoted ||
                    resultsStale
                  }
                  onClick={() => void action("vote")}
                >
                  {alreadyVoted ? "Vote recorded" : m("Review vote →")}
                </button>
                <p role="status" className="muted">
                  {alreadyVoted
                    ? "This wallet has already voted on this proposal. Totals refresh every 2 minutes."
                    : voter.isError
                      ? "Voting status unavailable. Retrying automatically; voting stays disabled until verified."
                      : address && !voteChecked
                        ? "Checking whether this wallet has voted… Voting stays disabled until verified."
                        : ""}
                </p>
                <p className="muted">
                  {m(
                    "One vote per address. It cannot be changed. Weight is fixed at the snapshot block.",
                  )}
                </p>
              </>
            )}
            {!legacy && !advisory && p.state === "Succeeded" && (
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
