import type { Health } from "../shared/domain";
import { m } from "./i18n";

const percentText = (value: number | null | undefined) =>
  value == null ? "—" : `${value.toFixed(2)}%`;
const blockText = (value: string) => BigInt(value).toLocaleString("en-US");

export function SyncStatus({ health }: { health?: Health }) {
  const sync = health?.sync;
  const failed = health?.status === "degraded";
  const label = !health
    ? m("Checking sync progress…")
    : !sync || sync.percent === null
      ? m("Sync status unavailable")
      : failed
        ? m("Retrying after an error")
        : sync.percent === 100
          ? m("Up to date")
          : m("Syncing in the background");
  return (
    <section className="sync-status" aria-label={m("History sync")}>
      <div className="sync-heading">
        <strong>{m("History sync")}</strong>
        <span className="sync-percent">{percentText(sync?.percent)}</span>
      </div>
      <progress
        className="sync-progress"
        max={100}
        value={sync?.percent ?? undefined}
        aria-label={m("Historical sync progress")}
        aria-valuetext={
          sync?.percent == null
            ? label
            : `${percentText(sync.percent)} — ${label}`
        }
      />
      <div className="sync-caption">
        <span className={failed ? "sync-error" : "muted"} role="status">
          {label}
        </span>
      </div>
      <details>
        <summary>{m("Sync details")}</summary>
        {health?.graphHistory?.status === "ready" && (
          <p className="muted" role="status">
            {m(
              "Governance history is supplemented by The Graph and verified against RPC providers.",
            )}{" "}
            {m("Verified through block {block}", {
              block: blockText(health.graphHistory.asOfBlock!),
            })}{" "}
            {m(
              "Full historical coverage is still being checked. The independent scan below continues.",
            )}
          </p>
        )}
        {health?.graphHistory &&
          ["stale", "fallback"].includes(health.graphHistory.status) && (
            <p className="muted" role="status">
              {m(
                "Supplemental history is unavailable. Showing the independent index while verification retries.",
              )}
            </p>
          )}

        <span className="muted">
          {sync?.updatedAt ? (
            <>
              {m("Last index update")}{" "}
              <time dateTime={new Date(sync.updatedAt).toISOString()}>
                {new Date(sync.updatedAt).toLocaleString("en-GB")}
              </time>
            </>
          ) : (
            m("No confirmed index update yet")
          )}
        </span>
        <p className="muted">
          {m(
            "Percentage of historical block ranges checked across all sources, from each contract’s start to the latest confirmed block. This is not an estimate of time remaining.",
          )}
        </p>
        {sync?.governancePercent != null && (
          <p>
            {m("Governance history")}
            {": "}
            <strong>{percentText(sync.governancePercent)}</strong>
          </p>
        )}
        <ul className="sync-sources">
          {sync?.sources.map((source) => (
            <li key={source.key}>
              <div className="sync-heading">
                <span>{source.label}</span>
                <strong>{percentText(source.percent)}</strong>
              </div>
              <small className="muted">
                {source.indexedBlock === null
                  ? m("Not started")
                  : m("Indexed through block {block}", {
                      block: blockText(source.indexedBlock),
                    })}
                {source.targetBlock !== null && (
                  <>
                    {" · "}
                    {m("Target {block}", {
                      block: blockText(source.targetBlock),
                    })}
                  </>
                )}
              </small>
            </li>
          ))}
        </ul>
        {failed && (
          <p className="sync-error">
            {health?.reason?.endsWith("_TIMEOUT")
              ? m(
                  "The index provider timed out. The scheduled service will retry from the last saved block.",
                )
              : m(
                  "The latest verification failed. Saved progress is preserved; the scheduled service will retry.",
                )}
          </p>
        )}
        <p className="muted">
          {m(
            "Runs on the server. You can close this page or turn off your computer.",
          )}
        </p>
      </details>
    </section>
  );
}
