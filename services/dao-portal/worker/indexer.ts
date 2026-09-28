import { decodeEventLog, type Address, type PublicClient } from "viem";
import { allEvents } from "../shared/abis";
import { stringify, type PortalConfig } from "../shared/domain";
import { config } from "./config";
import { agreed, clients, commonHead, RpcFault } from "./rpc";
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
    cfg.contracts.weth?.address,
    cfg.contracts.usdc?.address,
  ].includes(address.toLowerCase() as Address);
  if (!transferAsset) return true;
  const treasuries = [
    cfg.contracts.vault?.address,
    cfg.contracts.legacyGovernor?.address,
  ].filter(Boolean);
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
  try {
    const cfg = config(env),
      pair = clients(env),
      { confirmed } = await commonHead(pair, cfg);
    const span = Math.max(
      1,
      Math.min(5000, Number(env.INDEX_BATCH_BLOCKS) || 1000),
    );
    for (const [role, entry] of Object.entries(cfg.contracts)) {
      // Basket token Transfer logs are filtered to the vault/legacy treasury at the RPC layer.
      if (Date.now() / 1000 > now + 160) break;
      const address = entry.address,
        start = Number(entry.startBlock);
      let cursor = await db
        .prepare(
          "SELECT block_number,block_hash FROM cursors WHERE chain_id=? AND contract=?",
        )
        .bind(cfg.chainId, address)
        .first<Checkpoint>();
      if (
        cursor &&
        (await hashAt(pair, cursor.block_number)) !== cursor.block_hash
      ) {
        const points = await db
          .prepare(
            "SELECT block_number,block_hash FROM checkpoints WHERE chain_id=? AND contract=? AND block_number<? ORDER BY block_number DESC LIMIT 20",
          )
          .bind(cfg.chainId, address, cursor.block_number)
          .all<Checkpoint>();
        let ancestor: Checkpoint | undefined;
        for (const p of points.results) {
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
              "DELETE FROM events WHERE chain_id=? AND contract=? AND block_number>?",
            )
            .bind(cfg.chainId, address, rollback),
          db
            .prepare(
              "DELETE FROM checkpoints WHERE chain_id=? AND contract=? AND block_number>?",
            )
            .bind(cfg.chainId, address, rollback),
          db
            .prepare("DELETE FROM cursors WHERE chain_id=? AND contract=?")
            .bind(cfg.chainId, address),
          ...(ancestor
            ? [
                db
                  .prepare("INSERT INTO cursors VALUES(?,?,?,?,?)")
                  .bind(
                    cfg.chainId,
                    address,
                    ancestor.block_number,
                    ancestor.block_hash,
                    Date.now(),
                  ),
              ]
            : []),
        ]);
        cursor = ancestor ?? null;
      }
      const from = cursor ? cursor.block_number + 1 : start,
        to = Math.min(from + span - 1, Number(confirmed));
      if (to < from) {
        await db.batch([
          guard(),
          db
            .prepare(
              "UPDATE cursors SET updated_at=? WHERE chain_id=? AND contract=?",
            )
            .bind(Date.now(), cfg.chainId, address),
        ]);
        continue;
      }
      const endHash = await hashAt(pair, to);
      // Token contracts can have a very large global transfer volume. Query only transfers touching DAO accounts.
      const logs = await agreed(pair, async (c) => {
        if (role === "weth" || role === "usdc") {
          const accounts = [
            cfg.contracts.vault?.address,
            cfg.contracts.legacyGovernor?.address,
          ].filter((x): x is Address => !!x);
          const transfer = allEvents.find((e) => e.name === "Transfer")!;
          const sets = await Promise.all(
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
              sets.flat().map((l) => [l.transactionHash + ":" + l.logIndex, l]),
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
          .bind(cfg.chainId, address, to, endHash),
      );
      statements.push(
        db
          .prepare("INSERT OR REPLACE INTO cursors VALUES(?,?,?,?,?)")
          .bind(cfg.chainId, address, to, endHash, Date.now()),
      );
      await db.batch(statements);
    }
    await db.batch([
      guard(),
      db
        .prepare("INSERT OR REPLACE INTO index_health VALUES(1,?,?,NULL)")
        .bind("ok", Date.now()),
    ]);
    return { skipped: false, confirmedHead: confirmed.toString() };
  } catch (error) {
    const reason = error instanceof RpcFault ? error.code : "INDEX_READ_FAILED";
    await db
      .prepare("INSERT OR REPLACE INTO index_health VALUES(1,?,?,?)")
      .bind("degraded", Date.now(), reason)
      .run();
    console.error(JSON.stringify({ event: "index_failed", reason }));
    return { skipped: false, error: reason };
  } finally {
    await db.prepare("DELETE FROM index_lock WHERE owner=?").bind(owner).run();
  }
}
