import { stringify, type ReadStatus } from "../shared/domain";
import { rpcFailureCode } from "./rpc";

type Cached<T> = { data: T; block: string; blockTimestamp?: number };
type Row = {
  payload: string | null;
  checked_at: number;
  lease_until: number;
  retry_after: number;
};
export type ReadResult<T> = { data: T; read: ReadStatus };
const MAX_AGE = 7 * 86_400_000;
const TTL = 60_000;
const safeReason = (error: unknown) =>
  error instanceof Error && /^[A-Z_]+$/.test(error.message)
    ? error.message
    : rpcFailureCode(error, "READ_REFRESH_FAILED");

/** Only public display data belongs here; transaction checks must always run live. */
export async function cachedRead<T>(
  env: Env,
  key: string,
  source: ReadStatus["source"],
  load: () => Promise<Cached<T>>,
): Promise<ReadResult<T>> {
  const read = () =>
    env.DAO_DB.prepare(
      "SELECT payload,checked_at,lease_until,retry_after FROM public_read_cache WHERE cache_key=?",
    )
      .bind(key)
      .first<Row>();
  let row = await read();
  const present = (
    saved: Row,
    forcedStale = false,
    reason?: string,
  ): ReadResult<T> | undefined => {
    const age = Date.now() - saved.checked_at;
    if (!saved.payload || age < 0 || age > MAX_AGE) return;
    try {
      const value = JSON.parse(saved.payload) as Cached<T>;
      const blockAge =
        value.blockTimestamp === undefined
          ? 0
          : Date.now() - value.blockTimestamp;
      return {
        data: value.data,
        read: {
          source,
          cached: true,
          status:
            forcedStale || age > TTL || blockAge > 180_000 || blockAge < -30_000
              ? "stale"
              : "fresh",
          asOfBlock: value.block,
          blockTimestamp: value.blockTimestamp,
          checkedAt: saved.checked_at,
          reason,
        },
      };
    } catch {
      return;
    }
  };
  if (row && Date.now() - row.checked_at < TTL) {
    const hit = present(row);
    if (hit) return hit;
  }
  const now = Date.now();
  // A persisted lease coalesces refreshes across Worker isolates and visitors.
  const lease = await env.DAO_DB.prepare(
    `
    INSERT INTO public_read_cache(cache_key,lease_until) VALUES(?,?)
    ON CONFLICT(cache_key) DO UPDATE SET lease_until=excluded.lease_until
    WHERE public_read_cache.lease_until<=? AND public_read_cache.retry_after<=?
      AND (public_read_cache.payload IS NULL OR public_read_cache.checked_at<=?)
    RETURNING cache_key
  `,
  )
    .bind(key, now + 90_000, now, now, now - TTL)
    .first();
  if (!lease) {
    row = await read();
    if (row) {
      const saved = present(
        row,
        true,
        row.retry_after > now ? "READ_RETRY_PENDING" : "READ_REFRESHING",
      );
      if (saved) return saved;
    }
    // Cold requests arriving together briefly wait for the owner, without
    // multiplying Graph queries. No module-level promises or request I/O.
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      row = await read();
      if (row) {
        const saved = present(row);
        if (saved) return saved;
        if (row.retry_after > Date.now()) break;
      }
    }
    throw Error("READ_REFRESH_PENDING");
  }
  try {
    const value = await load();
    const payload = stringify(value);
    if (new TextEncoder().encode(payload).length > 1_500_000)
      throw Error("READ_CACHE_TOO_LARGE");
    const checkedAt = Date.now();
    await env.DAO_DB.prepare(
      "UPDATE public_read_cache SET payload=?,checked_at=?,lease_until=0,retry_after=0 WHERE cache_key=? AND lease_until=?",
    )
      .bind(payload, checkedAt, key, now + 90_000)
      .run();
    const result = present({
      payload,
      checked_at: checkedAt,
      lease_until: 0,
      retry_after: 0,
    })!;
    result.read.cached = false;
    return result;
  } catch (error) {
    await env.DAO_DB.prepare(
      "UPDATE public_read_cache SET lease_until=0,retry_after=? WHERE cache_key=? AND lease_until=?",
    )
      .bind(Date.now() + 30_000, key, now + 90_000)
      .run();
    const reason = safeReason(error);
    console.warn(
      JSON.stringify({ event: "public_read_refresh_failed", source, reason }),
    );
    if (row) {
      const saved = present(row, true, reason);
      if (saved) return saved;
    }
    throw Error(reason);
  }
}

export async function reserveGraphRead(env: Env) {
  // Leaves headroom under the existing free allowance for comparisons/manual
  // queries. Only a refresh owner can spend; every actual request is reserved.
  const period = new Date().toISOString().slice(0, 7);
  const reserved = await env.DAO_DB.prepare(
    `
    INSERT INTO public_read_budget(provider,period,requests) VALUES('graph',?,1)
    ON CONFLICT(provider) DO UPDATE SET period=excluded.period,
      requests=CASE WHEN public_read_budget.period=excluded.period THEN public_read_budget.requests+1 ELSE 1 END
    WHERE public_read_budget.period<>excluded.period OR public_read_budget.requests<90000
    RETURNING requests
  `,
  )
    .bind(period)
    .first();
  if (!reserved) throw Error("GRAPH_READ_BUDGET_EXHAUSTED");
}
