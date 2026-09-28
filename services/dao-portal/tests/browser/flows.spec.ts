import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  controlledPortal,
  injectWallet,
  paymentProposal,
  ballot,
  config,
  recipient,
} from "./fixtures";
import { decodeFunctionData } from "viem";
import { ballotsAbi } from "../../shared/abis";
import { newDraft, description } from "../../src/drafts";
test("verified treasury identifies payments and preserves exact balances", async ({
  page,
}) => {
  await controlledPortal(page);
  await page.goto("/#treasury");
  await expect(
    page.getByRole("heading", { name: "V2 treasury", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1.23", { exact: true })).toBeVisible();
  await expect(page.getByText("Balances verified at block 936")).toHaveCount(2);
  const pending = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Identified pending payments" }),
  });
  await expect(pending).toContainText("Fund the habitat research");
  await expect(pending).not.toContainText("Update a governance parameter");
  await expect(page.locator("main")).not.toContainText(/undefined|NaN/);
});
test("unavailable, syncing, empty and stale data stay distinct", async ({
  page,
}) => {
  const state = await controlledPortal(page);
  state.unavailable = true;
  state.health = "setup";
  await page.goto("/#treasury");
  await expect(page.locator("main")).not.toContainText(
    "Balances verified at block",
  );
  await expect(page.locator(".treasury-panel").first()).toContainText(
    "V2 is being prepared",
  );
  state.health = "syncing";
  await page.reload();
  await expect(page.locator(".treasury-panel").first()).toContainText(
    "History is synchronizing",
  );
  state.unavailable = false;
  state.health = "ok";
  state.empty = true;
  await page.goto("/#governance");
  await page.reload();
  await expect(
    page.getByText("No proposals in this confirmed view."),
  ).toBeVisible();
  await page.clock.install();
  await page.goto("/#treasury");
  await expect(page.getByText("1.23", { exact: true })).toBeVisible();
  state.fail = true;
  await page.clock.fastForward(31000);
  await page.clock.fastForward(2000);
  await expect(
    page
      .locator("main")
      .getByText(
        "Showing previously retrieved data. It may be out of date; signing remains unavailable.",
      )
      .first(),
  ).toBeVisible();
  await expect(page.getByText("1.23", { exact: true })).toBeVisible();
});
test("history keeps the original date separate from import provenance", async ({
  page,
}) => {
  await controlledPortal(page);
  await page.goto("/#history");
  await page
    .getByRole("button", { name: "Snapshot archive", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "The original community decision" }),
  ).toBeVisible();
  await expect(page.getByText("1 Jan 2024, 00:00 UTC")).toBeVisible();
  await expect(page.getByText("28 Sept 2026, 12:00 UTC")).not.toBeVisible();
  await page
    .getByText("Archived content and provenance", { exact: true })
    .click();
  await expect(page.getByText("28 Sept 2026, 12:00 UTC")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Original source" }),
  ).toHaveAttribute("href", /snapshot.org/);
  await expect(page.locator("main")).toContainText(
    "Results and signatures have not been independently verified",
  );
});
test("proposal detail separates approval, timelock and advisory results", async ({
  page,
}) => {
  await controlledPortal(page);
  await page.goto(
    "/#proposal/" + paymentProposal.contract + "/" + paymentProposal.id,
  );
  await expect(
    page.getByText("Timelock · waiting", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Pay 10 POL to " + recipient)).toBeVisible();
  await expect(page.locator("main")).toContainText("(estimated)");
  await expect(page.locator(".proposal-text")).toHaveText(
    paymentProposal.description,
  );
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({
    path:
      "docs/evidence/visual/proposal-controlled-" +
      test.info().project.name +
      ".png",
    fullPage: true,
  });
  await page.goto("/#proposal/" + ballot.contract + "/1");
  await expect(page.getByText("Winner: Forest")).toBeVisible();
  await expect(page.locator("main")).toContainText(
    "They cannot move treasury funds.",
  );
});
test("draft import, export and reviewed text keep the existing format", async ({
  page,
}) => {
  await controlledPortal(page);
  const draft = newDraft();
  draft.kind = "community";
  draft.title = "Legacy draft →";
  draft.options = ["Forest", "Ocean"];
  for (const field of Object.keys(draft.sections))
    draft.sections[field] = "Original " + field + "\nPreserved.";
  draft.discussion = "https://example.org";
  await page.goto("/#create");
  await page.getByLabel("Import draft").setInputFiles({
    name: "original.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(draft)),
  });
  await page.getByRole("button", { name: "4 Review" }).click();
  expect(await page.locator("#exact-text").textContent()).toBe(
    description(draft),
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual(draft);
});
test("wallet menu avoids accidental disconnect and account changes invalidate a review", async ({
  page,
}) => {
  await controlledPortal(page);
  await injectWallet(page);
  await page.goto("/#delegation");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Injected", exact: true }).click();
  await page.getByRole("button", { name: "0x1111…1111" }).click();
  await expect(
    page.getByRole("button", { name: "Disconnect", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByLabel("Representative address").fill(recipient);
  await page
    .getByRole("button", { name: "Review delegation", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(
    (next) =>
      (window as Window & { testAccount?: (v: string) => void }).testAccount?.(
        next,
      ),
    recipient,
  );
  await expect(
    page.getByRole("button", { name: "Confirm in wallet" }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText(
    "Wallet or network changed",
  );
});
test("exit edits and expiration invalidate burn acknowledgment and transaction review", async ({
  page,
}) => {
  await controlledPortal(page);
  await injectWallet(page);
  await page.clock.install();
  await page.goto("/#ragequit");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Injected", exact: true }).click();
  await page.getByLabel("MANA to burn", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Preview my exit" }).click();
  const acknowledgment = page.getByRole("checkbox", {
    name: "I understand that my MANA will be permanently burned.",
  });
  await acknowledgment.check();
  await page
    .getByLabel("Maximum decrease from preview (%)", { exact: true })
    .fill("1.25");
  await expect(acknowledgment).not.toBeChecked();
  await acknowledgment.check();
  await page
    .getByRole("checkbox", { name: "Send assets to another address" })
    .check();
  await page.getByLabel("Payout recipient", { exact: true }).fill(recipient);
  await expect(acknowledgment).not.toBeChecked();
  await acknowledgment.check();
  await page
    .getByRole("button", { name: "Review permanent exit", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Review MANA burn and assets to receive",
  );
  await page.clock.fastForward(121000);
  await expect(
    page.getByRole("button", { name: "Confirm in wallet" }),
  ).toBeDisabled();
  await expect(page.getByRole("dialog")).toContainText("The preview expired.");
  await page.getByRole("button", { name: "Close review" }).click();
  await expect(acknowledgment).not.toBeChecked();
  await page.getByLabel("MANA to burn", { exact: true }).fill("2");
  await expect(
    page.getByRole("button", { name: "Review permanent exit", exact: true }),
  ).toBeDisabled();
});

test("reviewed proposal text and choices reach the wallet unchanged", async ({
  page,
}) => {
  await controlledPortal(page);
  await injectWallet(page);
  const draft = newDraft();
  draft.kind = "community";
  draft.title = "Exact text → no rewrite";
  draft.options = ["Forest", "Ocean"];
  for (const field of Object.keys(draft.sections))
    draft.sections[field] = " Leading whitespace and original line\n" + field;
  await page.goto("/#create");
  await page.getByLabel("Import draft").setInputFiles({
    name: "review.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(draft)),
  });
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Injected", exact: true }).click();
  await page.getByRole("button", { name: "4 Review" }).click();
  const reviewed = await page.locator("#exact-text").textContent();
  expect(reviewed).toBe(description(draft));
  await page
    .getByRole("button", { name: "Simulate & review publication" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("alert")).toContainText("Signature declined");
  const transaction = await page.evaluate(
    () =>
      (
        window as Window & {
          testTransaction?: { to: string; data: `0x${string}` };
        }
      ).testTransaction,
  );
  expect(transaction?.to.toLowerCase()).toBe(
    config.contracts.ballots!.address.toLowerCase(),
  );
  const decoded = decodeFunctionData({
    abi: ballotsAbi,
    data: transaction!.data,
  });
  expect(decoded.functionName).toBe("createBallot");
  expect(decoded.args).toEqual([reviewed, draft.options]);
});

test("failed final simulation prevents a wallet submission", async ({
  page,
}) => {
  await controlledPortal(page);
  await injectWallet(page);
  await page.goto("/#delegation");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Injected", exact: true }).click();
  await page.getByLabel("Representative address").fill(recipient);
  await page
    .getByRole("button", { name: "Review delegation", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.route("**/api/preflight", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Controlled simulation failure" },
    }),
  );
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Operation not completed",
  );
  await expect(page.getByRole("alert")).toContainText(
    "We couldn’t verify the latest data. Try again.",
  );
  expect(
    await page.evaluate(
      () => (window as Window & { testSubmitted?: boolean }).testSubmitted,
    ),
  ).toBeUndefined();
});
