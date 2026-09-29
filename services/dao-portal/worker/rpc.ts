import { createPublicClient, http, type PublicClient } from "viem";
import type { PortalConfig } from "../shared/domain";
import { stringify } from "../shared/domain";
export class RpcFault extends Error {
  constructor(public code: string) {
    super(code);
  }
}
/** Viem wraps transport faults inside contract/function errors. Never log those bodies or URLs. */
export function rpcFailureCode(error: unknown, fallback: string): string {
  for (let cause = error, depth = 0; cause && depth < 8; depth++) {
    if (typeof cause !== "object") break;
    if (cause instanceof RpcFault) return cause.code;
    const fault = cause as { status?: number; name?: string; cause?: unknown };
    if (fault.status === 429) return "RPC_RATE_LIMITED";
    if (fault.name === "TimeoutError") return "RPC_REQUEST_TIMEOUT";
    cause = fault.cause;
  }
  return fallback;
}
export async function boundedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);
  const reader = response.body?.getReader();
  if (!reader) throw new RpcFault("RPC_EMPTY_RESPONSE");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4_000_000) throw new RpcFault("RPC_RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    body.set(c, offset);
    offset += c.length;
  }
  return new Response(body, {
    status: response.status,
    headers: response.headers,
  });
}
export async function timedBoundedFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeout: number,
): Promise<Response> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeout);
  try {
    return await boundedFetch(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, deadline.signal])
        : deadline.signal,
    });
  } catch (error) {
    if (deadline.signal.aborted) throw new RpcFault("RPC_REQUEST_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function requestScopedHttp(
  url: string,
  providerName: string,
  timeout = 8_000,
): ReturnType<typeof http> {
  const provider = http(url, {
    timeout,
    // Public dRPC accepts at most three requests per batch in its documented tier.
    // Larger batches may work in one region and receive HTTP 429 in another.
    batch: { wait: 10, batchSize: 3 },
    retryCount: 1,
    retryDelay: 250,
    // Viem replaces its internal deadline signal when a caller supplies one.
    // Enforce a real network/body deadline while keeping batch isolation intact.
    fetchFn: (input, init) => timedBoundedFetch(input, init, timeout),
  });
  // Simulation capability errors may use HTTP 503. Viem cannot retain a JSON-RPC
  // error nested in an HTTP-error batch array, so send this single call unbatched.
  const simulationProvider = http(url, {
    timeout,
    batch: false,
    retryCount: 1,
    retryDelay: 250,
    fetchFn: (input, init) => timedBoundedFetch(input, init, timeout),
  });
  return (options) => {
    const transport = provider(options);
    const simulationTransport = simulationProvider(options);
    // Viem keys its batch scheduler by URL and signal. A fresh signal isolates
    // each client's batch inside the owning Worker request, avoiding cross-request I/O.
    const signal = new AbortController().signal;
    const request: typeof transport.request = async (args, requestOptions) => {
      const started = Date.now();
      try {
        return await (
          args.method === "eth_simulateV1" ? simulationTransport : transport
        ).request(args, {
          ...requestOptions,
          signal: requestOptions?.signal ?? signal,
        });
      } catch (error) {
        for (
          let cause: unknown = error, depth = 0;
          cause && depth < 8;
          depth++
        ) {
          if (typeof cause !== "object") break;
          if (
            cause instanceof RpcFault &&
            cause.code === "RPC_REQUEST_TIMEOUT"
          ) {
            console.warn(
              JSON.stringify({
                event: "rpc_timeout",
                provider: providerName,
                method: args.method,
                durationMs: Date.now() - started,
              }),
            );
            throw new RpcFault(`RPC_${providerName.toUpperCase()}_TIMEOUT`);
          }
          cause = (cause as { cause?: unknown }).cause;
        }
        const fault = error as { status?: number };
        if (fault.status === 429)
          console.warn(
            JSON.stringify({
              event: "rpc_rate_limited",
              provider: providerName,
            }),
          );
        throw error;
      }
    };
    // Raw/custom methods use client.transport.request, which viem obtains from
    // config; preserve the same isolation, deadlines and routing on that path.
    return { ...transport, config: { ...transport.config, request }, request };
  };
}
export function clients(
  env: Env,
  options: {
    primaryTransport?: ReturnType<typeof http>;
    timeout?: number;
  } = {},
): [PublicClient, PublicClient] {
  if (!env.RPC_PRIMARY_URL || !env.RPC_SECONDARY_URL)
    throw new RpcFault("RPC_NOT_CONFIGURED");
  const a = new URL(env.RPC_PRIMARY_URL),
    b = new URL(env.RPC_SECONDARY_URL);
  if (
    env.ENVIRONMENT !== "local" &&
    (a.protocol !== "https:" ||
      b.protocol !== "https:" ||
      a.hostname === b.hostname)
  )
    throw new RpcFault("RPC_PROVIDERS_MUST_BE_INDEPENDENT");
  return [env.RPC_PRIMARY_URL, env.RPC_SECONDARY_URL].map((url, index) =>
    createPublicClient({
      // Retry only the transport; agreement and canonical-head checks remain mandatory.
      transport:
        index === 0 && options.primaryTransport
          ? options.primaryTransport
          : requestScopedHttp(
              url,
              index === 0 ? "primary" : "secondary",
              options.timeout,
            ),
    }),
  ) as [PublicClient, PublicClient];
}
// A failed provider must not leave another provider's I/O running after the
// indexer's lease has been released (especially when requests are rate limited).
export async function settledValues<T>(tasks: Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(tasks);
  const failed = results.find((result) => result.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return results.map((result) => {
    if (result.status === "rejected") throw result.reason;
    return result.value;
  });
}
export async function agreed<T>(
  pair: [PublicClient, PublicClient],
  read: (client: PublicClient) => Promise<T>,
): Promise<T> {
  const [a, b] = await settledValues(pair.map(read));
  if (stringify(a) !== stringify(b)) throw new RpcFault("RPC_DIVERGENCE");
  return a;
}
export async function commonHead(
  pair: [PublicClient, PublicClient],
  cfg: PortalConfig,
) {
  const ids = await settledValues(pair.map((c) => c.getChainId()));
  if (ids.some((id) => id !== cfg.chainId))
    throw new RpcFault("RPC_WRONG_CHAIN");
  const heads = await settledValues(
    pair.map((c) => c.getBlockNumber({ cacheTime: 0 })),
  );
  if (heads[0] > heads[1] + 8n || heads[1] > heads[0] + 8n)
    throw new RpcFault("RPC_HEAD_DIVERGENCE");
  const head = heads[0] < heads[1] ? heads[0] : heads[1];
  const confirmed =
    head > BigInt(cfg.confirmations) ? head - BigInt(cfg.confirmations) : 0n;
  await agreed(
    pair,
    async (c) => (await c.getBlock({ blockNumber: confirmed })).hash,
  );
  if (cfg.environment !== "local") {
    const latest = await agreed(pair, async (c) => {
      const block = await c.getBlock({ blockNumber: head });
      return { hash: block.hash, timestamp: block.timestamp };
    });
    const age = Math.floor(Date.now() / 1000) - Number(latest.timestamp);
    if (!Number.isFinite(age) || age > 180 || age < -30)
      throw new RpcFault("RPC_STALE_HEAD");
  }
  return { head, confirmed };
}
