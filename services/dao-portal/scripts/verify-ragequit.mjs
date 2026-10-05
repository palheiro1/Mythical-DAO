import { readFileSync, writeFileSync } from "node:fs";
import { checkAllowances, operationalAmount } from "./ragequit-allowances.mjs";
import {
  assertRagequitManifest,
  assertIndependentProviders,
  assertModuleRuntime,
} from "./ragequit-policy.mjs";
import {
  createPublicClient,
  http,
  parseAbi,
  keccak256,
  encodeDeployData,
  toHex,
} from "viem";
async function main() {
  const [
    manifestPath = "deployments/polygon.json",
    output = "deployments/ragequit-verification.json",
    expected = "inspect",
    amountInput,
  ] = process.argv.slice(2);
  const m = JSON.parse(readFileSync(manifestPath, "utf8"));
  assertRagequitManifest(m);
  const amount = operationalAmount(expected, amountInput);
  if (m.schemaVersion !== 2 || m.architecture !== "existing-governor")
    throw Error("Wrong manifest architecture");
  const urls = [process.env.RPC_PRIMARY_URL, process.env.RPC_SECONDARY_URL];
  assertIndependentProviders(urls);
  const pair = urls.map((u) =>
    createPublicClient({
      transport: http(u, { timeout: 20000, retryCount: 1 }),
    }),
  );
  const normalize = (x) =>
    JSON.stringify(x, (_, v) => (typeof v === "bigint" ? String(v) : v));
  const agree = async (fn) => {
    const values = await Promise.all(pair.map(fn));
    if (normalize(values[0]) !== normalize(values[1]))
      throw Error("RPC disagreement");
    return values[0];
  };
  const chainId = await agree((c) => c.getChainId());
  if (chainId !== m.chainId) throw Error("Wrong chain");
  const heads = await Promise.all(pair.map((c) => c.getBlockNumber()));
  if (heads[0] > heads[1] + 8n || heads[1] > heads[0] + 8n)
    throw Error("RPC head divergence");
  if (!Number.isSafeInteger(m.confirmations) || m.confirmations < 1)
    throw Error("Invalid confirmation window");
  const confirmed =
    heads.reduce((a, b) => (a < b ? a : b)) - BigInt(m.confirmations);
  const block = process.env.VERIFICATION_BLOCK
    ? BigInt(process.env.VERIFICATION_BLOCK)
    : confirmed;
  if (block > confirmed) throw Error("Verification block is not confirmed");
  if (block < 0n) throw Error("Insufficient confirmed blocks");
  const blockHash = await agree(
    async (c) => (await c.getBlock({ blockNumber: block })).hash,
  );
  const current = await agree(async (c) => {
    const b = await c.getBlock({
      blockNumber: heads[0] < heads[1] ? heads[0] : heads[1],
    });
    return { hash: b.hash, timestamp: b.timestamp };
  });
  const age = Math.floor(Date.now() / 1000) - Number(current.timestamp);
  if (age > 180 || age < -30) throw Error("RPC head is stale");
  const abi = parseAbi([
    "function gem() view returns(address)",
    "function weth() view returns(address)",
    "function usdc() view returns(address)",
    "function treasury() view returns(address)",
    "function mana() view returns(address)",
    "function token() view returns(address)",
    "function basket() view returns(address[3])",
    "function decimals() view returns(uint8)",
    "function allowance(address,address) view returns(uint256)",
    "function previewRedeem(uint256) view returns(uint256[3])",
    "function votingDelay() view returns(uint256)",
    "function votingPeriod() view returns(uint256)",
    "function proposalThreshold() view returns(uint256)",
    "function quorumNumerator() view returns(uint256)",
    "function quorumDenominator() view returns(uint256)",
  ]);
  const read = (address, functionName, args = []) =>
    agree((c) =>
      c.readContract({ address, abi, functionName, args, blockNumber: block }),
    );
  const treasury = m.contracts.treasury.address,
    module = m.contracts.ragequitModule?.address;
  if (
    (await read(treasury, "token")).toLowerCase() !==
    m.contracts.mana.address.toLowerCase()
  )
    throw Error("Governor token mismatch");
  if ((await read(m.contracts.mana.address, "decimals")) !== 18)
    throw Error("Unexpected MANA decimals");
  if (treasury.toLowerCase() !== m.contracts.governor.address.toLowerCase())
    throw Error("Governor/treasury mismatch");
  const assets = ["gem", "weth", "usdcNative"].map(
    (role) => m.contracts[role].address,
  );
  if (assets.includes(m.contracts.usdcBridged.address))
    throw Error("USDC.e cannot enter the basket");
  const codeHashes = {};
  for (const [role, entry] of Object.entries(m.contracts)) {
    const code = await agree((c) =>
      c.getCode({ address: entry.address, blockNumber: block }),
    );
    if (!code || code === "0x") throw Error(`No code for ${role}`);
    codeHashes[role] = keccak256(code);
  }
  for (const [i, address] of assets.entries())
    if ((await read(address, "decimals")) !== (i === 2 ? 6 : 18))
      throw Error("Unexpected decimals");
  let allowances = [];
  let payouts = null;
  if (module) {
    const artifact = JSON.parse(
      readFileSync(
        "out/MythicalRagequitModule.sol/MythicalRagequitModule.json",
        "utf8",
      ),
    );
    const code = await agree((c) =>
      c.getCode({ address: module, blockNumber: block }),
    );
    const reviewed = JSON.parse(
      readFileSync("deployments/ragequit-release/review-manifest.json", "utf8"),
    );
    const initCode = encodeDeployData({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object,
      args: [treasury, m.contracts.mana.address, ...assets],
    });
    if (
      keccak256(initCode) !== reviewed.initCodeKeccak256 ||
      keccak256(artifact.deployedBytecode.object) !==
        reviewed.runtimeTemplateKeccak256
    )
      throw Error(
        "Compiled artifact differs from the reviewed release package",
      );
    for (const [path, hash] of Object.entries(reviewed.sources))
      if (keccak256(toHex(readFileSync(path))) !== hash)
        throw Error(`Reviewed source changed: ${path}`);
    assertModuleRuntime(code, artifact, [
      treasury,
      m.contracts.mana.address,
      ...assets,
    ]);
    for (const [i, getter] of ["gem", "weth", "usdc"].entries())
      if (
        (await read(module, getter)).toLowerCase() !== assets[i].toLowerCase()
      )
        throw Error("Immutable asset mismatch");
    if (
      (await read(module, "treasury")).toLowerCase() !==
        treasury.toLowerCase() ||
      (await read(module, "mana")).toLowerCase() !==
        m.contracts.mana.address.toLowerCase() ||
      normalize((await read(module, "basket")).map((a) => a.toLowerCase())) !==
        normalize(assets.map((a) => a.toLowerCase()))
    )
      throw Error("Module identity mismatch");
    allowances = await Promise.all(
      assets.map((a) => read(a, "allowance", [treasury, module])),
    );
    if (keccak256(code) !== reviewed.runtimeKeccak256)
      throw Error("Runtime does not match the instantiated reviewed release");
    if (amount !== null)
      payouts = await read(module, "previewRedeem", [amount]);
    checkAllowances(expected, allowances, payouts);
  } else if (expected !== "inspect") throw Error("Module is not configured");
  const parameters = {};
  for (const fn of [
    "votingDelay",
    "votingPeriod",
    "proposalThreshold",
    "quorumNumerator",
    "quorumDenominator",
  ])
    parameters[fn] = await read(treasury, fn);
  if (
    (await agree(
      async (c) => (await c.getBlock({ blockNumber: block })).hash,
    )) !== blockHash
  )
    throw Error("Verification block changed; discard all reads and retry");
  writeFileSync(
    output,
    normalize({
      chainId,
      block,
      blockHash,
      module: module ?? null,
      assets,
      allowances,
      manaAmount: amount,
      payouts,
      parameters,
      codeHashes,
      verifiedAt: new Date().toISOString(),
      expected,
    }) + "\n",
  );
  console.log(
    `Verified ${module ? "module identity and allowances" : "existing Governor and treasury; module pending"} at block ${block}. Report: ${output}`,
  );
}
main().catch((error) => {
  // Provider exceptions can contain secret URLs and full request bodies. Keep the CLI output bounded.
  const message = String(
    error.shortMessage ?? error.message ?? "Unknown verification failure",
  )
    .split("\n")[0]
    .replace(/https?:\/\/\S+/g, "[provider]")
    .slice(0, 240);
  console.error(`Verification failed: ${message}`);
  process.exitCode = 1;
});
