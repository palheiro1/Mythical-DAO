import { useState } from "react";
import { api } from "./api";
import { m } from "./i18n";
import { ErrorNotice } from "./ui";
import type { Proposal } from "../shared/domain";
export function RecoverProposal() {
  const [hash, setHash] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <details className="panel">
      <summary>{m("Find a proposal missing from the history")}</summary>
      <p>
        {m(
          "Enter its creation transaction hash. The receipt is verified directly on Polygon without waiting for historical synchronization.",
        )}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const p = await api<Proposal>("proposals/resolve", {
              transactionHash: hash.trim(),
            });
            location.hash = "proposal/" + p.contract + "/" + p.id;
          } catch (e) {
            setError(
              e instanceof Error ? e.message : m("Data could not be verified."),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          {m("Creation transaction hash")}
          <input
            required
            pattern="0x[0-9a-fA-F]{64}"
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            placeholder="0x…"
          />
        </label>
        <button className="button" disabled={busy}>
          {busy ? m("Checking current state…") : m("Find proposal")}
        </button>
      </form>
      {error && <ErrorNotice error={error} />}
    </details>
  );
}
