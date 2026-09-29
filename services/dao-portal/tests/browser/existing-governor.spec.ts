import { test, expect, type Page } from "@playwright/test";
import { decodeFunctionData } from "viem";
import {
  controlledPortal,
  injectWallet,
  config,
  paymentProposal,
  member,
} from "./fixtures";
import { governorAbi } from "../../shared/abis";
async function connect(page: Page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Injected", exact: true }).click();
}
for (const [state, button, fn] of [
  ["Active", "Review vote →", "castVote"],
  ["Succeeded", "Review execution →", "execute"],
  ["Pending", "Cancel pending proposal", "cancel"],
]) {
  test(`existing Governor ${fn} uses its real direct call`, async ({
    page,
  }) => {
    await controlledPortal(page);
    await injectWallet(page);
    await page.route("**/api/proposals/0x*/*", (route) =>
      route.fulfill({ json: { ...paymentProposal, state, proposer: member } }),
    );
    await page.goto(
      `/#proposal/${paymentProposal.contract}/${paymentProposal.id}`,
    );
    await connect(page);
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Confirm in wallet" }).click();
    await expect(page.getByRole("alert")).toContainText("Signature declined");
    const sent = await page.evaluate(
      () =>
        (
          window as Window & {
            testTransaction?: { to: string; data: `0x${string}` };
          }
        ).testTransaction,
    );
    expect(sent?.to.toLowerCase()).toBe(
      config.contracts.governor!.address.toLowerCase(),
    );
    expect(
      decodeFunctionData({ abi: governorAbi, data: sent!.data }).functionName,
    ).toBe(fn);
    await expect(page.getByRole("button", { name: /Schedule/ })).toHaveCount(0);
  });
}
test("missing module leaves delegation available and points advisory votes to Snapshot", async ({
  page,
}) => {
  await controlledPortal(page);
  await injectWallet(page);
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        ...config,
        contracts: { ...config.contracts, ragequitModule: undefined },
        capabilities: { ...config.capabilities, ragequit: false },
      },
    }),
  );
  await page.goto("/#delegation");
  await connect(page);
  await expect(
    page.getByRole("button", { name: "Delegate to myself" }),
  ).toBeEnabled();
  await page.goto("/#ragequit");
  await expect(
    page
      .getByText("The ragequit module has not been deployed and configured.")
      .first(),
  ).toBeVisible();
  await page.goto("/#governance");
  await page
    .getByRole("button", { name: "Community ballots", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open Snapshot ↗" }),
  ).toHaveAttribute("href", config.snapshotUrl!);
});
test("revoked allowance explains unavailability beside the exit controls", async ({
  page,
}) => {
  await controlledPortal(page);
  await injectWallet(page);
  await page.route("**/api/redeem-preview?*", (route) =>
    route.fulfill({
      json: {
        module: config.contracts.ragequitModule!.address,
        treasury: config.contracts.treasury!.address,
        mana: config.contracts.mana!.address,
        basket: ["gem", "weth", "usdcNative"].map((role, i) => ({
          address: config.contracts[role as "gem"]!.address,
          symbol: ["GEM", "WETH", "USDC"][i],
          decimals: i === 2 ? 6 : 18,
          balance: i === 2 ? "0" : "1000",
          allowance: "0",
          amount: i === 2 ? "0" : "100",
        })),
        amounts: ["100", "100", "0"],
        supply: "1000000000000000000000",
        block: "1000",
        available: false,
        reasons: [
          "GEM: the exit exceeds the treasury allowance. A DAO authorization is required.",
        ],
      },
    }),
  );
  await page.goto("/#ragequit");
  await connect(page);
  await page.getByLabel("MANA to burn", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Preview my exit" }).click();
  await expect(page.getByText(/GEM: the exit exceeds/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review permanent exit", exact: true }),
  ).toBeDisabled();
});
