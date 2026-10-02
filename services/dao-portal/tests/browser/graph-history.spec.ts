import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { controlledPortal, config } from "./fixtures";
import { syncProgress } from "../../shared/sync";
import type { Health } from "../../shared/domain";

test("supplemental history shows scoped real counts, provenance and safe fallback without claiming full sync", async ({
  page,
}) => {
  await controlledPortal(page);
  const sources = Object.values(config.contracts).map((c) => ({
    contract: c.address,
    block: "250",
    updatedAt: Date.now(),
  }));
  const health: Health = {
    status: "syncing",
    signingAllowed: true,
    historyComplete: false,
    head: "1000064",
    confirmedHead: "1000000",
    checkedAt: new Date().toISOString(),
    sources,
    sync: syncProgress(config, sources, "1000000"),
    graphHistory: {
      source: "The Graph + RPC",
      status: "ready",
      complete: false,
      asOfBlock: "999936",
      checkedAt: Date.now(),
    },
  };
  let available = true;
  await page.route("**/api/health", (r) => r.fulfill({ json: health }));
  await page.route("**/api/overview", (r) =>
    r.fulfill({
      json: {
        activeVotes: 0,
        readyForExecution: 1,
        complete: false,
        countsVerified: available,
      },
    }),
  );
  await page.clock.install();
  await page.goto("/#overview");
  const panel = page.getByRole("region", { name: "History sync", exact: true });
  const metrics = page.getByRole("region", { name: "Governance summary" });
  await expect(panel).toContainText("Verified through block 999,936");
  await expect(panel).toContainText(
    "Full historical coverage is still being checked.",
  );
  await expect(panel.getByRole("progressbar")).not.toHaveAttribute(
    "value",
    "100",
  );
  await expect(
    metrics.getByText("Among verified indexed proposals", { exact: true }),
  ).toHaveCount(2);
  await expect(metrics.locator("strong").first()).toHaveText("0");
  expect(
    (
      await new AxeBuilder({ page })
        .include(".sync-status")
        .include(".metric-grid")
        .analyze()
    ).violations,
  ).toEqual([]);
  for (const theme of ["light", "dark"]) {
    await page.getByRole("combobox", { name: "Theme" }).selectOption(theme);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: `docs/evidence/journal-pilot-2026-10-02/graph-history-${theme}-${width}.png`,
          fullPage: true,
        });
    }
  }
  available = false;
  health.graphHistory!.status = "stale";
  await page.clock.fastForward(31000);
  await expect(panel).toContainText("Supplemental history is unavailable.");
  await expect(
    metrics.getByText("Among verified indexed proposals", { exact: true }),
  ).toHaveCount(0);
  await expect(metrics.locator("strong").first()).toHaveText("—");
});
