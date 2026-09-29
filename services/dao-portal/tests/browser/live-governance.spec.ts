import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { controlledPortal, injectWallet, paymentProposal } from "./fixtures";

test("receipt recovery is accessible during sync and preserves the direct proposal link", async ({
  page,
}) => {
  const state = await controlledPortal(page);
  state.health = "syncing";
  let requested = "";
  await page.route("**/api/proposals/resolve", (route) => {
    requested = route.request().postDataJSON().transactionHash;
    return route.fulfill({ json: paymentProposal });
  });
  await page.goto("/#governance");
  await page
    .getByText("Find a proposal missing from the history", { exact: true })
    .click();
  await page
    .getByLabel("Creation transaction hash")
    .fill(paymentProposal.transactionHash);
  await page
    .getByRole("button", { name: "Find proposal", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(paymentProposal.id));
  expect(requested).toBe(paymentProposal.transactionHash);
  await expect(page.locator(".proposal-text")).toHaveText(
    paymentProposal.description,
  );
});

test("live governance banner and recovery form fit both themes and reflow", async ({
  page,
}) => {
  test.setTimeout(90000);
  const state = await controlledPortal(page);
  state.health = "syncing";
  await page.emulateMedia({ reducedMotion: "reduce" });
  await injectWallet(page);
  await page.goto("/#governance");
  await page
    .getByText("Find a proposal missing from the history", { exact: true })
    .click();
  for (const theme of ["light", "dark"])
    for (const width of [390, 768, 1440, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.getByLabel("Theme", { exact: true }).selectOption(theme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width !== 320)
        await page.screenshot({
          path: `docs/evidence/visual/live-governance-${theme}-${width}-2026-09-29.png`,
          fullPage: true,
        });
      if (width === 390) {
        const a = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(a.violations.map((v) => v.id)).toEqual([]);
      }
    }
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.addStyleTag({ content: "html {font-size:200% !important;}" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("an unverified action batch requires explicit acknowledgment before wallet signing", async ({
  page,
}) => {
  const { newDraft } = await import("../../src/drafts");
  const { payment } = await import("./fixtures");
  await controlledPortal(page);
  await injectWallet(page);
  await page.route("**/api/simulate-actions", (route) =>
    route.fulfill({
      json: {
        ok: false,
        complete: false,
        block: "1000",
        warning:
          "The combined actions could not be verified by both data providers.",
      },
    }),
  );
  const draft = newDraft();
  draft.title = "Batch requiring review";
  draft.actions = [payment, payment];
  for (const key of Object.keys(draft.sections))
    draft.sections[key] = "Review " + key;
  await page.goto("/#create");
  await page
    .getByLabel("Import draft")
    .setInputFiles({
      name: "batch.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(draft)),
    });
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Injected", exact: true }).click();
  await page.getByRole("button", { name: "4 Review" }).click();
  await page
    .getByRole("checkbox", { name: /I checked that the written budget/ })
    .check();
  await page
    .getByRole("button", { name: "Simulate & review publication" })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm in wallet" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "I understand that the combined actions have not been verified and still want to publish them for voting.",
    })
    .check();
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("alert")).toContainText("Signature declined");
});
