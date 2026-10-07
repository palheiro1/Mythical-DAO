import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { database } from "./db-fixture";
import worker from "../worker/index";
import { config } from "../worker/config";
import {
  refreshProposalSnapshot,
  readProposalSnapshot,
} from "../worker/proposal-snapshot";
import { paymentProposal } from "./browser/fixtures";
const rpc = vi.hoisted(() => ({
  calls: 0,
  hash: "0x" + "a".repeat(64),
  publicationHash: "0x" + "a".repeat(64),
  fail: false,
}));
vi.mock("../worker/rpc", async (original) => ({
  ...(await original<typeof import("../worker/rpc")>()),
  clients: () => {
    rpc.calls++;
    const c = {
      getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({
        hash: blockNumber === 90n ? rpc.publicationHash : rpc.hash,
      }),
      multicall: async () => {
        if (rpc.fail) throw Error("RPC failed");
        return [1, [0n, 34n, 0n], 40n];
      },
    };
    return [c, c];
  },
  commonHead: async () => ({ head: 1000n, confirmed: 936n }),
}));
vi.mock("../worker/data", async (original) => ({
  ...(await original<typeof import("../worker/data")>()),
  indexHealth: async () => ({ status: "syncing", signingAllowed: true }),
}));
let db: Awaited<ReturnType<typeof database>>, env: Env;
beforeEach(async () => {
  db = await database();
  env = { ...db.bindings, ENVIRONMENT: "local", DEPLOYMENT_MANIFEST: "" };
  rpc.calls = 0;
  rpc.fail = false;
  rpc.publicationHash = rpc.hash;
  const cfg = config(env),
    p = { ...paymentProposal, contract: cfg.contracts.governor!.address };
  const row = {
    chain_id: 137,
    contract: p.contract,
    event_name: "ProposalCreated",
    block_number: 90,
    block_hash: rpc.hash,
    tx_hash: p.transactionHash,
    log_index: 0,
    args_json: JSON.stringify({
      proposalId: p.id,
      proposer: p.proposer,
      description: p.description,
      targets: p.targets,
      values: p.values,
      calldatas: p.calldatas,
      signatures: [],
      voteStart: "100",
      voteEnd: "200",
    }),
  };
  await db.db
    .prepare("INSERT INTO public_proposal_snapshot VALUES(1,?,1000)")
    .bind(
      JSON.stringify({
        checkedAt: Date.now(),
        block: "1000",
        items: [p],
        rows: [row],
      }),
    )
    .run();
});
afterEach(async () => {
  await db.mf.dispose();
});
it("serves proposal lists and direct links without RPC fan-out", async () => {
  const saved = await readProposalSnapshot(env);
  for (const path of [
    "proposals",
    `proposals/${saved!.items[0].contract}/${paymentProposal.id}`,
  ]) {
    const r = await worker.fetch(
      new Request("https://portal.test/api/" + path),
      env,
    );
    expect(r.status).toBe(200);
    expect(await r.text()).toContain(paymentProposal.id);
  }
  expect(rpc.calls).toBe(0);
});
it("refreshes all totals while retaining publication history and leaves last success on RPC failure", async () => {
  await refreshProposalSnapshot(env, config(env));
  expect((await readProposalSnapshot(env))!.items[0].votes).toEqual([
    "0",
    "34",
    "0",
  ]);
  rpc.fail = true;
  await expect(refreshProposalSnapshot(env, config(env))).rejects.toThrow();
  expect((await readProposalSnapshot(env))!.items[0].votes).toEqual([
    "0",
    "34",
    "0",
  ]);
});
it("removes a reorged publication from the display without deleting independent history", async () => {
  rpc.publicationHash = "0x" + "b".repeat(64);
  await refreshProposalSnapshot(env, config(env));
  expect((await readProposalSnapshot(env))!.items).toEqual([]);
});
it("the original minute trigger renews data before its display validity expires", async () => {
  const old = (await readProposalSnapshot(env))!;
  old.checkedAt = Date.now() - 100000;
  await env.DAO_DB.prepare(
    "UPDATE public_proposal_snapshot SET payload=? WHERE id=1",
  )
    .bind(JSON.stringify(old))
    .run();
  let pending: Promise<unknown> | undefined;
  worker.scheduled({ cron: "* * * * *" } as ScheduledController, env, {
    waitUntil(p: Promise<unknown>) {
      pending = p;
    },
  } as ExecutionContext);
  await pending;
  const updated = (await readProposalSnapshot(env))!;
  expect(updated.checkedAt).toBeGreaterThan(old.checkedAt);
  expect(updated.items[0].votes).toEqual(["0", "34", "0"]);
});
