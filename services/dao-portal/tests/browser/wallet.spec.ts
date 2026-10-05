import { test, expect, type Page } from "@playwright/test";
import { decodeFunctionData, getAddress, type Hex } from "viem";
import { tokenAbi } from "../../shared/abis";
const member = "0x1111111111111111111111111111111111111111";
const representative = "0x2222222222222222222222222222222222222222";
const secondMember = getAddress("0xabcdef1234567890abcdef1234567890abcdef12");
type TestWallet = Window & {
  testAccounts?: (accounts: string[], notify?: boolean) => void;
  testAccountsUnavailable?: boolean;
  testSubmitted?: boolean;
  testTransaction?: { from: string; to: string; data: Hex };
};
const roles = [
  "mana",
  "weth",
  "usdc",
  "governor",
  "timelock",
  "vault",
  "ballots",
] as const;
async function setup(
  page: Page,
  {
    wrongNetwork = false,
    preflightFails = false,
    revert = false,
    confirm = false,
    account = member,
    exposedAccounts = [account],
    accountsUnavailable = false,
  }: {
    wrongNetwork?: boolean;
    preflightFails?: boolean;
    revert?: boolean;
    confirm?: boolean;
    account?: string;
    exposedAccounts?: string[];
    accountsUnavailable?: boolean;
  } = {},
) {
  await page.addInitScript(
    ({
      account,
      exposedAccounts,
      accountsUnavailable,
      wrongNetwork,
      revert,
      confirm,
    }) => {
      let chain = wrongNetwork ? "0x1" : "0x89";
      let accounts = exposedAccounts;
      const listeners: Record<string, ((value: unknown) => void)[]> = {};
      const w = window as TestWallet;
      w.testAccountsUnavailable = accountsUnavailable;
      w.testAccounts = (next, notify = true) => {
        accounts = next;
        if (notify) listeners.accountsChanged?.forEach((fn) => fn(next));
      };
      Object.defineProperty(window, "ethereum", {
        value: {
          isMetaMask: true,
          on: (name: string, fn: (v: unknown) => void) => {
            (listeners[name] ??= []).push(fn);
          },
          removeListener: (name: string, fn: (v: unknown) => void) => {
            listeners[name] = listeners[name]?.filter(
              (listener) => listener !== fn,
            );
          },
          request: async ({
            method,
            params,
          }: {
            method: string;
            params: unknown[];
          }) => {
            if (method === "eth_requestAccounts") return [account];
            if (method === "eth_accounts") {
              if (w.testAccountsUnavailable)
                throw Error("Wallet temporarily unavailable");
              return accounts;
            }
            if (method === "eth_chainId") return chain;
            if (method === "wallet_switchEthereumChain") {
              chain = "0x89";
              listeners.chainChanged?.forEach((fn) => fn(chain));
              return null;
            }
            if (method === "eth_sendTransaction") {
              w.testSubmitted = true;
              w.testTransaction = params[0] as TestWallet["testTransaction"];
              if (revert || confirm) return "0x" + "a".repeat(64);
              throw Object.assign(new Error("User rejected the request."), {
                code: 4001,
              });
            }
            if (method === "eth_estimateGas") return "0x186a0";
            if (
              method === "eth_gasPrice" ||
              method === "eth_maxPriorityFeePerGas"
            )
              return "0x3b9aca00";
            if (method === "wallet_getCapabilities") return {};
            throw new Error("Unexpected wallet method: " + method);
          },
        },
      });
    },
    {
      account,
      exposedAccounts,
      accountsUnavailable,
      wrongNetwork,
      revert,
      confirm,
    },
  );
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let result: unknown = { items: [] };
    if (url.pathname === "/api/config")
      result = {
        chainId: 137,
        environment: "test",
        enabled: true,
        confirmations: 64,
        portalUrl: "https://dao.mythicalbeings.io",
        contracts: Object.fromEntries(
          roles.map((r, i) => [
            r,
            { address: "0x" + String(i + 3).repeat(40), startBlock: "1" },
          ]),
        ),
      };
    if (url.pathname === "/api/health")
      result = {
        status: "ok",
        signingAllowed: true,
        head: "1000",
        confirmedHead: "936",
        checkedAt: new Date().toISOString(),
        sources: [],
      };
    if (url.pathname.startsWith("/api/members/"))
      result = {
        balance: "500000000000000000000",
        votes: "500000000000000000000",
        delegate: member,
        supply: "1000000000000000000000",
        allowance: "0",
      };
    if (url.pathname === "/api/preflight") {
      if (preflightFails) {
        await route.fulfill({ status: 503, json: { error: "RPC_DIVERGENCE" } });
        return;
      }
      result = {
        gas: "100000",
        estimatedFee: "100000000000000",
        checkedAt: new Date().toISOString(),
        block: "1000",
      };
    }
    await route.fulfill({ json: result });
  });
  await page.route(
    "https://polygon-bor-rpc.publicnode.com/**",
    async (route) => {
      const request = route.request().postDataJSON();
      function response(r: { method: string; id: number }) {
        let result: unknown = "0x3e8";
        if (r.method === "eth_getTransactionReceipt")
          result = {
            transactionHash: "0x" + "a".repeat(64),
            transactionIndex: "0x0",
            blockHash: "0x" + "b".repeat(64),
            blockNumber: "0x384",
            from: member,
            to: "0x" + "3".repeat(40),
            cumulativeGasUsed: "0x186a0",
            gasUsed: "0x186a0",
            contractAddress: null,
            logs: [],
            logsBloom: "0x" + "0".repeat(512),
            status: confirm ? "0x1" : "0x0",
            effectiveGasPrice: "0x3b9aca00",
            type: "0x2",
          };
        return { jsonrpc: "2.0", id: r.id, result };
      }
      await route.fulfill({
        json: Array.isArray(request)
          ? request.map(response)
          : response(request),
      });
    },
  );
  await page.goto("/#delegation");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Injected", exact: true }).click();
}
test("wrong network requires switching before a review", async ({ page }) => {
  await setup(page, { wrongNetwork: true });
  await expect(
    page.getByRole("button", { name: "Review delegation" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Switch network" }).click();
  await expect(
    page.getByRole("button", { name: "Review delegation" }),
  ).toBeEnabled();
});
test("RPC disagreement never opens a signing prompt", async ({ page }) => {
  await setup(page, { preflightFails: true });
  await page.getByLabel("Representative address").fill(representative);
  await page.getByRole("button", { name: "Review delegation" }).click();
  await expect(page.getByRole("alert")).toContainText("RPC_DIVERGENCE");
  expect(
    await page.evaluate(
      () => (window as Window & { testSubmitted?: boolean }).testSubmitted,
    ),
  ).toBeUndefined();
});
test("a declined signature leaves a clear recoverable review", async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel("Representative address").fill(representative);
  await page.getByRole("button", { name: "Review delegation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(representative);
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("alert")).toContainText("Signature declined");
});
test("reverted receipts are never shown as successful", async ({ page }) => {
  await setup(page, { revert: true });
  await page.getByLabel("Representative address").fill(representative);
  await page.getByRole("button", { name: "Review delegation" }).click();
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("alert")).toContainText("transaction reverted");
  await expect(page.getByText("Confirmed · operation completed")).toHaveCount(
    0,
  );
});

test("a successful receipt completes only after the confirmation window", async ({
  page,
}) => {
  await setup(page, { confirm: true });
  await page.getByLabel("Representative address").fill(representative);
  await page.getByRole("button", { name: "Review delegation" }).click();
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByText("Confirmed · operation completed")).toBeVisible();
});

test("self-delegation needs no pasted address and follows an account switch", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(
    (accounts) => (window as TestWallet).testAccounts!(accounts),
    [secondMember, member],
  );
  await expect(
    page.getByRole("button", {
      name: secondMember.slice(0, 6) + "…" + secondMember.slice(-4),
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Representative address")).toHaveValue("");
  await page
    .getByRole("button", { name: "Delegate to myself", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(secondMember);
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("alert")).toContainText("Signature declined");
  const transaction = await page.evaluate(
    () => (window as TestWallet).testTransaction,
  );
  expect(transaction?.from.toLowerCase()).toBe(secondMember.toLowerCase());
  expect(
    decodeFunctionData({ abi: tokenAbi, data: transaction!.data }),
  ).toEqual({
    functionName: "delegate",
    args: [secondMember],
  });
});

for (const self of [true, false]) {
  test(`${self ? "self-delegation" : "delegation"} signs with the selected second account in a multi-account wallet`, async ({
    page,
  }) => {
    await setup(page, {
      account: secondMember,
      exposedAccounts: [member, secondMember],
    });
    const preflights: { account: string; data: Hex }[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/preflight")
        preflights.push(request.postDataJSON());
    });
    const target = self ? secondMember : representative;
    if (!self) await page.getByLabel("Representative address").fill(target);
    await page
      .getByRole("button", {
        name: self ? "Delegate to myself" : "Review delegation",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Confirm in wallet" }).click();
    await expect(page.getByRole("alert")).toContainText("Signature declined");
    const transaction = await page.evaluate(
      () => (window as TestWallet).testTransaction,
    );
    expect(transaction?.from.toLowerCase()).toBe(secondMember.toLowerCase());
    expect(preflights).toHaveLength(2);
    for (const preflight of preflights) {
      expect(preflight.account.toLowerCase()).toBe(secondMember.toLowerCase());
      expect(preflight.data).toBe(transaction?.data);
    }
    expect(
      decodeFunctionData({ abi: tokenAbi, data: transaction!.data }),
    ).toEqual({
      functionName: "delegate",
      args: [target],
    });
  });
}

test("an unavailable wallet shows an error and self-delegation can be retried", async ({
  page,
}) => {
  await setup(page, { accountsUnavailable: true });
  await page
    .getByRole("button", { name: "Delegate to myself", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Wallet temporarily unavailable",
  );
  expect(
    await page.evaluate(() => (window as TestWallet).testSubmitted),
  ).toBeUndefined();
  await page.evaluate(() => {
    (window as TestWallet).testAccountsUnavailable = false;
  });
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("alert")).toContainText("Signature declined");
  expect(await page.evaluate(() => (window as TestWallet).testSubmitted)).toBe(
    true,
  );
});

test("switching accounts during the final simulation blocks submission and allows a fresh self-delegation", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Delegate to myself", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached!: () => void;
  const requested = new Promise<void>((resolve) => {
    reached = resolve;
  });
  await page.route("**/api/preflight", async (route) => {
    reached();
    await held;
    await route.fallback();
  });
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await requested;
  await page.evaluate(
    (accounts) => (window as TestWallet).testAccounts!(accounts),
    [secondMember, member],
  );
  release();
  await expect(page.getByRole("dialog")).toContainText(
    "Operation not completed",
  );
  await expect(
    page.getByRole("button", { name: "Confirm in wallet" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => (window as TestWallet).testSubmitted),
  ).toBeUndefined();
  await page.getByRole("button", { name: "Close review" }).click();
  await page
    .getByRole("button", { name: "Delegate to myself", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(secondMember);
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("alert")).toContainText("Signature declined");
  const transaction = await page.evaluate(
    () => (window as TestWallet).testTransaction,
  );
  expect(transaction?.from.toLowerCase()).toBe(secondMember.toLowerCase());
  expect(
    decodeFunctionData({ abi: tokenAbi, data: transaction!.data }),
  ).toEqual({
    functionName: "delegate",
    args: [secondMember],
  });
});

test("revoking the reviewed account without an event still blocks submission", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Delegate to myself", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.route("**/api/preflight", async (route) => {
    await page.evaluate(
      (account) => (window as TestWallet).testAccounts!([account], false),
      secondMember,
    );
    await route.fallback();
  });
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Wallet or network changed",
  );
  expect(
    await page.evaluate(() => (window as TestWallet).testSubmitted),
  ).toBeUndefined();
});
