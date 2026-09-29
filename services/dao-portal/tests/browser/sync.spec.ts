import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { controlledPortal, config } from "./fixtures";
import { syncProgress } from "../../shared/sync";
import type { Health } from "../../shared/domain";

test("sync percentage refreshes, exposes accessible source details and distinguishes errors from completion", async ({
  page,
}) => {
  await controlledPortal(page);
  const sources = Object.values(config.contracts).map((entry) => ({
    contract: entry.address,
    block: "250",
    updatedAt: Date.now(),
  }));
  let health: Health = {
    status: "syncing",
    signingAllowed: false,
    head: "1064",
    confirmedHead: "1000",
    checkedAt: new Date().toISOString(),
    sources,
    sync: syncProgress(config, sources, "1000"),
  };
  await page.route("**/api/health", (route) => route.fulfill({ json: health }));
  await page.clock.install();
  await page.goto("/#delegation");
  const panel = page.getByRole("region", { name: "History sync", exact: true });
  const progress = panel.getByRole("progressbar");
  await expect(progress).toHaveAttribute("value", String(health.sync!.percent));
  await expect(panel).toContainText("Syncing in the background");
  await panel.getByText("Sync details", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    panel.getByText("Governor / treasury", { exact: true }),
  ).toBeVisible();
  await expect(panel).toContainText("Indexed through block 250");
  expect(
    (await new AxeBuilder({ page }).include(".sync-status").analyze())
      .violations,
  ).toEqual([]);
  health = { ...health, status: "degraded", reason: "INFURA_REQUEST_TIMEOUT" };
  await page.clock.fastForward(21000);
  await expect(panel).toContainText("Retrying after an error");
  await expect(panel).toContainText("The index provider timed out.");
  await expect(progress).toHaveAttribute("value", String(health.sync!.percent));
  health = {
    ...health,
    head: null,
    confirmedHead: null,
    sync: syncProgress(config, sources, null),
  };
  await page.clock.fastForward(21000);
  await expect(panel).toContainText("Sync status unavailable");
  await expect(progress).not.toHaveAttribute("value");
  health = {
    ...health,
    status: "ok",
    head: "1064",
    confirmedHead: "1000",
    sync: syncProgress(
      config,
      sources.map((s) => ({ ...s, block: "1000" })),
      "1000",
    ),
  };
  // Approval sources are independent and still pending: governance-ready is not full sync.
  await page.clock.fastForward(21000);
  await expect(panel).toContainText("Syncing in the background");
  await expect(progress).not.toHaveAttribute("value", "100");
});

test("sync indicator fits light/dark layouts and 320px reflow", async ({
  page,
}) => {
  await controlledPortal(page);
  const sources = Object.values(config.contracts).map((entry) => ({
    contract: entry.address,
    block: "1",
    updatedAt: Date.now(),
  }));
  await page.route("**/api/health", (route) =>
    route.fulfill({
      json: {
        status: "syncing",
        signingAllowed: false,
        head: "1000064",
        confirmedHead: "1000000",
        checkedAt: new Date().toISOString(),
        sources,
        sync: syncProgress(config, sources, "1000000"),
      },
    }),
  );
  await page.goto("/#overview");
  const panel = page.getByRole("region", { name: "History sync", exact: true });
  await panel.getByText("Sync details", { exact: true }).click();
  for (const theme of ["light", "dark"]) {
    await page.getByRole("combobox", { name: "Theme" }).selectOption(theme);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(panel).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});
