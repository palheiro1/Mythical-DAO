import { decodeEventLog, type Address, type PublicClient } from "viem";
import { allEvents } from "../shared/abis";
import { stringify, type PortalConfig } from "../shared/domain";
import { config } from "./config";
import { agreed, commonHead, RpcFault, settledValues } from "./rpc";
import { indexClients } from "./infura";
import { indexSources } from "../shared/sync";
import { scheduleSources } from "./index-schedule";
import {
  initialBatch,
  failedBatch,
  successfulBatch,
  rangeFailure,
  type BatchState,
} from "./index-batch";
type Checkpoint = { block_number: number; block_hash: string };
export function rewindPoint(
  points: Checkpoint[],
  canonical: Map<number, string>,
): Checkpoint | undefined {
  return points.find((p) => canonical.get(p.block_number) === p.block_hash);
}
export function relevantLog(
  address: string,
  args: Record<string, unknown>,
  cfg: PortalConfig,
): boolean {
  const transferAsset = [
    cfg.contracts.gem?.address,
    cfg.contracts.usdcNative?.address,
    cfg.contracts.usdcBridged?.address,
    cfg.contracts.weth?.address,
    cfg.contracts.usdc?.address,
  ].includes(address.toLowerCase() as Address);
  if (!transferAsset) return true;
  const treasuries = [
    cfg.contracts.treasury?.address,
    cfg.contracts.vault?.address,
    cfg.contracts.legacyGovernor?.address,
  ].filter(Boolean);
  if ("owner" in args || "spender" in args)
    return (
      treasuries.includes(String(args.owner).toLowerCase() as Address) &&
      String(args.spender).toLowerCase() ===
        cfg.contracts.ragequitModule?.address
    );
  return ["from", "to"].some((k) =>
    treasuries.includes(String(args[k]).toLowerCase() as Address),
  );
}
async function hashAt(pair: [PublicClient, PublicClient], block: number) {
  return agreed(
    pair,
    async (c) => (await c.getBlock({ blockNumber: BigInt(block) })).hash,
  );
}
export async function indexChain(env: Env) {
  const owner = crypto.randomUUID(),
    db = env.DAO_DB,
    now = Math.floor(Date.now() / 1000);
  const lock = await db
    .prepare(
      "INSERT INTO index_lock(id,owner,expires_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE index_lock.expires_at<?",
    )
    .bind(owner, now + 240, now)
    .run();
  if (!lock.meta.changes) return { skipped: true };
  const guard = () =>
    db.prepare("INSERT INTO lease_guard(owner) VALUES(?)").bind(owner);
  const deadline = Date.now() + 160_000;
  const checkTime = () => {
    if (Date.now() >= deadline) throw new RpcFault("INDEX_RUN_BUDGET");
  };
  let phase = "read-head";
  let currentSource: string | undefined;
  let chainId: number | undefined;
  const deferred: string[] = [];
  try {
    const cfg = config(env),
      session = indexClients(env, owner),
      pair = session.pair,
      { confirmed } = await commonHead(pair, cfg);
    const span = Math.max(
      1,
      Math.min(5000, Math.floor(Number(env.INDEX_BATCH_BLOCKS) || 1000)),
    );
    chainId = cfg.chainId;
    const allSources = indexSources(cfg);
    const sourceLimit = Math.max(
      1,
      Math.min(
        allSources.length,
        Math.floor(Number(env.INDEX_SOURCES_PER_RUN) || allSources.length),
      ),
    );
    const lastRuns = await db
      .prepare(
        "SELECT source_key,started_at FROM index_source_runs WHERE chain_id=?",
      )
      .bind(cfg.chainId)
      .all<{ source_key: string; started_at: number }>();
    const sources = scheduleSources(
      allSources.filter((source) => BigInt(source.startBlock) <= confirmed),
      new Map(lastRuns.results.map((row) => [row.source_key, row.started_at])),
      sourceLimit,
    );
    sourcesLoop: for (const entry of sources) {
      checkTime();
      const { address, role, key: cursorKey, approvals } = entry;
      currentSource = cursorKey;
      await db.batch([
        guard(),
        db
          .prepare(
            "INSERT OR REPLACE INTO index_source_runs VALUES(?,?,?,NULL,'INDEX_SOURCE_RUNNING')",
          )
          .bind(cfg.chainId, cursorKey, Date.now()),
      ]);
      const finishSource = (reason: string | null = null) =>
        db
          .prepare(
            "UPDATE index_source_runs SET finished_at=?,reason=? WHERE chain_id=? AND source_key=?",
          )
          .bind(Date.now(), reason, cfg.chainId, cursorKey);
      session.state.background = ![
        cfg.contracts.governor?.address,
        cfg.contracts.mana?.address,
      ].includes(address);
      phase = `read-source:${role}`;
      const start = Number(entry.startBlock);
      let cursor = await db
        .prepare(
          "SELECT block_number,block_hash FROM cursors WHERE chain_id=? AND contract=?",
        )
        .bind(cfg.chainId, cursorKey)
        .first<Checkpoint>();
      if (
        cursor &&
        (await hashAt(pair, cursor.block_number)) !== cursor.block_hash
      ) {
        const points = await db
          .prepare(
            "SELECT block_number,block_hash FROM checkpoints WHERE chain_id=? AND contract=? AND block_number<? ORDER BY block_number DESC LIMIT 20",
          )
          .bind(cfg.chainId, cursorKey, cursor.block_number)
          .all<Checkpoint>();
        let ancestor: Checkpoint | undefined;
        for (const p of points.results) {
          checkTime();
          if ((await hashAt(pair, p.block_number)) === p.block_hash) {
            ancestor = p;
            break;
          }
        }
        const rollback = ancestor?.block_number ?? start - 1;
        await db.batch([
          guard(),
          db
            .prepare(
              "DELETE FROM events WHERE chain_id=? AND contract=? AND block_number>?" +
                (approvals
                  ? " AND event_name='Approval' AND lower(json_extract(args_json,'$.owner'))=? AND lower(json_extract(args_json,'$.spender'))=?"
                  : [
                        "gem",
                        "weth",
                        "usdc",
                        "usdcNative",
                        "usdcBridged",
                      ].includes(role)
                    ? " AND event_name!='Approval'"
                    : ""),
            )
            .bind(
              cfg.chainId,
              address,
              rollback,
              ...(approvals
                ? [
                    cfg.contracts.treasury!.address,
                    cfg.contracts.ragequitModule!.address,
                  ]
                : []),
            ),
          db
            .prepare(
              "DELETE FROM checkpoints WHERE chain_id=? AND contract=? AND block_number>?",
            )
            .bind(cfg.chainId, cursorKey, rollback),
          db
            .prepare("DELETE FROM cursors WHERE chain_id=? AND contract=?")
            .bind(cfg.chainId, cursorKey),
          ...(ancestor
            ? [
                db
                  .prepare("INSERT INTO cursors VALUES(?,?,?,?,?)")
                  .bind(
                    cfg.chainId,
                    cursorKey,
                    ancestor.block_number,
                    ancestor.block_hash,
                    Date.now(),
                  ),
              ]
            : []),
        ]);
        cursor = ancestor ?? null;
      }
      const from = cursor ? cursor.block_number + 1 : start;
      if (Number(confirmed) < from) {
        await db.batch([
          guard(),
          db
            .prepare(
              "UPDATE cursors SET updated_at=? WHERE chain_id=? AND contract=?",
            )
            .bind(Date.now(), cfg.chainId, cursorKey),
          finishSource(),
        ]);
        continue;
      }
      let tuning = initialBatch(
        await db
          .prepare(
            "SELECT span,successes,failures FROM index_adaptive WHERE chain_id=? AND source_key=?",
          )
          .bind(cfg.chainId, cursorKey)
          .first<BatchState>(),
        span,
      );
      const tuningStatement = (
        state: BatchState,
        duration: number,
        reason: string | null,
      ) =>
        db
          .prepare(
            "INSERT OR REPLACE INTO index_adaptive VALUES(?,?,?,?,?,?,?,?)",
          )
          .bind(
            cfg.chainId,
            cursorKey,
            state.span,
            state.successes,
            state.failures,
            duration,
            reason,
            Date.now(),
          );
      for (let attempt = 0; ; attempt++) {
        checkTime();
        const to = Math.min(from + tuning.span - 1, Number(confirmed));
        const attempted = to - from + 1;
        phase = `read-end-hash:${role}`;
        const endHash = await hashAt(pair, to);
        checkTime();
        phase = `read-logs:${role}`;
        const started = Date.now();
        const readLogs = async () => {
          // Token contracts can have a very large global transfer volume. Query only transfers touching DAO accounts.
          const logs = await agreed(pair, async (c) => {
            if (approvals)
              return c.getLogs({
                address,
                event: allEvents.find((e) => e.name === "Approval")!,
                args: {
                  owner: cfg.contracts.treasury!.address,
                  spender: cfg.contracts.ragequitModule!.address,
                },
                fromBlock: BigInt(from),
                toBlock: BigInt(to),
              });

            if (
              ["gem", "weth", "usdc", "usdcNative", "usdcBridged"].includes(
                role,
              )
            ) {
              const accounts = [
                ...new Set(
                  [
                    cfg.contracts.treasury?.address,
                    cfg.contracts.vault?.address,
                    cfg.contracts.legacyGovernor?.address,
                  ].filter((x): x is Address => !!x),
                ),
              ];
              const transfer = allEvents.find((e) => e.name === "Transfer")!;
              const sets = await settledValues(
                accounts.flatMap((account) => [
                  c.getLogs({
                    address,
                    event: transfer,
                    args: { from: account },
                    fromBlock: BigInt(from),
                    toBlock: BigInt(to),
                  }),
                  c.getLogs({
                    address,
                    event: transfer,
                    args: { to: account },
                    fromBlock: BigInt(from),
                    toBlock: BigInt(to),
                  }),
                ]),
              );
              return [
                ...new Map(
                  sets
                    .flat()
                    .map((l) => [l.transactionHash + ":" + l.logIndex, l]),
                ).values(),
              ]
                .sort(
                  (a, b) =>
                    Number(a.blockNumber! - b.blockNumber!) ||
                    a.logIndex! - b.logIndex!,
                )
                .map((l) => ({
                  address: l.address,
                  blockNumber: l.blockNumber,
                  blockHash: l.blockHash,
                  transactionHash: l.transactionHash,
                  logIndex: l.logIndex,
                  data: l.data,
                  topics: l.topics,
                }));
            }
            return (
              await c.getLogs({
                address,
                fromBlock: BigInt(from),
                toBlock: BigInt(to),
              })
            ).map((l) => ({
              address: l.address,
              blockNumber: l.blockNumber,
              blockHash: l.blockHash,
              transactionHash: l.transactionHash,
              logIndex: l.logIndex,
              data: l.data,
              topics: l.topics,
            }));
          });
          if (logs.length > 500)
            throw new RpcFault("INDEX_BATCH_TOO_DENSE_REDUCE_RANGE");
          return logs;
        };
        let logs;
        try {
          logs = await readLogs();
        } catch (error) {
          const reason = rangeFailure(error);
          if (!reason) throw error;
          tuning = failedBatch(tuning, attempted, reason, span);
          await db.batch([
            guard(),
            tuningStatement(tuning, Date.now() - started, reason),
          ]);
          console.warn(
            JSON.stringify({
              event: "index_batch_reduced",
              source: cursorKey,
              from,
              to,
              nextSpan: tuning.span,
              reason,
              attempt: attempt + 1,
            }),
          );
          // At most one smaller retry per source/run. All provider I/O has settled.
          // The unchanged 'from' is retried now or in the next cron invocation.
          if (attempt === 0 && tuning.span < attempted && Date.now() < deadline)
            continue;
          await db.batch([guard(), finishSource(reason)]);
          deferred.push(reason);
          continue sourcesLoop;
        }
        const duration = Date.now() - started;
        checkTime();
        phase = `verify-end-hash:${role}`;
        if ((await hashAt(pair, to)) !== endHash)
          throw new RpcFault("REORG_DURING_BATCH");
        const statements = [guard()];
        for (const log of logs) {
          let event;
          try {
            event = decodeEventLog({
              abi: allEvents,
              data: log.data,
              topics: log.topics,
            });
          } catch {
            continue;
          }
          const args = event.args as Record<string, unknown>;
          if (!relevantLog(address, args, cfg)) continue;
          statements.push(
            db
              .prepare("INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?,?,?)")
              .bind(
                cfg.chainId,
                address,
                Number(log.blockNumber),
                log.blockHash,
                log.transactionHash,
                log.logIndex,
                event.eventName,
                stringify(args),
              ),
          );
        }
        // D1 batch is transactional: the cursor cannot advance without all corresponding events.
        statements.push(
          db
            .prepare("INSERT OR REPLACE INTO checkpoints VALUES(?,?,?,?)")
            .bind(cfg.chainId, cursorKey, to, endHash),
        );
        statements.push(finishSource());
        statements.push(
          db
            .prepare("INSERT OR REPLACE INTO cursors VALUES(?,?,?,?,?)")
            .bind(cfg.chainId, cursorKey, to, endHash, Date.now()),
        );
        statements.push(
          tuningStatement(
            successfulBatch(tuning, attempted, duration, span),
            duration,
            null,
          ),
        );
        phase = `persist-source:${role}`;
        await db.batch(statements);
        console.info(
          JSON.stringify({
            event: "index_batch_committed",
            source: cursorKey,
            from,
            to,
            logs: logs.length,
            durationMs: duration,
            attempts: attempt + 1,
          }),
        );
        break;
      }
    }
    await db.batch([
      guard(),
      db
        .prepare("INSERT OR REPLACE INTO index_health VALUES(1,?,?,?)")
        .bind(
          deferred.length ? "degraded" : "ok",
          Date.now(),
          deferred[0] ?? null,
        ),
    ]);
    return {
      skipped: false,
      confirmedHead: confirmed.toString(),
      ...(deferred.length ? { error: deferred[0] } : {}),
    };
  } catch (error) {
    const reason = error instanceof RpcFault ? error.code : "INDEX_READ_FAILED";
    if (currentSource && chainId !== undefined)
      await db
        .prepare(
          "UPDATE index_source_runs SET finished_at=?,reason=? WHERE chain_id=? AND source_key=? AND EXISTS(SELECT 1 FROM index_lock WHERE id=1 AND owner=? AND expires_at>unixepoch())",
        )
        .bind(Date.now(), reason, chainId, currentSource, owner)
        .run();
    if (
      ["INFURA_GOVERNANCE_BUDGET_RESERVED", "INDEX_RUN_BUDGET"].includes(reason)
    ) {
      await db.batch([
        guard(),
        db
          .prepare("INSERT OR REPLACE INTO index_health VALUES(1,?,?,?)")
          .bind(
            deferred.length ? "degraded" : "ok",
            Date.now(),
            deferred[0] ?? reason,
          ),
      ]);
      return { skipped: false, deferred: reason };
    }
    await db
      .prepare(
        "INSERT OR REPLACE INTO index_health SELECT 1,?,?,? WHERE EXISTS(SELECT 1 FROM index_lock WHERE id=1 AND owner=? AND expires_at>unixepoch())",
      )
      .bind("degraded", Date.now(), reason, owner)
      .run();
    // Log the operation and concise provider/SQL error, never RPC URLs or request bodies.
    const fault = error as {
      shortMessage?: string;
      details?: string;
      message?: string;
    };
    const detail = (
      fault.details ??
      fault.shortMessage ??
      fault.message ??
      "Unknown error"
    )
      .split("\n")[0]
      .replace(/https?:\/\/\S+/g, "[provider]")
      .slice(0, 300);
    console.error(
      JSON.stringify({ event: "index_failed", reason, phase, detail }),
    );
    return { skipped: false, error: reason };
  } finally {
    await db.prepare("DELETE FROM index_lock WHERE owner=?").bind(owner).run();
  }
}
