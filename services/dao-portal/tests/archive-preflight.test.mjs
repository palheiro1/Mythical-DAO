import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  probeArchivePair,
  infuraProbeUrls,
} from "../scripts/probe-archive-rpcs.mjs";

const manifest = JSON.parse(
  readFileSync(new URL("../deployments/polygon.json", import.meta.url)),
);
const urls = [
  "https://one.example/private-secret",
  "https://two.example/?key=private-secret",
];
const hash = (block) => "0x" + BigInt(block).toString(16).padStart(64, "0");
const transactions = {
  58427770:
    "0x862d1b68152e8c4b67d4db87cd892977a12eed1350a216d776ade0fc52737570",
  89169940:
    "0x0add41071906a617dc7b43807fc1f1196648eab86d00c89dfb4ec351623fa605",
};
function client(overrides = {}) {
  return {
    getChainId: async () => 137,
    getBlockNumber: async () => 94600000n,
    getBlock: async ({ blockNumber }) => ({
      hash: hash(blockNumber),
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
    }),
    getLogs: async ({ address, fromBlock }) => [
      {
        address,
        blockNumber: fromBlock,
        blockHash: hash(fromBlock),
        transactionHash: transactions[String(fromBlock)] ?? hash(1),
        logIndex: 0,
        data: "0x",
        topics: [],
        removed: false,
      },
    ],
    ...overrides,
  };
}
const run = (one = client(), two = client()) =>
  probeArchivePair({
    urls,
    manifest,
    makeClient: (url) => (url === urls[0] ? one : two),
  });

describe("archive provider preflight", () => {
  it("selects Infura Polygon and a free independent secondary without exposing the key", () => {
    expect(() => infuraProbeUrls({})).toThrow(
      "INFURA_API_KEY_MISSING_OR_INVALID",
    );
    const urls = infuraProbeUrls({
      INFURA_API_KEY: "private-test-key-for-probe",
    });
    expect(new URL(urls[0]).hostname).toBe("polygon-mainnet.infura.io");
    expect(urls[1]).toBe("https://tenderly.rpc.polygon.community");
    expect(() =>
      infuraProbeUrls({
        INFURA_API_KEY: "private-test-key-for-probe",
        INDEX_RPC_SECONDARY_URL: urls[0],
      }),
    ).toThrow("INDEPENDENT_HTTPS_PROVIDERS_REQUIRED");
  });
  it("requires matching known history and records no credentials or completeness claim", async () => {
    const report = await run();
    expect(report.passed).toBe(true);
    expect(report.checks).toHaveLength(3);
    expect(JSON.stringify(report)).not.toContain("private-secret");
    expect(report.scope).toContain("not proof of complete history");
  });
  it("rejects providers that agree on an empty/pruned historical response", async () => {
    const empty = client({ getLogs: async () => [] });
    const report = await run(empty, empty);
    expect(report.passed).toBe(false);
    expect(
      report.checks.every(
        (check) => check.reason === "KNOWN_HISTORICAL_EVENT_MISSING",
      ),
    ).toBe(true);
  });
  it("fails when only one provider serves historical logs, without exposing its error URL", async () => {
    const offline = client({
      getLogs: async () => {
        throw Object.assign(new Error(urls[1]), { status: 429 });
      },
    });
    const report = await run(client(), offline);
    expect(report.passed).toBe(false);
    expect(
      report.checks[0].chain.some((entry) => entry.httpStatus === 429),
    ).toBe(true);
    expect(report.checks[0].provider).toBe("secondary");
    expect(JSON.stringify(report)).not.toContain("private-secret");
  });
  it("rejects a reorg during an otherwise matching historical query", async () => {
    let changed = false;
    const moving = client({
      getLogs: async (args) => {
        changed = true;
        return client().getLogs(args);
      },
      getBlock: async ({ blockNumber }) => ({
        hash: hash(blockNumber + (changed ? 1n : 0n)),
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
      }),
    });
    const report = await run(moving, moving);
    expect(report.passed).toBe(false);
    expect(report.checks[0].reason).toBe("NONCANONICAL_LOG");
  });
  it("rejects a wrong chain or two URLs from the same provider before probing history", async () => {
    const wrong = client({ getChainId: async () => 1 });
    expect((await run(wrong, wrong)).checks[0].reason).toBe("WRONG_CHAIN");
    await expect(
      probeArchivePair({ urls: [urls[0], urls[0] + "/other"], manifest }),
    ).rejects.toThrow("INDEPENDENT_HTTPS_PROVIDERS_REQUIRED");
  });
});
