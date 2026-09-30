// Isolated Graph Node acceptance test. Never talks to Polygon, Studio or a funded wallet.
import { execFileSync, spawn } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  statfsSync,
  existsSync,
  openSync,
  closeSync,
} from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createServer } from "node:net";
const MANA = "0x2cacca1266653bb090d3fb511456ebca33150562";
const member = "0x0000000000000000000000000000000000000042";
const topic =
  "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const folder = ".task-reorg";
mkdirSync(folder, { recursive: true });
const report = {
  status: "running",
  graphNode: "v0.45.0",
  network: "isolated-anvil-137",
  liveNetworkAcceptance: false,
  startedAt: new Date().toISOString(),
};
const save = () =>
  writeFileSync(
    `${folder}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const compose = ["compose", "-f", "tests/reorg/compose.yml"];
const env = { ...process.env, GRAPH_TEST_DB_PASSWORD: randomUUID() };
// Never read local DAO .env files or pass deployment/query credentials to containers.
for (const k of Object.keys(env))
  if (/^(GRAPH_(API|DEPLOY)_KEY|INFURA_API_KEY|RPC_.*URL)$/.test(k))
    delete env[k];
let child,
  log,
  containers = false;
async function rpc(method, params = [], port = 9545) {
  const r = await fetch(`http://127.0.0.1:${port}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  const d = await r.json();
  if (d.error) throw Error(`LOCAL_RPC_${d.error.code}`);
  return d.result;
}
async function gql(query, variables = {}) {
  const r = await fetch("http://127.0.0.1:8000/subgraphs/name/mythical/reorg", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10000),
  });
  return r.json();
}
async function until(label, check) {
  const end = Date.now() + 90000;
  let last;
  while (Date.now() < end) {
    try {
      last = await check();
      if (last) return last;
    } catch {}
    await delay(500);
  }
  throw Error(`TIMED_OUT_${label}`);
}
async function emit(value, from) {
  const hash = await rpc("eth_sendTransaction", [
    {
      from,
      to: MANA,
      data: "0x" + BigInt(value).toString(16).padStart(64, "0"),
      gas: "0x100000",
    },
  ]);
  const receipt = await rpc("eth_getTransactionReceipt", [hash]);
  assert.equal(receipt.status, "0x1");
  assert.equal(receipt.logs.length, 1);
  assert.equal(receipt.logs[0].topics[0], "0x" + topic);
  return receipt;
}
const query =
  '{_meta{hasIndexingErrors block{number hash}} pilotStats(id:"137"){totalSupply holders transfers} manaAccount(id:"' +
  member +
  '"){balance} eventRecords(orderBy:blockNumber){transactionHash value blockHash}}';
try {
  assert(
    process.env.CI === "true" || process.env.GRAPH_REORG_LOCAL === "1",
    "Explicit local opt-in or CI required",
  );
  const dockerRoot = execFileSync(
    "docker",
    ["info", "--format", "{{.DockerRootDir}}"],
    { encoding: "utf8" },
  ).trim();
  const available =
    Number(statfsSync(dockerRoot).bavail) *
    Number(statfsSync(dockerRoot).bsize);
  report.disk = {
    availableBefore: available,
    peakAdditional: 4_000_000_000,
    reserve: 40_000_000_000,
  };
  if (existsSync("/home/usuario/.local/bin/disk-guard"))
    execFileSync(
      "/home/usuario/.local/bin/disk-guard",
      ["preflight", "--estimated-gb", "4", "--path", dockerRoot],
      { stdio: "inherit" },
    );
  else assert(available >= 44_000_000_000, "DISK_RESERVE_NOT_MET");
  const running = execFileSync("docker", [...compose, "ps", "-a", "-q"], {
    encoding: "utf8",
    env,
  }).trim();
  assert(!running, "Existing reorg environment must be preserved");
  for (const port of [9545, 8000, 8020, 8030, 5001])
    await new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(port, "0.0.0.0", () => server.close(resolve));
    });
  log = openSync(`${folder}/anvil.log`, "w");
  child = spawn(
    "anvil",
    ["--chain-id", "137", "--host", "0.0.0.0", "--port", "9545", "--silent"],
    { stdio: ["ignore", log, log] },
  );
  await until("ANVIL", async () => (await rpc("eth_chainId")) === "0x89");
  // Minimal fixture bytecode emits Transfer(0, member, calldata[0:32]). No production code is changed.
  const runtime =
    "0x60003560005273" + member.slice(2) + "60007f" + topic + "60206000a300";
  await rpc("anvil_setCode", [MANA, runtime]);
  const [sender] = await rpc("eth_accounts");
  const baseline = await emit(100, sender);
  const checkpoint = await rpc("evm_snapshot");
  const old = await emit(10, sender);
  await rpc("anvil_mine", ["0x4"]);
  containers = true;
  execFileSync("docker", [...compose, "up", "-d"], {
    env,
    stdio: "inherit",
    timeout: 180000,
  });
  await until("GRAPH_ADMIN", async () => {
    await rpc("subgraph_create", { name: "mythical/reorg" }, 8020);
    return true;
  });
  const manifest = readFileSync("subgraph.yaml", "utf8")
    .replace("startBlock: 48674443", "startBlock: 0")
    .replace("startBlock: 45785116", "startBlock: 0");
  writeFileSync("reorg.manifest.yaml", manifest);
  // Explicit local endpoints, no deploy key, and a separate build directory.
  execFileSync(
    process.execPath,
    [
      "node_modules/@graphprotocol/graph-cli/bin/run.js",
      "deploy",
      "mythical/reorg",
      "reorg.manifest.yaml",
      "--node",
      "http://127.0.0.1:8020",
      "--ipfs",
      "http://127.0.0.1:5001",
      "--version-label",
      "reorg-test",
      "--output-dir",
      `${folder}/build`,
    ],
    { env, stdio: "inherit", timeout: 180000 },
  );
  const before = await until("OLD_BRANCH", async () => {
    const d = await gql(query);
    return d.data?.pilotStats?.totalSupply === "110" &&
      d.data?._meta?.block?.number >= 6
      ? d.data
      : null;
  });
  assert.equal(before._meta.hasIndexingErrors, false);
  assert.equal(before.eventRecords.length, 2);
  assert.equal(before.manaAccount.balance, "110");
  assert(
    before.eventRecords.some((e) => e.transactionHash === old.transactionHash),
  );
  assert.equal(await rpc("evm_revert", [checkpoint]), true);
  const replacement = await emit(7, sender);
  await rpc("anvil_mine", ["0xc"]);
  const after = await until("REORG_ROLLBACK", async () => {
    const d = await gql(query);
    return d.data?.pilotStats?.totalSupply === "107" &&
      d.data?._meta?.block?.number >= 14
      ? d.data
      : null;
  });
  assert.equal(after._meta.hasIndexingErrors, false);
  assert.equal(after.pilotStats.transfers, "2");
  assert.equal(after.pilotStats.holders, "1");
  assert.equal(after.manaAccount.balance, "107");
  assert.equal(after.eventRecords.length, 2);
  assert(
    !after.eventRecords.some((e) => e.transactionHash === old.transactionHash),
  );
  assert(
    after.eventRecords.some(
      (e) => e.transactionHash === replacement.transactionHash,
    ),
  );
  const retained = await gql(
    'query($hash:Bytes!){pilotStats(id:"137",block:{hash:$hash}){totalSupply}}',
    { hash: baseline.blockHash },
  );
  assert.equal(retained.data?.pilotStats?.totalSupply, "100");
  const orphan = await gql(
    'query($hash:Bytes!){pilotStats(id:"137",block:{hash:$hash}){totalSupply}}',
    { hash: old.blockHash },
  );
  assert(
    orphan.errors?.length,
    "Orphan block must not return accepted entity data",
  );
  Object.assign(report, {
    status: "passed",
    completedAt: new Date().toISOString(),
    before,
    after,
    canonicalHistoricalSupply: retained.data.pilotStats.totalSupply,
    orphanRejected: true,
    wasm: {
      mana: createHash("sha256")
        .update(readFileSync(`${folder}/build/MANA/MANA.wasm`))
        .digest("hex"),
      governor: createHash("sha256")
        .update(readFileSync(`${folder}/build/Governor/Governor.wasm`))
        .digest("hex"),
    },
    limitations: [
      "Controlled short reorg of MANA events and derived entities; Governor event rollback not separately exercised.",
      "Local Graph Node behavior does not prove Gateway indexer retention or complete Polygon event coverage.",
    ],
  });
} catch (error) {
  report.status = "failed";
  report.reason =
    error instanceof Error ? error.message.slice(0, 500) : "REORG_TEST_FAILED";
  process.exitCode = 1;
} finally {
  if (containers) {
    try {
      writeFileSync(
        `${folder}/graph-node.log`,
        execFileSync(
          "docker",
          [...compose, "logs", "--tail", "120", "graph-node"],
          { env, encoding: "utf8", maxBuffer: 2000000 },
        ),
      );
    } catch {}
    // Only resources created by this test, in its dedicated compose project.
    try {
      execFileSync("docker", [...compose, "down", "--volumes"], {
        env,
        stdio: "inherit",
        timeout: 60000,
      });
    } catch {}
  }
  child?.kill("SIGTERM");
  if (log !== undefined) closeSync(log);
  save();
  console.log(JSON.stringify(report));
}
