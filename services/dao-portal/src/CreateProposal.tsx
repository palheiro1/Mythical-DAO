import { useState } from "react";
import {
  encodeFunctionData,
  isAddress,
  parseEther,
  parseUnits,
  zeroAddress,
  type Address,
} from "viem";
import { ballotsAbi, governorAbi, vaultAbi } from "../shared/abis";
import {
  safeExternalUrl,
  validateActions,
  type Action,
  type PortalConfig,
} from "../shared/domain";
import {
  description,
  fields,
  newDraft,
  storageKey,
  validateDraft,
  type Draft,
} from "./drafts";
import { useTransaction } from "./Transaction";
import { t, m } from "./i18n";
import { PageHeading, Notice, Icon, ActionAvailability } from "./ui";
import { AddressLink, amount } from "./components";
import { actionSummary } from "../shared/action-summary";
import { paymentFor } from "./action-view";
import { draftIssues, fieldId, type DraftIssue } from "./draft-validation";
function load() {
  try {
    return validateDraft(
      JSON.parse(localStorage.getItem(storageKey) ?? "null"),
    );
  } catch {
    return newDraft();
  }
}
export function CreateProposal({
  config,
  canSign,
}: {
  config: PortalConfig;
  canSign: boolean;
}) {
  const [draft, setDraft] = useState<Draft>(load),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [recipient, setRecipient] = useState(""),
    [asset, setAsset] = useState("POL"),
    [value, setValue] = useState("");
  const [advanced, setAdvanced] = useState("[]"),
    [template, setTemplate] = useState("payment"),
    [parameter, setParameter] = useState("setVotingDelay");
  const tx = useTransaction();
  const [step, setStep] = useState(0),
    [coherent, setCoherent] = useState(false),
    [issue, setIssue] = useState<DraftIssue | null>(null);
  const payments = draft.actions
    .map((a) => paymentFor(a, config))
    .filter(Boolean);
  function update(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setCoherent(false);
    setIssue(null);
    setError("");
    setMessage(m("Unsaved changes"));
  }
  function addAction() {
    try {
      let action: Action;
      const vault = config.contracts.vault?.address,
        governor = config.contracts.governor?.address;
      if (template === "advanced") {
        update({
          actions: [...draft.actions, ...validateActions(JSON.parse(advanced))],
        });
        return;
      }
      if (template === "parameter") {
        if (!governor)
          throw new Error(
            m("Configure a Governor deployment before adding this action."),
          );
        if (!/^\d+$/.test(value))
          throw new Error(m("Use an unsigned integer in contract units."));
        const abi = [
          {
            name: parameter,
            type: "function",
            stateMutability: "nonpayable",
            inputs: [
              {
                name: "value",
                type:
                  parameter === "setVotingDelay"
                    ? "uint48"
                    : parameter === "setVotingPeriod"
                      ? "uint32"
                      : "uint256",
              },
            ],
            outputs: [],
          },
        ] as const;
        action = {
          target: governor,
          value: "0",
          data: encodeFunctionData({
            abi,
            functionName: parameter,
            args: [BigInt(value)],
          }),
        };
      } else {
        if (!vault)
          throw new Error(
            m("Configure the new treasury before adding a payment."),
          );
        if (!isAddress(recipient) || recipient === zeroAddress)
          throw new Error(m("Enter a valid recipient."));
        const token =
          asset === "WETH"
            ? config.contracts.weth?.address
            : config.contracts.usdc?.address;
        const units = parseUnits(value, asset === "USDC.e" ? 6 : 18);
        if (units <= 0n) throw new Error(m("Amount must be positive."));
        action = {
          target: vault,
          value: "0",
          data:
            asset === "POL"
              ? encodeFunctionData({
                  abi: vaultAbi,
                  functionName: "payNative",
                  args: [recipient, units],
                })
              : encodeFunctionData({
                  abi: vaultAbi,
                  functionName: "payToken",
                  args: [token!, recipient, units],
                }),
        };
      }
      update({ actions: validateActions([...draft.actions, action]) });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function publish() {
    try {
      const issue = draftIssues(draft)[0];
      if (issue) {
        focusIssue(issue);
        return;
      }
      if (draft.kind === "executable" && !coherent)
        throw new Error(
          m("Confirm that your written budget and configured actions agree."),
        );
      if (!draft.title.trim() || fields.some((f) => !draft.sections[f].trim()))
        throw new Error(m("Complete the title and all proposal sections."));
      if (draft.discussion && !safeExternalUrl(draft.discussion))
        throw new Error(m("The discussion link must use HTTPS."));
      const text = description(draft);
      if (new TextEncoder().encode(text).length > 32768)
        throw new Error(m("Description exceeds 32 KB."));
      const community = draft.kind === "community";
      if (
        community &&
        (draft.options.length < 2 ||
          draft.options.length > 20 ||
          draft.options.some(
            (o) => !o.trim() || new TextEncoder().encode(o).length > 160,
          ) ||
          new Set(draft.options).size !== draft.options.length)
      )
        throw new Error(
          m("Use 2–20 distinct alternatives, each at most 160 bytes."),
        );
      if (!community) validateActions(draft.actions);
      const target = community
        ? config.contracts.ballots?.address
        : config.contracts.governor?.address;
      if (!target) throw new Error(m("Contracts are not yet deployed."));
      await tx.review({
        title: community
          ? m("Publish community ballot")
          : m("Publish executable proposal"),
        to: target,
        data: community
          ? encodeFunctionData({
              abi: ballotsAbi,
              functionName: "createBallot",
              args: [text, draft.options],
            })
          : encodeFunctionData({
              abi: governorAbi,
              functionName: "propose",
              args: [
                draft.actions.map((a) => a.target),
                draft.actions.map((a) => BigInt(a.value)),
                draft.actions.map((a) => a.data),
                text,
              ],
            }),
        effect: community
          ? t("advisoryNotice")
          : m(
              "Publish immutable text and actions for members to vote on. Text commitments are not automatically enforced.",
            ),
        details: [
          { label: m("Title"), value: draft.title },
          {
            label: m("Voting delay / period"),
            value: m(
              "Initial rules: 41,143 / 288,000 blocks. Current rules are enforced by the contract.",
            ),
          },
          {
            label: community ? m("Alternatives") : m("Actions"),
            value: community
              ? draft.options.join(" · ")
              : String(draft.actions.length),
          },
        ],
        actions: community ? undefined : draft.actions,
      });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      setMessage(m("Draft saved on this device."));
    } catch {
      setError(m("Browser storage is unavailable. Export the draft instead."));
    }
  }
  function exportDraft() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "mythical-proposal-draft.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const visibleFields =
    step === 0 ? fields.slice(0, 2) : step === 1 ? fields.slice(2) : [];
  const issues = draftIssues(draft);
  function focusIssue(next: DraftIssue) {
    setIssue(next);
    setStep(next.step);
    setError(next.message);
    requestAnimationFrame(() => document.getElementById(next.field)?.focus());
  }
  function advance() {
    const next = issues.find((i) => i.step === step);
    if (next) {
      focusIssue(next);
      return;
    }
    setIssue(null);
    setError("");
    setStep(Math.min(3, step + 1));
  }
  function actionList() {
    return draft.actions.map((action, i) => (
      <div className="action-item" key={i}>
        <div className="section-top">
          <strong>{m("Action {number}", { number: i + 1 })}</strong>
          {step !== 3 && (
            <button
              aria-label={m("Remove action {number}", { number: i + 1 })}
              onClick={() =>
                update({ actions: draft.actions.filter((_, j) => j !== i) })
              }
            >
              {m("Remove")}
            </button>
          )}
        </div>
        <p>{actionSummary(action, config)}</p>
        <details>
          <summary>{m("Technical details")}</summary>
          <p>
            {m("Target")}: <AddressLink address={action.target} />
          </p>
          <p>
            {m("Native value")}: {amount(action.value)}
            {m("POL")}
          </p>
          <code className="calldata">{action.data}</code>
        </details>
      </div>
    ));
  }
  function budgetSummary() {
    return (
      <div className="budget-summary">
        <h3>{m("Configured payment summary")}</h3>
        {payments.length ? (
          <ul>
            {payments.map((p, i) => (
              <li key={i}>
                <strong>
                  {p!.quantity} {p!.symbol}
                </strong>{" "}
                → <AddressLink address={p!.recipient as Address} />
              </li>
            ))}
          </ul>
        ) : (
          <p>{m("No recognized treasury payment is configured.")}</p>
        )}
        {draft.actions.length > payments.length && (
          <p className="muted">
            {m(
              "Other contract actions require individual review. Their financial effects are not inferred.",
            )}
          </p>
        )}
        <p className="field-help">
          {m(
            "Compare this summary with the written budget. The portal does not interpret amounts in free text.",
          )}
        </p>
      </div>
    );
  }
  return (
    <div className="wizard">
      <PageHeading
        title={m("Create a proposal")}
        description={m(
          "Turn an idea into a decision members can review. Drafts stay on this device.",
        )}
      />
      <div className="wizard-tools">
        <button className="button" onClick={save}>
          {m("Save draft")}
        </button>
        <button className="button" onClick={exportDraft}>
          {m("Export")}
        </button>
        <label className="button file-label">
          {m("Import")}
          <input
            aria-label={m("Import draft")}
            type="file"
            accept="application/json"
            onChange={async (e) => {
              try {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 100_000)
                  throw new Error(m("File exceeds 100 KB."));
                setDraft(validateDraft(JSON.parse(await file.text())));
                setCoherent(false);
                setIssue(null);
                setStep(0);
                setError("");
                setMessage(m("Draft imported."));
                e.target.value = "";
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        </label>
        <p role="status">{message}</p>
      </div>
      <ol className="wizard-steps" aria-label={m("Proposal steps")}>
        {[
          m("Decision"),
          m("Plan"),
          draft.kind === "community" ? m("Choices") : m("Actions"),
          m("Review"),
        ].map((label, i) => (
          <li key={i}>
            <button
              aria-current={step === i ? "step" : undefined}
              onClick={() => {
                setStep(i);
                setIssue(null);
                setError("");
              }}
            >
              <span className="step-number">{i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>
      <section className="panel wizard-section" aria-label={m("Proposal form")}>
        {step === 0 && (
          <>
            <h2>{m("What should the DAO decide?")}</h2>
            <div className="segmented">
              <button
                aria-pressed={draft.kind === "executable"}
                className={draft.kind === "executable" ? "selected" : ""}
                onClick={() => update({ kind: "executable" })}
              >
                {m("Executable proposal")}
              </button>
              <button
                aria-pressed={draft.kind === "community"}
                className={draft.kind === "community" ? "selected" : ""}
                onClick={() => update({ kind: "community" })}
              >
                {m("Community ballot")}
              </button>
            </div>
            <Notice>
              {draft.kind === "community"
                ? t("advisoryNotice")
                : m(
                    "Executable proposals authorize the exact contract actions you configure. Written promises need separate accountability.",
                  )}
            </Notice>
            <label htmlFor="draft-title">{m("Proposal title")}</label>
            <input
              id="draft-title"
              maxLength={160}
              value={draft.title}
              aria-invalid={issue?.field === "draft-title"}
              onChange={(e) => update({ title: e.target.value })}
              placeholder={m("A clear, specific decision")}
            />
          </>
        )}
        {step === 1 && (
          <>
            <h2>{m("How will the decision be delivered?")}</h2>
            <p className="muted">
              {m(
                "Define acceptance criteria, measurable outcomes and the people responsible.",
              )}
            </p>
          </>
        )}
        {visibleFields.map((field) => (
          <div className="form-field" key={field}>
            <label htmlFor={fieldId(field)}>{m(field)}</label>
            <textarea
              id={fieldId(field)}
              rows={3}
              value={draft.sections[field]}
              aria-invalid={issue?.field === fieldId(field)}
              aria-describedby={fieldId(field) + "-help"}
              onChange={(e) =>
                update({
                  sections: { ...draft.sections, [field]: e.target.value },
                })
              }
            />
            <p className="field-help" id={fieldId(field) + "-help"}>
              {fieldHelp[field]}
            </p>
            {field === "Budget" &&
              draft.kind === "executable" &&
              budgetSummary()}
          </div>
        ))}
        {step === 0 && (
          <div className="form-field">
            <label htmlFor="draft-discussion">
              {m("External discussion link (optional)")}
            </label>
            <input
              id="draft-discussion"
              type="url"
              placeholder="https://"
              value={draft.discussion}
              aria-invalid={issue?.field === "draft-discussion"}
              onChange={(e) => update({ discussion: e.target.value })}
            />
          </div>
        )}
        {step === 2 && (
          <>
            <h2>
              {draft.kind === "community"
                ? m("Define the choices")
                : m("Define the executable actions")}
            </h2>
            <p className="muted">
              {draft.kind === "community"
                ? t("advisoryNotice")
                : m(
                    "Only encoded actions are automatically enforced. Review every amount and recipient.",
                  )}
            </p>
            {draft.kind === "community" ? (
              <>
                {draft.options.map((option, i) => (
                  <label key={i} htmlFor={"alternative-" + i}>
                    {m("Alternative {number}", { number: i + 1 })}
                    <div className="inline">
                      <input
                        id={"alternative-" + i}
                        aria-label={m("Alternative {number}", {
                          number: i + 1,
                        })}
                        value={option}
                        maxLength={160}
                        aria-invalid={issue?.field === "alternative-" + i}
                        onChange={(e) =>
                          update({
                            options: draft.options.map((o, j) =>
                              j === i ? e.target.value : o,
                            ),
                          })
                        }
                      />
                      <button
                        aria-label={m("Remove alternative {number}", {
                          number: i + 1,
                        })}
                        disabled={draft.options.length <= 2}
                        onClick={() =>
                          update({
                            options: draft.options.filter((_, j) => i !== j),
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  </label>
                ))}
                <button
                  className="button"
                  disabled={draft.options.length >= 20}
                  onClick={() => update({ options: [...draft.options, ""] })}
                >
                  {m("+ Add alternative")}
                </button>
                <p className="field-help">
                  {m("Abstention is always available.")}
                </p>
              </>
            ) : (
              <>
                <label htmlFor="action-template">
                  {m("Action template")}
                  <select
                    id="action-template"
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                  >
                    <option value="payment">{m("Treasury payment")}</option>
                    <option value="parameter">
                      {m("Governance parameter")}
                    </option>
                    <option value="advanced">
                      {m("Advanced contract action")}
                    </option>
                  </select>
                </label>
                {template === "advanced" ? (
                  <label>
                    {m("Actions JSON")}
                    <textarea
                      rows={6}
                      value={advanced}
                      onChange={(e) => setAdvanced(e.target.value)}
                      placeholder={m(
                        '[{"target":"0x…","value":"0","data":"0x…"}]',
                      )}
                    />
                    <span className="field-help">
                      {m(
                        "Advanced: exact targets, native values in wei and encoded calldata. Unknown calls remain uninterpreted.",
                      )}
                    </span>
                  </label>
                ) : (
                  <>
                    {template === "payment" ? (
                      <div className="field-grid">
                        <label>
                          {m("Recipient")}
                          <input
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                            placeholder={m("0x…")}
                          />
                        </label>
                        <label>
                          {m("Asset")}
                          <select
                            value={asset}
                            onChange={(e) => setAsset(e.target.value)}
                          >
                            <option>{m("POL")}</option>
                            <option>{m("WETH")}</option>
                            <option>{m("USDC.e")}</option>
                          </select>
                        </label>
                      </div>
                    ) : (
                      <label>
                        {m("Parameter")}
                        <select
                          value={parameter}
                          onChange={(e) => setParameter(e.target.value)}
                        >
                          <option value="setVotingDelay">
                            {m("Voting delay (blocks)")}
                          </option>
                          <option value="setVotingPeriod">
                            {m("Voting period (blocks)")}
                          </option>
                          <option value="setProposalThreshold">
                            {m("Proposal threshold (MANA wei)")}
                          </option>
                          <option value="updateQuorumNumerator">
                            {m("Quorum (%)")}
                          </option>
                        </select>
                      </label>
                    )}
                    <label>
                      {template === "payment" ? m("Amount") : m("New value")}
                      <input
                        inputMode="decimal"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                      />
                    </label>
                  </>
                )}
                <button className="button" onClick={addAction}>
                  {m("+ Add action")}
                </button>
                {actionList()}
                <Notice>{t("fundingNotice")}</Notice>
              </>
            )}
          </>
        )}
        {step === 3 && (
          <>
            <h2>{m("Review before publication")}</h2>
            <p>
              {m(
                "The text below is exactly what will be published. Existing on-chain proposals are never rewritten.",
              )}
            </p>
            <pre className="proposal-text" id="exact-text" tabIndex={0}>
              {description(draft)}
            </pre>
            {draft.kind === "community" ? (
              <>
                <h3>{m("Voting alternatives")}</h3>
                <ol>
                  {draft.options.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ol>
                <p>
                  {m(
                    "Plus abstention. The result does not authorize spending.",
                  )}
                </p>
              </>
            ) : (
              <>
                {budgetSummary()}
                {actionList()}
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={coherent}
                    onChange={(e) => setCoherent(e.target.checked)}
                  />
                  <span>
                    {m(
                      "I checked that the written budget and configured actions agree, including assets, amounts and recipients.",
                    )}
                  </span>
                </label>
              </>
            )}
            <Notice>
              {m(
                "Publication requires the current on-chain proposal threshold, verified network data and a successful wallet simulation. Initial threshold: 250 delegated MANA.",
              )}
            </Notice>
            {issues.length > 0 && (
              <div className="validation-summary">
                <h3>{m("Complete these fields before publishing")}</h3>
                <ul>
                  {issues.map((item, i) => (
                    <li key={i}>
                      <button
                        className="text-button"
                        onClick={() => focusIssue(item)}
                      >
                        {item.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              className="button primary full"
              disabled={
                !canSign ||
                tx.busy ||
                (draft.kind === "executable" && !coherent)
              }
              onClick={() => void publish()}
            >
              {m("Simulate & review publication")}
            </button>
            <ActionAvailability
              extra={
                draft.kind === "executable" && !coherent
                  ? m(
                      "Confirm that your written budget and configured actions agree.",
                    )
                  : null
              }
            />
          </>
        )}
        {error && (
          <p role="alert" className="error field-error">
            {error}
          </p>
        )}
        <div className="wizard-nav">
          {step > 0 && (
            <button
              className="button"
              onClick={() => {
                setStep(step - 1);
                setIssue(null);
                setError("");
              }}
            >
              {m("Back")}
            </button>
          )}
          {step < 3 && (
            <button className="button primary next-step" onClick={advance}>
              {m("Continue")}
              <Icon name="arrow" />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
const fieldHelp: Record<string, string> = {
  Problem: m("Describe the problem and who is affected."),
  Decision: m("State the exact decision members are being asked to approve."),
  Deliverables: m(
    "List deliverables and acceptance criteria. Explain how success will be measured.",
  ),
  Budget: m(
    "Specify assets, amounts, recipients and payment conditions. Compare them with the configured actions.",
  ),
  Owners: m("Name responsible people and how members can contact them."),
  Schedule: m("Give milestones, deadlines and dependencies."),
  Risks: m("Describe risks, assumptions and mitigations."),
  "Conflicts of interest": m("Disclose relevant interests and relationships."),
  Accountability: m(
    "Define progress reports, evidence of completion and success metrics.",
  ),
  Cancellation: m(
    "Explain when work can be canceled and how remaining funds will be handled.",
  ),
};
