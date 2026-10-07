import { http } from "viem";
import { timedBoundedFetch, clients, RpcFault } from "./rpc";

const DAY = 86_400_000;
// One request per 1.1 seconds stays below Free's 500 credits/second even for
// two adjacent eth_estimateGas requests (300 each), spaced across seconds. No JSON-RPC batches or retries.
const INTERVAL = 1_100;
const DEFAULT_DAILY_CREDITS = 2_400_000;
const COSTS: Record<string, number> = {
  eth_chainId: 5,
  eth_call: 80,
  eth_estimateGas: 300,
  eth_gasPrice: 80,
  eth_blockNumber: 80,
  eth_getBlockByNumber: 80,
  eth_getLogs: 255,
};

export function infuraUrl(key: string | undefined): string {
  // An API key, never a URL/secret pair. Polygon is fixed to the configured chain.
  if (!key || !/^[a-zA-Z0-9_-]{16,128}$/.test(key))
    throw new RpcFault("INFURA_API_KEY_MISSING_OR_INVALID");
  return `https://polygon-mainnet.infura.io/v3/${key}`;
}
export function infuraDailyLimit(value?: string): number {
  const limit = value ? Number(value) : DEFAULT_DAILY_CREDITS;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 255 ||
    limit > DEFAULT_DAILY_CREDITS
  )
    throw new RpcFault("INFURA_INVALID_DAILY_BUDGET");
  return limit;
}
type Quota = {
  day: string;
  credits: number;
  requests: number;
  not_before: number;
  blocked_until: number;
};
type Clock = { now(): number; sleep(ms: number): Promise<void> };
const clock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class InfuraQuota {
  private cached: Quota | null | undefined;
  constructor(
    private db: D1Database,
    private owner: string | null,
    private limit: number,
    private time: Clock = clock,
    private background: () => boolean = () => false,
  ) {}
  async reserve(method: string): Promise<void> {
    const cost = COSTS[method];
    // Fail closed if indexing starts using a method whose price isn't accounted for.
    if (!cost) throw new RpcFault("INFURA_UNBUDGETED_METHOD");
    for (;;) {
      const now = this.time.now(),
        day = new Date(now).toISOString().slice(0, 10);
      // Reserve enough for one head check + Governor/MANA batch each minute
      // through midnight (normally 1,235 credits). Asset history uses the rest.
      const reservedForGovernance = this.background()
        ? Math.ceil(((Math.floor(now / DAY) + 1) * DAY - now) / 60_000) * 1_250
        : 0;
      const available = Math.max(0, this.limit - reservedForGovernance);
      // Reuse request-local quota state, not I/O handles. The conditional write
      // below still checks the live lease, quota and cooldown on every dispatch.
      if (this.cached === undefined) await this.refresh();
      const state = this.cached;
      if (state && state.blocked_until > now)
        throw new RpcFault("INFURA_PROVIDER_COOLDOWN");
      if (state?.day === day && state.credits + cost > this.limit)
        throw new RpcFault("INFURA_DAILY_BUDGET_EXHAUSTED");
      if ((state?.day === day ? state.credits : 0) + cost > available)
        throw new RpcFault("INFURA_GOVERNANCE_BUDGET_RESERVED");
      if (state && state.not_before > now) {
        await this.time.sleep(Math.min(INTERVAL, state.not_before - now));
        continue;
      }
      // Reserve before dispatch. Failed requests remain charged conservatively.
      // The conditional upsert also prevents races if two clients share this budget.
      const reserved = await this.db
        .prepare(
          `
        INSERT INTO rpc_quota(provider,day,credits,requests,not_before,blocked_until)
        SELECT 'infura',?,?,1,?,0
        WHERE (? IS NULL OR EXISTS(SELECT 1 FROM index_lock WHERE id=1 AND owner=? AND expires_at>unixepoch()))
        ON CONFLICT(provider) DO UPDATE SET
          day=excluded.day,
          credits=CASE WHEN rpc_quota.day=excluded.day THEN rpc_quota.credits ELSE 0 END+excluded.credits,
          requests=CASE WHEN rpc_quota.day=excluded.day THEN rpc_quota.requests ELSE 0 END+1,
          not_before=excluded.not_before
        WHERE rpc_quota.not_before<=? AND rpc_quota.blocked_until<=?
          AND (CASE WHEN rpc_quota.day=excluded.day THEN rpc_quota.credits ELSE 0 END)+excluded.credits<=?
        RETURNING day,credits,requests,not_before,blocked_until
      `,
        )
        .bind(
          day,
          cost,
          now + INTERVAL,
          this.owner,
          this.owner,
          now,
          now,
          available,
        )
        .first<Quota>();
      if (reserved) {
        this.cached = reserved;
        return;
      }
      // Another client may have reserved credit or installed a cooldown since
      // our cached read. Reload before retrying; an expired lease fails closed.
      await this.refresh();
    }
  }
  private async refresh(): Promise<void> {
    if (this.owner === null) {
      this.cached = await this.db
        .prepare(
          "SELECT day,credits,requests,not_before,blocked_until FROM rpc_quota WHERE provider='infura'",
        )
        .first<Quota>();
      return;
    }
    const row = await this.db
      .prepare(
        "SELECT q.day,q.credits,q.requests,q.not_before,q.blocked_until FROM index_lock l LEFT JOIN rpc_quota q ON q.provider='infura' WHERE l.id=1 AND l.owner=? AND l.expires_at>unixepoch()",
      )
      .bind(this.owner)
      .first<Quota>();
    if (!row) throw new RpcFault("INDEX_LEASE_EXPIRED");
    this.cached = row.day ? row : null;
  }
  async block(daily: boolean): Promise<void> {
    const now = this.time.now();
    const until = daily ? (Math.floor(now / DAY) + 1) * DAY : now + 60_000;
    await this.db
      .prepare(
        "UPDATE rpc_quota SET blocked_until=MAX(blocked_until,?) WHERE provider='infura'",
      )
      .bind(until)
      .run();
    this.cached = undefined;
  }
}

export function infuraTransport(
  url: string,
  quota: InfuraQuota,
): ReturnType<typeof http> {
  const provider = http(url, {
    batch: false,
    retryCount: 0,
    timeout: 25_000,
    fetchFn: (input, init) => timedBoundedFetch(input, init, 25_000),
  });
  return (options) => {
    const transport = provider(options);
    let queue: Promise<void> = Promise.resolve();
    const request: typeof transport.request = async (args, requestOptions) => {
      const previous = queue;
      let release = () => {};
      queue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        await quota.reserve(args.method);
        const started = Date.now();
        try {
          return await transport.request(args, {
            ...requestOptions,
            retryCount: 0,
          });
        } catch (error) {
          const diagnostic = infuraFailure(error, url);
          console.error(
            JSON.stringify({
              event: "infura_request_failed",
              method: args.method,
              durationMs: Date.now() - started,
              ...diagnostic,
            }),
          );
          for (
            let cause: unknown = error, depth = 0;
            cause && depth < 8;
            depth++
          ) {
            if (typeof cause !== "object") break;
            const item = cause as {
              status?: number;
              code?: number;
              cause?: unknown;
            };
            if (
              item.status === 402 ||
              item.status === 429 ||
              item.code === -33000 ||
              item.code === -33200
            ) {
              const daily = item.status === 402 || item.code === -33000;
              await quota.block(daily);
              throw new RpcFault(
                daily
                  ? "INFURA_PROVIDER_DAILY_LIMIT"
                  : "INFURA_PROVIDER_RATE_LIMIT",
              );
            }
            cause = item.cause;
          }
          // Provider errors may include the key in their URL. Return only a safe code.
          throw new RpcFault(diagnostic.reason);
        }
      } finally {
        release();
      }
    };
    return { ...transport, config: { ...transport.config, request }, request };
  };
}

// Keep useful provider evidence in operational logs without URLs, credentials,
// request bodies or stack traces. Public responses only receive the reason code.
export function infuraFailure(error: unknown, url: string) {
  const key = new URL(url).pathname.split("/").at(-1)!;
  const safe = (value: string, max: number) =>
    value
      .replaceAll(key, "[redacted]")
      .replace(/https?:\/\/[^\s"'<>]+/g, "[provider]")
      .split("\n")[0]
      .slice(0, max);
  const causes: {
    name: string;
    status?: number;
    code?: number;
    detail: string;
  }[] = [];
  let timeout = false,
    rangeLimit = false;
  for (let cause: unknown = error, depth = 0; cause && depth < 8; depth++) {
    if (typeof cause !== "object") break;
    const item = cause as {
      name?: string;
      status?: number;
      code?: string | number;
      shortMessage?: string;
      details?: string;
      message?: string;
      cause?: unknown;
    };
    const detail = item.details ?? item.shortMessage ?? item.message ?? "";
    timeout ||= /timeout|timed out/i.test((item.name ?? "") + " " + detail);
    rangeLimit ||=
      item.code === "RPC_RESPONSE_TOO_LARGE" ||
      /block range|too many (?:logs|results)|query returned more than|(?:response|result|log) (?:size|too large)/i.test(
        detail,
      );
    causes.push({
      name: safe(item.name ?? "Error", 80),
      status: Number.isFinite(item.status) ? item.status : undefined,
      code:
        typeof item.code === "number" && Number.isFinite(item.code)
          ? item.code
          : undefined,
      detail: safe(detail, 240),
    });
    cause = item.cause;
  }
  return {
    reason: timeout
      ? "INFURA_REQUEST_TIMEOUT"
      : rangeLimit
        ? "INFURA_LOG_RANGE_LIMIT"
        : "INFURA_REQUEST_FAILED",
    causes,
  };
}

export function indexClients(env: Env, owner: string) {
  const state = { background: false };
  if (
    env.INDEX_RPC_MODE &&
    !["standard", "infura-free"].includes(env.INDEX_RPC_MODE)
  )
    throw new RpcFault("INDEX_RPC_MODE_INVALID");
  if (env.INDEX_RPC_MODE !== "infura-free")
    return {
      state,
      pair: clients(
        {
          ...env,
          RPC_PRIMARY_URL: env.INDEX_RPC_PRIMARY_URL || env.RPC_PRIMARY_URL,
          RPC_SECONDARY_URL:
            env.INDEX_RPC_SECONDARY_URL || env.RPC_SECONDARY_URL,
        },
        { timeout: 25_000 },
      ),
    };
  const primary = infuraUrl(env.INFURA_API_KEY);
  if (!env.INDEX_RPC_SECONDARY_URL)
    throw new RpcFault("INDEX_SECONDARY_PROVIDER_REQUIRED");
  const secondary = new URL(env.INDEX_RPC_SECONDARY_URL);
  if (
    secondary.hostname === "infura.io" ||
    secondary.hostname.endsWith(".infura.io")
  )
    throw new RpcFault("RPC_PROVIDERS_MUST_BE_INDEPENDENT");
  const quota = new InfuraQuota(
    env.DAO_DB,
    owner,
    infuraDailyLimit(env.INFURA_DAILY_CREDITS),
    clock,
    () => state.background,
  );
  return {
    state,
    pair: clients(
      {
        ...env,
        RPC_PRIMARY_URL: primary,
        RPC_SECONDARY_URL: env.INDEX_RPC_SECONDARY_URL,
      },
      { primaryTransport: infuraTransport(primary, quota), timeout: 25_000 },
    ),
  };
}

/** Read-only UI/Graph refreshes share the indexer's free-tier quota and cooldown. */
export function readClients(env: Env) {
  if (env.INDEX_RPC_MODE !== "infura-free") return clients(env);
  const primary = infuraUrl(env.INFURA_API_KEY);
  const quota = new InfuraQuota(
    env.DAO_DB,
    null,
    infuraDailyLimit(env.INFURA_DAILY_CREDITS),
  );
  return clients(
    { ...env, RPC_PRIMARY_URL: primary },
    { primaryTransport: infuraTransport(primary, quota) },
  );
}
