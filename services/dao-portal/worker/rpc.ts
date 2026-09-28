import { createPublicClient, http, type PublicClient } from "viem";
import type { PortalConfig } from "../shared/domain";
import { stringify } from "../shared/domain";
export class RpcFault extends Error {
  constructor(public code: string) {
    super(code);
  }
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
export function clients(env: Env): [PublicClient, PublicClient] {
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
  return [env.RPC_PRIMARY_URL, env.RPC_SECONDARY_URL].map((url) =>
    createPublicClient({
      transport: http(url, {
        timeout: 8_000,
        retryCount: 0,
        fetchFn: boundedFetch,
      }),
    }),
  ) as [PublicClient, PublicClient];
}
export async function agreed<T>(
  pair: [PublicClient, PublicClient],
  read: (client: PublicClient) => Promise<T>,
): Promise<T> {
  const [a, b] = await Promise.all(pair.map(read));
  if (stringify(a) !== stringify(b)) throw new RpcFault("RPC_DIVERGENCE");
  return a;
}
export async function commonHead(
  pair: [PublicClient, PublicClient],
  cfg: PortalConfig,
) {
  const ids = await Promise.all(pair.map((c) => c.getChainId()));
  if (ids.some((id) => id !== cfg.chainId))
    throw new RpcFault("RPC_WRONG_CHAIN");
  const heads = await Promise.all(
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
