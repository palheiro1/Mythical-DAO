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
import { t } from "./i18n";
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
  function update(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setMessage("Unsaved changes");
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
            "Configure a Governor deployment before adding this action.",
          );
        if (!/^\d+$/.test(value))
          throw new Error("Use an unsigned integer in contract units.");
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
            "Configure the new treasury before adding a payment.",
          );
        if (!isAddress(recipient) || recipient === zeroAddress)
          throw new Error("Enter a valid recipient.");
        const token =
          asset === "WETH"
            ? config.contracts.weth?.address
            : config.contracts.usdc?.address;
        const units = parseUnits(value, asset === "USDC.e" ? 6 : 18);
        if (units <= 0n) throw new Error("Amount must be positive.");
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
      if (!draft.title.trim() || fields.some((f) => !draft.sections[f].trim()))
        throw new Error("Complete the title and all proposal sections.");
      if (draft.discussion && !safeExternalUrl(draft.discussion))
        throw new Error("The discussion link must use HTTPS.");
      const text = description(draft);
      if (new TextEncoder().encode(text).length > 32768)
        throw new Error("Description exceeds 32 KB.");
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
          "Use 2–20 distinct alternatives, each at most 160 bytes.",
        );
      if (!community) validateActions(draft.actions);
      const target = community
        ? config.contracts.ballots?.address
        : config.contracts.governor?.address;
      if (!target) throw new Error("Contracts are not yet deployed.");
      await tx.review({
        title: community
          ? "Publish community ballot"
          : "Publish executable proposal",
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
          : "Publish immutable text and actions for members to vote on. Text commitments are not automatically enforced.",
        details: [
          { label: "Title", value: draft.title },
          {
            label: "Voting delay / period",
            value:
              "Initial rules: 41,143 / 288,000 blocks. Current rules are enforced by the contract.",
          },
          {
            label: community ? "Alternatives" : "Actions",
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
      setMessage("Draft saved on this device.");
    } catch {
      setError("Browser storage is unavailable. Export the draft instead.");
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
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">Make your voice actionable</span>
        <h1>Create a proposal</h1>
        <p>
          Write a clear decision. Give every member the context to participate.
        </p>
      </div>
      <div className="split-layout">
        <section className="panel">
          <div className="segmented">
            <button
              className={draft.kind === "executable" ? "selected" : ""}
              onClick={() => update({ kind: "executable" })}
            >
              Executable proposal
            </button>
            <button
              className={draft.kind === "community" ? "selected" : ""}
              onClick={() => update({ kind: "community" })}
            >
              Community ballot
            </button>
          </div>
          <label>
            Proposal title
            <input
              maxLength={160}
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="A clear, specific decision"
            />
          </label>
          {fields.map((field) => (
            <label key={field}>
              {field}
              <textarea
                rows={field === "Problem" || field === "Decision" ? 3 : 2}
                value={draft.sections[field]}
                onChange={(e) =>
                  update({
                    sections: { ...draft.sections, [field]: e.target.value },
                  })
                }
                placeholder={
                  field === "Budget"
                    ? "Include the asset, amount and payment recipient."
                    : field === "Cancellation"
                      ? "Explain when and how the work can be canceled."
                      : ""
                }
              />
            </label>
          ))}
          <label>
            External discussion link <span className="muted">(optional)</span>
            <input
              type="url"
              placeholder="https://"
              value={draft.discussion}
              onChange={(e) => update({ discussion: e.target.value })}
            />
          </label>
        </section>
        <aside className="stack">
          <section className="panel sticky">
            <span className="eyebrow">
              {draft.kind === "community"
                ? "Voting alternatives"
                : "On-chain actions"}
            </span>
            <h2>
              {draft.kind === "community"
                ? "Let members choose"
                : "Define the execution"}
            </h2>
            <p className="muted">
              {draft.kind === "community"
                ? t("advisoryNotice")
                : "Only the encoded actions below are enforced on-chain. Narrative commitments require accountability."}
            </p>
            {draft.kind === "community" ? (
              <>
                {draft.options.map((option, i) => (
                  <label key={i}>
                    Alternative {i + 1}
                    <div className="inline">
                      <input
                        aria-label={"Alternative " + (i + 1)}
                        value={option}
                        maxLength={160}
                        onChange={(e) =>
                          update({
                            options: draft.options.map((o, j) =>
                              j === i ? e.target.value : o,
                            ),
                          })
                        }
                      />
                      <button
                        aria-label={"Remove alternative " + (i + 1)}
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
                  + Add alternative
                </button>
                <p>Abstention is always available.</p>
              </>
            ) : (
              <>
                <label>
                  Action template
                  <select
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                  >
                    <option value="payment">Treasury payment</option>
                    <option value="parameter">Governance parameter</option>
                    <option value="advanced">Advanced calldata</option>
                  </select>
                </label>
                {template === "advanced" ? (
                  <label>
                    Actions JSON
                    <textarea
                      rows={6}
                      value={advanced}
                      onChange={(e) => setAdvanced(e.target.value)}
                      placeholder='[{"target":"0x…","value":"0","data":"0x…"}]'
                    />
                  </label>
                ) : (
                  <>
                    {template === "payment" ? (
                      <>
                        <label>
                          Recipient
                          <input
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                            placeholder="0x…"
                          />
                        </label>
                        <label>
                          Asset
                          <select
                            value={asset}
                            onChange={(e) => setAsset(e.target.value)}
                          >
                            <option>POL</option>
                            <option>WETH</option>
                            <option>USDC.e</option>
                          </select>
                        </label>
                      </>
                    ) : (
                      <label>
                        Parameter
                        <select
                          value={parameter}
                          onChange={(e) => setParameter(e.target.value)}
                        >
                          <option value="setVotingDelay">
                            Voting delay (blocks)
                          </option>
                          <option value="setVotingPeriod">
                            Voting period (blocks)
                          </option>
                          <option value="setProposalThreshold">
                            Proposal threshold (MANA wei)
                          </option>
                          <option value="updateQuorumNumerator">
                            Quorum (%)
                          </option>
                        </select>
                      </label>
                    )}
                    <label>
                      {template === "payment" ? "Amount" : "New value"}
                      <input
                        inputMode="decimal"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                      />
                    </label>
                  </>
                )}
                <button className="button full" onClick={addAction}>
                  + Add action
                </button>
                {draft.actions.map((action, i) => (
                  <div className="action-item" key={i}>
                    <div className="section-top">
                      <strong>Action {i + 1}</strong>
                      <button
                        aria-label={"Remove action " + (i + 1)}
                        onClick={() =>
                          update({
                            actions: draft.actions.filter((_, j) => j !== i),
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <code>{action.target}</code>
                    <p>Value: {formatNative(action.value)} POL</p>
                    <details>
                      <summary>Calldata</summary>
                      <code className="calldata">{action.data}</code>
                    </details>
                  </div>
                ))}
                <p className="notice">{t("fundingNotice")}</p>
              </>
            )}
            <details>
              <summary>Preview exact published text</summary>
              <pre className="proposal-text">{description(draft)}</pre>
            </details>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <p role="status">{message}</p>
            <button
              className="button primary full"
              disabled={!canSign || tx.busy}
              onClick={() => void publish()}
            >
              Simulate & review publication →
            </button>
            <div className="button-row">
              <button className="button" onClick={save}>
                Save draft
              </button>
              <button className="button" onClick={exportDraft}>
                Export
              </button>
              <label className="button file-label">
                Import
                <input
                  type="file"
                  accept="application/json"
                  onChange={async (e) => {
                    try {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 100_000)
                        throw new Error("File exceeds 100 KB.");
                      setDraft(validateDraft(JSON.parse(await file.text())));
                      setMessage("Draft imported.");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
              </label>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
function formatNative(value: string) {
  try {
    return (BigInt(value) / 10n ** 18n).toString();
  } catch {
    return value;
  }
}
