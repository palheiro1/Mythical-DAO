import { test, expect } from "@playwright/test";
import {
  controlledPortal,
  injectWallet,
  paymentProposal,
  member,
  recipient,
} from "./fixtures";
const route = `/#proposal/${paymentProposal.contract}/${paymentProposal.id}`;
test("second voter is recorded before review; switching wallet clears that status", async ({
  page,
}) => {
  await controlledPortal(page);
  await injectWallet(page);
  await page.route("**/api/proposals/*/*", (r) =>
    r.fulfill({ json: { ...paymentProposal, state: "Active" } }),
  );
  await page.route("**/api/vote-status/**", (r) =>
    r.fulfill({
      json: {
        account: r.request().url().split("/").at(-1)?.toLowerCase(),
        hasVoted: r
          .request()
          .url()
          .toLowerCase()
          .endsWith(member.toLowerCase()),
        votingPower: "1000000000000000000000",
        currentBalance: "17009000000000000000000",
        checkedAt: Date.now(),
      },
    }),
  );
  await page.goto(route);
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Injected", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Vote recorded" }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "This wallet has already voted on this proposal. Totals refresh every 2 minutes.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Your voting power" }),
  ).toContainText("1,000 MANA");
  await expect(
    page.getByRole("region", { name: "Your voting power" }),
  ).toContainText("17,009 MANA");
  await page.evaluate((account) => {
    (window as Window & { testAccount?: (a: string) => void }).testAccount?.(
      account,
    );
  }, recipient);
  await expect(
    page.getByRole("button", { name: "Review vote →" }),
  ).toBeEnabled();
});
test("every card shows results and polls updated totals, including closed proposals", async ({
  page,
}) => {
  await controlledPortal(page);
  let weight = "2000000000000000000";
  await page.route("**/api/proposals?*", (r) =>
    r.fulfill({
      json: {
        items: [
          { ...paymentProposal, votes: ["0", weight, "0"] },
          {
            ...paymentProposal,
            id: "2",
            state: "Executed",
            description: "# Closed decision",
            votes: ["0", "5000000000000000000", "0"],
          },
        ],
        nextBefore: null,
      },
    }),
  );
  await page.clock.install();
  await page.goto("/#governance");
  await expect(page.locator(".decision-results")).toHaveCount(2);
  await expect(page.locator(".decision-results").first()).toContainText(
    "For 2",
  );
  await expect(page.locator(".decision-results").last()).toContainText("For 5");
  weight = "34000000000000000000000";
  await page.clock.fastForward(31000);
  await expect(page.locator(".decision-results").first()).toContainText(
    "34,000",
  );
});
test("voter lookup failure cannot enable a duplicate vote or hide previously verified totals", async ({
  page,
}) => {
  await controlledPortal(page);
  await injectWallet(page);
  await page.route("**/api/proposals/*/*", (r) =>
    r.fulfill({ json: { ...paymentProposal, state: "Active" } }),
  );
  await page.route("**/api/vote-status/**", (r) =>
    r.fulfill({ status: 503, json: { error: "RPC_UNAVAILABLE" } }),
  );
  await page.goto(route);
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Injected", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Review vote →" }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Voting status unavailable. Retrying automatically; voting stays disabled until verified.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Voting results" }),
  ).toBeVisible();
});
