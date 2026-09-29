/** Local-only web rehearsal: real forked contracts, disposable D1, no mainnet writes. */
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { preview } from "vite";
import { createPublicClient, http } from "viem";
const forkBlock = Number(process.env.POLYGON_FORK_BLOCK || 94644170);
const dir = ".portal-fork";
execFileSync(
  "/home/usuario/.local/bin/disk-guard",
  ["preflight", "--estimated-gb", "0.25", "--path", process.cwd()],
  { stdio: "inherit" },
);
try {
  process.loadEnvFile(".dev.vars");
} catch {}
if (!process.env.POLYGON_FORK_RPC && !process.env.INFURA_API_KEY)
  throw Error("Provide POLYGON_FORK_RPC or a local INFURA_API_KEY");
const forkSource =
  process.env.POLYGON_FORK_RPC ??
  "https://polygon-mainnet.infura.io/v3/" + process.env.INFURA_API_KEY;
if (new URL(forkSource).protocol !== "https:")
  throw Error("Fork source must be HTTPS");
// Only read methods are forwarded. No credentials appear in subprocess args or evidence.
const allowed = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getCode",
  "eth_getProof",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getStorageAt",
  "eth_getTransactionCount",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getLogs",
  "eth_call",
  "net_version",
]);
const upstream = createServer(async (req, res) => {
  let methods = [];
  try {
    let data = "";
    for await (const chunk of req) {
      data += chunk;
      if (data.length > 100000) throw Error("request size");
    }
    const body = JSON.parse(data);
    const entries = Array.isArray(body) ? body : [body];
    methods = entries.map((e) => e.method);
    if (entries.some((e) => !allowed.has(e.method))) {
      // Anvil probes eth_getAccountInfo; a JSON-RPC method error enables its standard fallback.
      // HTTP 502 would incorrectly turn a capability probe into a retried network outage.
      const errors = entries.map((e) => ({
        jsonrpc: "2.0",
        id: e.id,
        error: {
          code: -32601,
          message: "Read method not supported by this fork proxy",
        },
      }));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(Array.isArray(body) ? errors : errors[0]));
      return;
    }
    // A separate curl process isolates upstream I/O from the simulator's networking.
    // URL (possibly containing a key) and JSON body are sent on stdin, never argv.
    const r = await new Promise((resolve, reject) => {
      const child = spawn(
        "curl",
        [
          "--silent",
          "--max-time",
          "20",
          "--write-out",
          "\n%{http_code}",
          "--config",
          "-",
        ],
        { stdio: ["pipe", "pipe", "ignore"] },
      );
      let size = 0;
      const chunks = [];
      child.stdout.on("data", (chunk) => {
        size += chunk.length;
        if (size > 4_000_000) {
          child.kill();
          reject(Error("Fork response size exceeded"));
        } else chunks.push(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code) return reject(Error("Fork upstream connection failed"));
        const raw = Buffer.concat(chunks).toString();
        const split = raw.lastIndexOf("\n");
        resolve({
          status: Number(raw.slice(split + 1)),
          body: raw.slice(0, split),
        });
      });
      child.stdin.end(
        `url = ${JSON.stringify(forkSource)}\nrequest = "POST"\nheader = "Content-Type: application/json"\ndata = ${JSON.stringify(data)}\n`,
      );
    });
    res.writeHead(r.status, { "content-type": "application/json" });
    res.end(r.body);
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "fork_source_failed",
        methods,
        kind: error.name,
        code: error.code ?? error.cause?.code,
      }),
    );
    res.writeHead(502);
    res.end('{"error":"Fork source unavailable"}');
  }
});
let anvil, mf, frontend;
async function close() {
  anvil?.kill("SIGKILL"); // Disposable in-memory fork; release its port even if an RPC is stuck.
  frontend?.httpServer.closeAllConnections();
  upstream.closeAllConnections();
  if (frontend) await new Promise((r) => frontend.httpServer.close(r));
  try {
    await mf?.dispose();
  } finally {
    upstream.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
process.on("SIGINT", () => void close().then(() => process.exit(0)));
process.on("SIGTERM", () => void close().then(() => process.exit(0)));
try {
  await new Promise((resolve) => upstream.listen(18546, "127.0.0.1", resolve));
  anvil = spawn(
    "/home/usuario/.foundry/bin/anvil",
    [
      "--host",
      "127.0.0.1",
      "--port",
      "18545",
      "--chain-id",
      "137",
      "--fork-url",
      "http://127.0.0.1:18546",
      "--fork-block-number",
      String(forkBlock),
      "--no-storage-caching",
      "--prune-history",
      "64",
      "--silent",
    ],
    { stdio: "ignore" },
  );
  const client = createPublicClient({
    transport: http("http://127.0.0.1:18545", { retryCount: 0, timeout: 1000 }),
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if (anvil.exitCode !== null)
        throw Error("Anvil did not acquire its local port");
      await client.getBlockNumber();
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!ready) throw Error("Local fork failed to start");
  mkdirSync(dir, { recursive: true });
  await build({
    entryPoints: ["worker/index.ts"],
    outfile: dir + "/worker.mjs",
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
  const manifest = JSON.parse(readFileSync("deployments/polygon.json", "utf8"));
  manifest.confirmations = 1;
  mf = new Miniflare(
    convertV4MiniflareOptions({
      port: 8789,
      host: "127.0.0.1",
      workers: [
        {
          name: "portal-fork",
          modules: true,
          scriptPath: dir + "/worker.mjs",
          compatibilityDate: "2026-09-28",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: { DAO_DB: "portal-fork-only" },
          bindings: {
            ENVIRONMENT: "local",
            DEPLOYMENT_MANIFEST: JSON.stringify(manifest),
            PORTAL_ORIGIN: "http://127.0.0.1:5175",
            RPC_PRIMARY_URL: "http://127.0.0.1:18545",
            RPC_SECONDARY_URL: "http://127.0.0.1:18545",
          },
        },
      ],
    }),
  );
  await mf.ready;
  const db = await mf.getD1Database("DAO_DB");
  await db.batch(
    readdirSync("migrations")
      .filter((n) => n.endsWith(".sql"))
      .sort()
      .flatMap((n) =>
        unstable_splitSqlQuery(readFileSync("migrations/" + n, "utf8")),
      )
      .map((s) => db.prepare(s)),
  );
  frontend = await preview({
    preview: {
      host: "127.0.0.1",
      port: 5175,
      strictPort: true,
      proxy: {
        "/api": { target: "http://127.0.0.1:8789", changeOrigin: true },
      },
    },
  });
  console.log(
    JSON.stringify({
      status: "ready",
      portal: "http://127.0.0.1:5175",
      rpc: "http://127.0.0.1:18545",
      forkBlock,
      source: new URL(forkSource).hostname,
      archive: "empty disposable database; cron disabled",
    }),
  );
  await new Promise(() => {});
} catch {
  console.error("Portal fork setup failed; credentials suppressed.");
  await close();
  process.exitCode = 1;
}
