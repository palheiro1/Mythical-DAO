import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { encodeFunctionData, type Address } from "viem";
import { config } from "../worker/config";
import manifest from "../deployments/polygon.json";
import { database } from "./db-fixture";
import { eventProposal } from "../worker/data";
import { relevantLog } from "../worker/indexer";
import { governorAbi, tokenAbi } from "../shared/abis";
import { paymentFor } from "../src/action-view";
import { actionSummary } from "../shared/action-summary";
import { proposalHash, stringify } from "../shared/domain";
const fixture = vi.hoisted(() => ({
  module: "0x1111111111111111111111111111111111111111",
  allowance: 100000n,
  mismatch: false,
  tokenMismatch: false,
  secondarySimulationError: 0,
  simulations: [] as unknown[],
  reads: [] as string[],
}));
vi.mock("../worker/rpc", async (original) => {
  const real = await original<typeof import("../worker/rpc")>();
  const client = {
    getBlockNumber: async () => 1000n,
    getChainId: async () => 137,
    getBlock: async () => ({ hash: "0x" + "a".repeat(64) }),
    getBalance: async () => 0n,
    readContract: async ({
      address,
      functionName,
    }: {
      address: string;
      functionName: string;
    }) => {
      fixture.reads.push(functionName);
      if (functionName === "token")
        return fixture.tokenMismatch
          ? fixture.module
          : manifest.contracts.mana.address;
      if (functionName === "totalSupply") return 1000n;
      if (functionName === "allowance") return fixture.allowance;
      if (functionName === "balanceOf")
        return address.toLowerCase() ===
          manifest.contracts.usdcNative.address.toLowerCase()
          ? 0n
          : address.toLowerCase() ===
              manifest.contracts.weth.address.toLowerCase()
            ? 200n
            : 10000n;
      if (functionName === "treasury")
        return manifest.contracts.treasury.address;
      if (functionName === "mana") return manifest.contracts.mana.address;
      if (functionName === "basket")
        return [
          manifest.contracts.gem.address,
          manifest.contracts.weth.address,
          fixture.mismatch
            ? manifest.contracts.usdcBridged.address
            : manifest.contracts.usdcNative.address,
        ];
      if (functionName === "previewRedeem") return [100n, 2n, 0n];
      if (functionName === "state") return 4;
      if (functionName === "proposalVotes") return [0n, 100n, 0n];
      if (functionName === "quorum") return 40n;
      throw Error("Unexpected contract read " + functionName);
    },
    call: async () => ({ data: "0x" }),
    estimateGas: async () => 100n,
    getGasPrice: async () => 1n,
    transport: {
      request: async (r: any) => {
        fixture.simulations.push(r);
        return [
          {
            calls: r.params[0].blockStateCalls[0].calls.map(() => ({
              status: "0x1",
              returnData: "0x",
              gasUsed: "0x1",
            })),
          },
        ];
      },
    },
  };
  return {
    ...real,
    clients: () => [
      client,
      {
        ...client,
        transport: {
          request: async (r: unknown) => {
            if (fixture.secondarySimulationError)
              throw Object.assign(Error("test simulation failure"), {
                code: fixture.secondarySimulationError,
              });
            return client.transport.request(r);
          },
        },
      },
    ],
  };
});
import worker from "../worker/index";
let db: Awaited<ReturnType<typeof database>>, env: Env;
const withModule = () => {
  env.DEPLOYMENT_MANIFEST = JSON.stringify({
    ...manifest,
    contracts: {
      ...manifest.contracts,
      ragequitModule: { address: fixture.module, startBlock: "900" },
    },
  });
};
const request = async (path: string, body?: unknown) => {
  const response = await worker.fetch(
    new Request(
      "http://localhost/api/" + path,
      body
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: stringify(body),
          }
        : undefined,
    ),
    env,
  );
  return {
    status: response.status,
    data: (await response.json()) as Record<string, any>,
  };
};
beforeEach(async () => {
  db = await database();
  fixture.allowance = 100000n;
  fixture.mismatch = false;
  fixture.tokenMismatch = false;
  fixture.secondarySimulationError = 0;
  fixture.reads = [];
  fixture.simulations = [];
  env = {
    ...db.bindings,
    ENVIRONMENT: "local",
    DEPLOYMENT_MANIFEST: JSON.stringify(manifest),
  } as Env;
  for (const role of ["governor", "mana"] as const)
    await db.db
      .prepare("INSERT INTO cursors VALUES(?,?,?,?,?)")
      .bind(
        137,
        manifest.contracts[role].address.toLowerCase(),
        936,
        "0x" + "a".repeat(64),
        Date.now(),
      )
      .run();
});
afterEach(async () => {
  await db.mf.dispose();
});
it("governance signs with no module, allowances or asset cursors", async () => {
  const health = await request("health");
  expect(health.data.signingAllowed).toBe(true);
  const p = await request("preflight", {
    account: fixture.module,
    to: manifest.contracts.mana.address,
    data: encodeFunctionData({
      abi: tokenAbi,
      functionName: "delegate",
      args: [fixture.module as Address],
    }),
    value: "0",
  });
  expect(p.status).toBe(200);
  const quote = await request("redeem-preview?amount=10");
  expect(quote.data.available).toBe(false);
  expect(quote.data.module).toBeNull();
});
it("accepts the configured portal origin through a proxy and rejects unrelated origins", async () => {
  env.PORTAL_ORIGIN = "https://mythical-dao-preview.vercel.app";
  for (const [origin, expected] of [
    [env.PORTAL_ORIGIN, 200],
    ["https://mythical-dao-preview.vercel.app.unrelated.example", 403],
  ] as const) {
    const response = await worker.fetch(
      new Request("https://api.example/api/preflight", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({
          account: fixture.module,
          to: manifest.contracts.mana.address,
          data: encodeFunctionData({
            abi: tokenAbi,
            functionName: "delegate",
            args: [fixture.module as Address],
          }),
          value: "0",
        }),
      }),
      env,
    );
    expect(response.status).toBe(expected);
  }
});
it("confirms a zero native-USDC balance without substituting USDC.e", async () => {
  withModule();
  const q = await request("redeem-preview?amount=10");
  expect(q.status).toBe(200);
  expect(q.data.available).toBe(true);
  expect(q.data.amounts).toEqual(["100", "2", "0"]);
  expect(q.data.basket[2].balance).toBe("0");
  expect(q.data.basket[2].address).toBe(
    manifest.contracts.usdcNative.address.toLowerCase(),
  );
});
it("insufficient or revoked treasury allowances never cap quotes or disable governance", async () => {
  withModule();
  fixture.allowance = 1n;
  const q = await request("redeem-preview?amount=10");
  expect(q.data.available).toBe(false);
  expect(q.data.amounts).toEqual(["100", "2", "0"]);
  expect(q.data.reasons.join(" ")).toContain("GEM");
  expect((await request("health")).data.signingAllowed).toBe(true);
});
it("rejects an on-chain basket identity mismatch", async () => {
  withModule();
  fixture.mismatch = true;
  expect((await request("redeem-preview?amount=10")).data.available).toBe(
    false,
  );
});
it("simulates batches from the existing Governor", async () => {
  const result = await request("simulate-actions", {
    actions: [
      { target: manifest.contracts.gem.address, value: "0", data: "0x" },
    ],
  });
  expect(result.status).toBe(200);
  expect(JSON.stringify(fixture.simulations)).toContain(
    '"from":"' + manifest.contracts.governor.address.toLowerCase() + '"',
  );
});
it("preserves proposal content and activates the original Governor without eta reads", async () => {
  const cfg = config(env),
    target = cfg.contracts.gem!.address;
  const actions = [{ target, value: "0", data: "0x" as const }],
    description = "Original → description\n";
  const id = proposalHash(actions, description),
    args = {
      proposalId: id,
      description,
      proposer: fixture.module,
      targets: [target],
      values: ["0"],
      calldatas: ["0x"],
      signatures: [],
      voteStart: "900",
      voteEnd: "950",
    };
  const row = {
    chain_id: 137,
    contract: cfg.contracts.governor!.address,
    block_number: 800,
    block_hash: ("0x" + "a".repeat(64)) as `0x${string}`,
    tx_hash: ("0x" + "b".repeat(64)) as `0x${string}`,
    log_index: 0,
    event_name: "ProposalCreated",
    args_json: JSON.stringify(args),
  };
  expect(eventProposal(row, cfg).kind).toBe("executable");
  await db.db
    .prepare("INSERT INTO events VALUES(?,?,?,?,?,?,?,?)")
    .bind(...Object.values(row))
    .run();
  const list = await request("proposals?kind=executable");
  expect(list.data.items[0].id).toBe(id);
  expect(list.data.items[0].description).toBe(description);
  expect(list.data.items[0].state).toBe("Succeeded");
  expect(fixture.reads).not.toContain("proposalEta");
  expect((await request("notification-feed")).data.items[0].id).toBe(id);
});
it("filters Approval by owner and spender separately from Transfer", () => {
  withModule();
  const cfg = config(env),
    asset = cfg.contracts.gem!.address,
    owner = cfg.contracts.treasury!.address,
    spender = fixture.module;
  expect(relevantLog(asset, { owner, spender }, cfg)).toBe(true);
  expect(relevantLog(asset, { owner: spender, spender: owner }, cfg)).toBe(
    false,
  );
  expect(relevantLog(asset, { from: spender, to: owner }, cfg)).toBe(true);
  expect(
    relevantLog(asset, { owner, spender: cfg.contracts.mana!.address }, cfg),
  ).toBe(false);
});
it("distinguishes direct payments and approvals and uses uint256 setter selectors", () => {
  const cfg = config(env),
    target = cfg.contracts.usdcNative!.address;
  const pay = {
    target,
    value: "0",
    data: encodeFunctionData({
      abi: tokenAbi,
      functionName: "transfer",
      args: [fixture.module as Address, 1230000n],
    }),
  };
  const approve = {
    ...pay,
    data: encodeFunctionData({
      abi: tokenAbi,
      functionName: "approve",
      args: [fixture.module as Address, 1230000n],
    }),
  };
  expect(paymentFor(pay, cfg)?.symbol).toBe("USDC");
  expect(paymentFor(pay, cfg)?.quantity).toBe("1.23");
  expect(paymentFor(approve, cfg)).toBeNull();
  expect(actionSummary(approve, cfg)).toContain("not a payment");
  expect(
    encodeFunctionData({
      abi: governorAbi,
      functionName: "setVotingDelay",
      args: [1n],
    }).slice(0, 10),
  ).toBe("0x70b0f660");
});

it("live operations work with no cursors while metrics and notification feed stay incomplete", async () => {
  await db.db.prepare("DELETE FROM cursors").run();
  await db.db
    .prepare(
      "INSERT INTO index_health VALUES(1,'degraded',0,'INFURA_REQUEST_TIMEOUT')",
    )
    .run();
  const health = (await request("health")).data;
  expect(health.signingAllowed).toBe(true);
  expect(health.historyComplete).toBe(false);
  expect((await request("overview")).data.complete).toBe(false);
  expect((await request("notification-feed")).status).toBe(409);
  expect(
    (
      await request("preflight", {
        account: fixture.module,
        to: manifest.contracts.mana.address,
        data: encodeFunctionData({
          abi: tokenAbi,
          functionName: "delegate",
          args: [fixture.module as Address],
        }),
        value: "0",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await request("preflight", {
        account: fixture.module,
        to: manifest.contracts.mana.address,
        data: encodeFunctionData({
          abi: tokenAbi,
          functionName: "transfer",
          args: [fixture.module as Address, 1n],
        }),
        value: "0",
      })
    ).data.error,
  ).toBe("UNSUPPORTED_MEMBER_OPERATION");
});

it("an archive reorg does not authorize history or prevent a verified live operation", async () => {
  await db.db
    .prepare("UPDATE cursors SET block_hash=?")
    .bind("0x" + "b".repeat(64))
    .run();
  const health = (await request("health")).data;
  expect(health.reason).toBe("INDEX_REORG_DETECTED");
  expect(health.historyComplete).toBe(false);
  expect(health.signingAllowed).toBe(true);
});
it("wrong Governor token identity blocks live availability and preflight", async () => {
  fixture.tokenMismatch = true;
  expect((await request("health")).data.signingAllowed).toBe(false);
  expect(
    (
      await request("preflight", {
        account: fixture.module,
        to: manifest.contracts.mana.address,
        data: encodeFunctionData({
          abi: tokenAbi,
          functionName: "delegate",
          args: [fixture.module as Address],
        }),
        value: "0",
      })
    ).data.error,
  ).toBe("GOVERNOR_TOKEN_MISMATCH");
});

it("verifies a single action with both standard calls when one batch method is unsupported", async () => {
  fixture.secondarySimulationError = -32601;
  const result = await request("simulate-actions", {
    actions: [
      { target: manifest.contracts.gem.address, value: "0", data: "0x" },
    ],
  });
  expect(result.data.ok).toBe(true);
  expect(result.data.complete).toBe(true);
});
it("never presents an unsupported batch as verified or hides real provider failures", async () => {
  const actions = Array.from({ length: 2 }, () => ({
    target: manifest.contracts.gem.address,
    value: "0",
    data: "0x",
  }));
  fixture.secondarySimulationError = -32601;
  const result = await request("simulate-actions", { actions });
  expect(result.data.ok).toBe(false);
  expect(result.data.complete).toBe(false);
  fixture.secondarySimulationError = -32000;
  expect((await request("simulate-actions", { actions })).status).toBe(503);
});
