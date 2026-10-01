// Read-only preflight. No wallet client, private key, signature or broadcast path.
import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  http,
  keccak256,
  toHex,
  getContractAddress,
  formatEther,
} from "viem";
import {
  assertIndependentProviders,
  assertModuleRuntime,
} from "./ragequit-policy.mjs";
import {
  checkReviewedCreation,
  checkDeployer,
  checkIdleNonce,
  priceCreation,
} from "./ragequit-deployment-checks.mjs";

async function main() {
  const [
    address,
    output = "deployments/ragequit-release/deployment-wallet-unsigned.json",
  ] = process.argv.slice(2);
  const from = checkDeployer(address ?? "");
  const read = (path) => JSON.parse(readFileSync(path, "utf8"));
  const dir = "deployments/ragequit-release";
  const manifest = read("deployments/polygon.json");
  const artifact = read(
    "out/MythicalRagequitModule.sol/MythicalRagequitModule.json",
  );
  const review = read(`${dir}/review-manifest.json`);
  const { data, args } = checkReviewedCreation(
    manifest,
    artifact,
    review,
    read(`${dir}/deployment-unsigned.json`),
  );
  const metadata =
    typeof artifact.metadata === "string"
      ? JSON.parse(artifact.metadata)
      : artifact.metadata;
  if (
    JSON.stringify(metadata.compiler) !== JSON.stringify(review.compiler) ||
    JSON.stringify(metadata.settings) !== JSON.stringify(review.settings) ||
    Object.keys(metadata.sources).sort().join() !==
      Object.keys(review.sources).sort().join()
  )
    throw Error("Compiled metadata differs from reviewed release");
  for (const [path, hash] of Object.entries(review.sources))
    if (
      metadata.sources[path].keccak256 !== hash ||
      keccak256(toHex(readFileSync(path))) !== hash
    )
      throw Error(`Reviewed source changed: ${path}`);
  if (
    keccak256(toHex(readFileSync(`${dir}/compiler-input.json`))) !==
      review.compilerInputKeccak256 ||
    JSON.stringify(read(`${dir}/abi.json`)) !== JSON.stringify(artifact.abi)
  )
    throw Error("Review compiler input or ABI changed");

  const urls = [process.env.RPC_PRIMARY_URL, process.env.RPC_SECONDARY_URL];
  assertIndependentProviders(urls);
  const clients = urls.map((url) =>
    createPublicClient({
      transport: http(url, { timeout: 20000, retryCount: 1 }),
    }),
  );
  const json = (value) =>
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? String(v) : v));
  const agree = async (fn) => {
    const values = await Promise.all(clients.map(fn));
    if (json(values[0]) !== json(values[1]))
      throw Error("RPC disagreement; repeat preflight");
    return values[0];
  };
  if ((await agree((c) => c.getChainId())) !== 137) throw Error("Wrong chain");
  const heads = await Promise.all(clients.map((c) => c.getBlockNumber()));
  if (heads[0] > heads[1] + 8n || heads[1] > heads[0] + 8n)
    throw Error("RPC head divergence");
  const head = heads[0] < heads[1] ? heads[0] : heads[1];
  const anchor = await agree(async (c) => {
    const b = await c.getBlock({ blockNumber: head });
    return { number: b.number, hash: b.hash, timestamp: b.timestamp };
  });
  const age = Math.floor(Date.now() / 1000) - Number(anchor.timestamp);
  if (!anchor.hash || age > 180 || age < -30) throw Error("RPC head is stale");
  if (
    !Number.isSafeInteger(manifest.confirmations) ||
    manifest.confirmations < 1 ||
    head <= BigInt(manifest.confirmations)
  )
    throw Error("Invalid confirmation window");
  const blockNumber = head - BigInt(manifest.confirmations);
  const blockHash = await agree(
    async (c) => (await c.getBlock({ blockNumber })).hash,
  );
  if (!blockHash) throw Error("Missing confirmed block hash");
  const nonce = checkIdleNonce(
    await agree((c) =>
      c.getTransactionCount({ address: from, blockNumber: head }),
    ),
    await agree((c) =>
      c.getTransactionCount({ address: from, blockTag: "pending" }),
    ),
  );
  const code = await agree((c) =>
    c.getCode({ address: from, blockNumber: head }),
  );
  if (code && code !== "0x")
    throw Error("Deployer has code; direct EOA creation flow required");
  const balance = await agree((c) =>
    c.getBalance({ address: from, blockNumber: head }),
  );
  const predictedAddress = getContractAddress({ from, nonce: BigInt(nonce) });
  const existingCode = await agree((c) =>
    c.getCode({ address: predictedAddress, blockNumber: head }),
  );
  if (
    (existingCode && existingCode !== "0x") ||
    (await agree((c) =>
      c.getTransactionCount({ address: predictedAddress, blockNumber: head }),
    )) !== 0
  )
    throw Error("Predicted deployment address already used");
  const runtime = await agree(
    async (c) =>
      (await c.call({ account: from, data, value: 0n, blockNumber })).data,
  );
  if (!runtime || runtime === "0x")
    throw Error("Constructor returned no runtime");
  assertModuleRuntime(runtime, artifact, args);
  const pin = read("shared/generated/ragequit-trust.json");
  if (
    keccak256(runtime) !== review.runtimeKeccak256 ||
    pin.runtimeHash !== review.runtimeKeccak256
  )
    throw Error("Simulated runtime differs from the reviewed portal trust pin");
  const gasEstimates = await Promise.all(
    clients.map((c) =>
      c.estimateGas({ account: from, data, value: 0n, blockNumber: head }),
    ),
  );
  const feeEstimates = await Promise.all(
    clients.map((c) => c.estimateFeesPerGas()),
  );
  const priced = priceCreation({
    from,
    data,
    nonce,
    balance,
    gasEstimates,
    feeEstimates,
  });
  // A concurrent transaction invalidates both the nonce and predicted CREATE address.
  if (
    (await agree((c) =>
      c.getTransactionCount({ address: from, blockTag: "pending" }),
    )) !== nonce ||
    (await agree((c) => c.getBalance({ address: from, blockTag: "pending" }))) <
      priced.maximumGasCost
  )
    throw Error("Deployer state changed during preflight");
  for (const [number, hash] of [
    [head, anchor.hash],
    [blockNumber, blockHash],
  ])
    if (
      (await agree(
        async (c) => (await c.getBlock({ blockNumber: number })).hash,
      )) !== hash
    )
      throw Error("Verification block changed; repeat preflight");
  const preparedAt = new Date();
  const report = {
    status: "unsigned-review-only",
    preparedAt: preparedAt.toISOString(),
    refreshAfter: new Date(preparedAt.getTime() + 5 * 60 * 1000).toISOString(),
    independentReview: review.independentReview,
    transaction: priced.transaction,
    predictedAddress,
    predictionOnly:
      "Valid only for this sender and nonce; not a deployed or verified module. Do not use in the active manifest or a DAO proposal.",
    checks: {
      chainId: 137,
      providersAgree: true,
      providers: urls.map((url) => new URL(url).hostname),
      head: anchor,
      confirmedBlock: blockNumber,
      confirmedBlockHash: blockHash,
      initCodeKeccak256: keccak256(data),
      instantiatedRuntimeKeccak256: keccak256(runtime),
      runtimeBytes: (runtime.length - 2) / 2,
      sourceFilesVerified: Object.keys(review.sources).length,
      deployerBalanceWei: balance,
      gasEstimates,
      gasLimit: priced.gas,
      gasMarginPercent: 20,
      feeEstimates,
      maximumGasCostWei: priced.maximumGasCost,
      maximumGasCostPOL: formatEther(priced.maximumGasCost),
    },
    note: "Creation of only MythicalRagequitModule, no to address, zero native value. Nonce and fee estimates are temporary: repeat preflight immediately before signing. refreshAfter is a review reminder, not an on-chain expiry. See independentReview and its evidence for the review status. Human signature remains pending.",
    signed: false,
    broadcast: false,
  };
  writeFileSync(
    output,
    JSON.stringify(JSON.parse(json(report)), null, 2) + "\n",
  );
  writeFileSync(
    `${dir}/deployment-simulation.json`,
    JSON.stringify(
      JSON.parse(
        json({
          status: "simulation-only",
          preparedAt: report.preparedAt,
          from,
          ...report.checks,
          signed: false,
          broadcast: false,
        }),
      ),
      null,
      2,
    ) + "\n",
  );
  console.log(
    json({
      output,
      from,
      nonce,
      predictedAddress,
      blockNumber,
      maximumGasCostPOL: report.checks.maximumGasCostPOL,
      signed: false,
      broadcast: false,
    }),
  );
}
main().catch((error) => {
  // Never expose provider URLs, request bodies or API keys in saved evidence.
  const message = String(
    error.shortMessage ?? error.message ?? "Preflight failed",
  )
    .split("\n")[0]
    .replace(/https?:\/\/\S+/g, "[provider]")
    .slice(0, 240);
  console.error(`Preflight failed: ${message}`);
  process.exitCode = 1;
});
