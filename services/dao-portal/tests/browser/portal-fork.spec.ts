import { test, expect, type Page } from "@playwright/test";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import { writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import manifest from "../../deployments/polygon.json" with { type: "json" };
import { governorAbi, tokenAbi } from "../../shared/abis";
import { newDraft, description } from "../../src/drafts";
import { proposalHash } from "../../shared/domain";

test.skip(
  process.env.FORK_PORTAL_TESTS !== "1",
  "Requires the explicitly local scripts/rehearse-portal.mjs environment",
);
const rpcUrl = "http://127.0.0.1:18545";
const client = createPublicClient({
  transport: http(rpcUrl, { retryCount: 0, timeout: 30000 }),
});
const governor = manifest.contracts.governor.address as Address,
  mana = manifest.contracts.mana.address as Address,
  gem = manifest.contracts.gem.address as Address;
const member = "0x00000000000000000000000000000000000a11ce" as Address,
  recipient = "0x2222222222222222222222222222222222222222" as Address;
let rpcId = 0;
async function rpc(method: string, params: unknown[] = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const r = (await response.json()) as {
    error?: { message: string };
    result: any;
  };
  if (r.error) throw Error(r.error.message);
  return r.result;
}
const mine = async (count = 2n) =>
  rpc("anvil_mine", ["0x" + count.toString(16)]);
// Anvil 1.3.5: advance only BlockEnv.number, preserving every account and checkpoint.
// Equivalent to vm.roll for voting windows; no Governor storage or rules are edited.
async function advanceTo(target: bigint) {
  const before = await rpc("anvil_dumpState");
  if (before.length > 20_000_000)
    throw Error("Fork state exceeded rehearsal budget");
  const state = JSON.parse(
    gunzipSync(Buffer.from(before.slice(2), "hex"), {
      maxOutputLength: 32_000_000,
    }).toString(),
  );
  const accounts = JSON.stringify(state.accounts);
  state.block.number = "0x" + target.toString(16);
  const checkpoint = structuredClone(
    state.blocks.find(
      (b: any) => BigInt(b.header.number) === BigInt(state.best_block_number),
    ),
  );
  expect(checkpoint.transactions).toEqual([]);
  checkpoint.header.number = state.block.number;
  checkpoint.header.parentHash = (await client.getBlock()).hash;
  state.blocks.push(checkpoint);
  state.best_block_number = Number(target);
  // A synthetic empty local checkpoint skips the voting wait; all contract storage stays identical.
  await rpc("anvil_loadState", [
    "0x" + gzipSync(JSON.stringify(state)).toString("hex"),
  ]);
  await mine();
  expect(await client.getBlockNumber({ cacheTime: 0 })).toBe(target + 2n);
  const after = JSON.parse(
    gunzipSync(Buffer.from((await rpc("anvil_dumpState")).slice(2), "hex"), {
      maxOutputLength: 32_000_000,
    }).toString(),
  );
  expect(JSON.stringify(after.accounts)).toBe(accounts);
}
async function readState(id: string) {
  return client.readContract({
    address: governor,
    abi: governorAbi,
    functionName: "state",
    args: [BigInt(id)],
  });
}
async function connect(page: Page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Injected", exact: true }).click();
}

test("real Polygon Governor web lifecycle with an empty archive", async ({
  page,
}) => {
  test.setTimeout(600000);
  expect(String(await rpc("web3_clientVersion")).toLowerCase()).toContain(
    "anvil",
  );
  expect(new URL(process.env.PORTAL_TEST_URL!).hostname).toBe("127.0.0.1");
  const baseline = await rpc("evm_snapshot");
  const evidence: { operation: string; hash: string; status: string }[] = [];
  try {
    await rpc("anvil_impersonateAccount", [governor]);
    await rpc("anvil_impersonateAccount", [member]);
    for (const address of [governor, member])
      await rpc("anvil_setBalance", [address, "0x56bc75e2d63100000"]);
    await rpc("eth_sendTransaction", [
      {
        from: governor,
        to: mana,
        data: encodeFunctionData({
          abi: tokenAbi,
          functionName: "transfer",
          args: [member, 50000n * 10n ** 18n],
        }),
        gas: "0x989680",
      },
    ]);
    await mine();
    // Resolve cold fork storage before timing the real Worker preflights (8 s per RPC).
    await client.call({
      account: governor,
      to: gem,
      data: encodeFunctionData({
        abi: tokenAbi,
        functionName: "transfer",
        args: [recipient, 10n ** 18n],
      }),
    });
    page.on("response", async (response) => {
      if (response.status() >= 400 && response.url().includes("/api/"))
        console.log(
          "Fork API:",
          new URL(response.url()).pathname,
          response.status(),
        );
    });
    let submitted = 0;
    await page.exposeFunction(
      "forkRequest",
      async (method: string, params: unknown[], mode: string) => {
        if (method === "eth_sendTransaction") {
          if (mode === "reject") throw Error("User rejected the request.");
          submitted++;
          const tx: Record<string, unknown> = {
            ...(params[0] as Record<string, unknown>),
            gas: "0x989680",
          };
          if (mode === "revert") await rpc(method, [tx]); // change the real fork state after the final preflight
          const hash = await rpc(method, [tx]);
          await mine();
          const receipt = await client.getTransactionReceipt({ hash });
          evidence.push({
            operation: String(tx.data).slice(0, 10),
            hash,
            status: receipt.status,
          });
          return hash;
        }
        return rpc(method, params);
      },
    );
    await page.addInitScript(
      ({ member }) => {
        const w = window as any;
        let account: string = member,
          chain = "0x89";
        const listeners: Record<string, Function[]> = {};
        w.forkMode = "normal";
        w.forkAccount = (next: string) => {
          account = next;
          listeners.accountsChanged?.forEach((f) => f([next]));
        };
        w.forkChain = (next: string) => {
          chain = next;
          listeners.chainChanged?.forEach((f) => f(next));
        };
        w.ethereum = {
          isMetaMask: true,
          on: (e: string, f: Function) => {
            (listeners[e] ??= []).push(f);
          },
          removeListener: (e: string, f: Function) => {
            listeners[e] = listeners[e]?.filter((v) => v !== f);
          },
          request: async ({
            method,
            params = [],
          }: {
            method: string;
            params: unknown[];
          }) => {
            if (method === "eth_accounts" || method === "eth_requestAccounts")
              return [account];
            if (method === "eth_chainId") return chain;
            if (method === "wallet_getCapabilities") return {};
            return w.forkRequest(method, params, w.forkMode);
          },
        };
      },
      { member },
    );
    // Wallet receipt reads also go only to the local fork. All /api routes are real Worker calls.
    await page.route(
      "https://polygon-bor-rpc.publicnode.com/**",
      async (route) => {
        const req = route.request().postDataJSON();
        const one = async (r: any) => ({
          jsonrpc: "2.0",
          id: r.id,
          result: await rpc(r.method, r.params),
        });
        await route.fulfill({
          json: Array.isArray(req)
            ? await Promise.all(req.map(one))
            : await one(req),
        });
      },
    );
    const health = await (await page.request.get("/api/health")).json();
    expect(health.signingAllowed).toBe(true);
    expect(health.historyComplete).toBe(false);
    expect(health.sources).toEqual([]);
    expect((await page.request.get("/api/notification-feed")).status()).toBe(
      409,
    );
    await page.goto("/#delegation");
    await connect(page);
    await expect(
      page.getByRole("button", { name: "Delegate to myself" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Delegate to myself" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.evaluate(() => {
      (window as any).forkMode = "reject";
    });
    await page.getByRole("button", { name: "Confirm in wallet" }).click();
    await expect(page.getByRole("alert")).toContainText("Signature declined");
    expect(submitted).toBe(0);
    await page.evaluate(() => {
      (window as any).forkMode = "normal";
    });
    await page.getByRole("button", { name: "Confirm in wallet" }).click();
    await expect(page.getByText("Confirmed · operation completed")).toBeVisible(
      { timeout: 20000 },
    );
    expect(
      await client.readContract({
        address: mana,
        abi: tokenAbi,
        functionName: "delegates",
        args: [member],
      }),
    ).toMatch(new RegExp(member, "i"));
    await page.getByRole("button", { name: "Close review" }).click();
    await page.getByRole("button", { name: "Delegate to myself" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.evaluate((next) => (window as any).forkAccount(next), recipient);
    await expect(
      page.getByRole("button", { name: "Confirm in wallet" }),
    ).toBeDisabled();
    await page.evaluate((next) => (window as any).forkAccount(next), member);
    await page.evaluate(() => (window as any).forkChain("0x1"));
    await expect(
      page.getByRole("button", { name: "Confirm in wallet" }),
    ).toBeDisabled();
    await page.evaluate(() => (window as any).forkChain("0x89"));
    await page.getByRole("button", { name: "Close review" }).click();

    async function publish(title: string) {
      const draft = newDraft();
      draft.title = title;
      for (const key of Object.keys(draft.sections))
        draft.sections[key] = "Fork-only rehearsal: " + key;
      draft.actions = [
        {
          target: gem,
          value: "0",
          data: encodeFunctionData({
            abi: tokenAbi,
            functionName: "transfer",
            args: [recipient, 10n ** 18n],
          }),
        },
      ];
      const id = proposalHash(draft.actions, description(draft));
      await page.goto("/#create");
      await page.getByLabel("Import draft").setInputFiles({
        name: "fork-draft.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(draft)),
      });
      await page.getByRole("button", { name: "4 Review" }).click();
      await page
        .getByRole("checkbox", { name: /I checked that the written budget/ })
        .check();
      await page
        .getByRole("button", { name: "Simulate & review publication" })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 20000 });
      await page.getByRole("button", { name: "Confirm in wallet" }).click();
      await expect(
        page.getByText("Confirmed · operation completed"),
      ).toBeVisible({ timeout: 20000 });
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "View proposal", exact: true })
        .click();
      await expect(page.locator(".proposal-text")).toHaveText(
        description(draft),
      );
      return id;
    }
    const suffix = Date.now();
    const id = await publish("Fork browser payment " + suffix);
    console.log("Fork UI: proposal published and recovered");
    const snapshot = await client.readContract({
      address: governor,
      abi: governorAbi,
      functionName: "proposalSnapshot",
      args: [BigInt(id)],
    });
    await advanceTo(snapshot);
    console.log("Fork UI: voting window reached");
    await page.reload();
    await page
      .getByRole("button", { name: "Review vote →", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm in wallet" }).click();
    await expect(page.getByText("Confirmed · operation completed")).toBeVisible(
      { timeout: 20000 },
    );
    expect(
      await client.readContract({
        address: governor,
        abi: governorAbi,
        functionName: "hasVoted",
        args: [BigInt(id), member],
      }),
    ).toBe(true);
    await page.getByRole("button", { name: "Close review" }).click();
    const before = submitted;
    await page
      .getByRole("button", { name: "Review vote →", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("ALREADY_VOTED");
    expect(submitted).toBe(before);
    const deadline = await client.readContract({
      address: governor,
      abi: governorAbi,
      functionName: "proposalDeadline",
      args: [BigInt(id)],
    });
    await advanceTo(deadline);
    console.log("Fork UI: execution window reached");
    await page.reload();
    expect(await readState(id)).toBe(4);
    const balanceBefore = await client.readContract({
      address: gem,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [recipient],
    });
    await page
      .getByRole("button", { name: "Review execution →", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm in wallet" }).click();
    await expect(page.getByText("Confirmed · operation completed")).toBeVisible(
      { timeout: 20000 },
    );
    expect(await readState(id)).toBe(7);
    expect(
      await client.readContract({
        address: gem,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [recipient],
      }),
    ).toBe(balanceBefore + 10n ** 18n);
    await page.screenshot({
      path: "docs/evidence/visual/portal-fork-executed-2026-09-29.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Close review" }).click();
    const canceled = await publish("Fork browser cancel " + suffix);
    await page.getByRole("button", { name: "Cancel pending proposal" }).click();
    await page.getByRole("button", { name: "Confirm in wallet" }).click();
    await expect(page.getByText("Confirmed · operation completed")).toBeVisible(
      { timeout: 20000 },
    );
    expect(await readState(canceled)).toBe(2);
    await page.getByRole("button", { name: "Close review" }).click();
    const reverted = await publish("Fork browser race " + suffix);
    await page.getByRole("button", { name: "Cancel pending proposal" }).click();
    await page.evaluate(() => {
      (window as any).forkMode = "revert";
    });
    await page.getByRole("button", { name: "Confirm in wallet" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "transaction reverted",
      { timeout: 20000 },
    );
    await expect(page.getByText("Confirmed · operation completed")).toHaveCount(
      0,
    );
    expect(await readState(reverted)).toBe(2);
    await page.screenshot({
      path: "docs/evidence/visual/portal-fork-reverted-2026-09-29.png",
      fullPage: true,
    });
    expect(
      (await (await page.request.get("/api/health")).json()).historyComplete,
    ).toBe(false);
    writeFileSync(
      "docs/evidence/portal-fork-2026-09-29.json",
      JSON.stringify(
        {
          forkBlock: 94644170,
          chainId: 137,
          archive: "empty; recovered proposal receipts only",
          rpc: "two local clients to one Anvil fork; independent providers verified separately",
          proposalId: id,
          canceled,
          reverted,
          checks: [
            "delegation",
            "rejection",
            "account change",
            "network change",
            "draft import and exact publication",
            "receipt recovery",
            "vote",
            "duplicate-vote simulation failure",
            "direct execution and GEM transfer",
            "pending cancellation",
            "actual reverted receipt",
          ],
          transactions: evidence,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await rpc("evm_revert", [baseline]);
  }
});
