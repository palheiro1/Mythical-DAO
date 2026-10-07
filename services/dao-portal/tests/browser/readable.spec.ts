import { test, expect } from "@playwright/test";
import { controlledPortal, paymentProposal, config } from "./fixtures";
test("future deadlines are human estimates and exact block metadata remains accessible", async ({
  page,
}) => {
  await controlledPortal(page);
  const p = {
    ...paymentProposal,
    state: "Active",
    snapshot: "900",
    deadline: "2000",
  };
  await page.route("**/api/proposals**", (r) =>
    r.fulfill({
      json: r.request().url().includes("/proposals/") ? p : { items: [p] },
    }),
  );
  await page.goto("/#governance");
  await expect(page.locator(".decision-state")).toContainText(
    "Closes in about",
  );
  await expect(page.locator(".decision-state")).not.toContainText("block");
  await page.locator(".decision-row").click();
  await expect(page.locator(".timing")).toContainText("Closes in about");
  await page.locator(".timing .time-details").last().locator("summary").click();
  await expect(page.locator(".timing")).toContainText("Block 2,000");
  await expect(page.locator(".timing")).toContainText(
    "recent observed block pace",
  );
});
test("titles abbreviate addresses, readers can reveal originals and copy an exact address", async ({
  page,
  context,
}) => {
  await controlledPortal(page);
  const a = config.contracts.governor!.address;
  const p = {
    ...paymentProposal,
    description: "# Authorize " + a + "\n\nOriginal record for " + a,
  };
  await page.route("**/api/proposals**", (r) =>
    r.fulfill({
      json: r.request().url().includes("/proposals/") ? p : { items: [p] },
    }),
  );
  await page.goto("/#governance");
  await expect(page.locator(".decision-title h3")).not.toContainText(a);
  await page.locator(".decision-row").click();
  await expect(page.locator("h1")).not.toContainText(a);
  await page.locator(".original-document summary").click();
  await expect(page.locator(".original-document pre")).toHaveText(
    p.description,
  );
  const address = page
    .locator(".proposal-document .address-disclosure")
    .first();
  await address.getByRole("button", { name: /Show full address/ }).click();
  await expect(address.locator("code")).toHaveText(a);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await address
    .getByRole("button", { name: "Copy address", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(a);
});
test("unavailable date lookup never invents a historical date", async ({
  page,
}) => {
  await controlledPortal(page);
  await page.route(
    /^https:\/\/(polygon-bor-rpc\.publicnode\.com|polygon\.drpc\.org)\//,
    (r) => r.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.goto("/#governance");
  await expect(page.locator(".decision-state").first()).toContainText(
    "Date unavailable",
    { timeout: 15000 },
  );
  await expect(page.locator(".decision-row").first()).toContainText("Approved");
});

test("calendar uses its public fallback when the primary is overloaded", async ({
  page,
}) => {
  await controlledPortal(page);
  await page.route("https://polygon.drpc.org/**", (r) =>
    r.fulfill({
      status: 529,
      json: {
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32000, message: "upstream overloaded" },
      },
    }),
  );
  await page.goto("/#governance");
  await expect(page.locator(".decision-state time").first()).toBeVisible();
  await expect(page.locator(".decision-row").first()).toContainText("Approved");
});

test("calendar remains readable when backend health is unavailable", async ({
  page,
}) => {
  await controlledPortal(page);
  await page.route("**/api/health", (r) =>
    r.fulfill({ status: 503, body: "unavailable" }),
  );
  await page.goto("/#governance");
  await expect(page.locator(".decision-state time").first()).toBeVisible();
  await expect(page.locator(".decision-row").first()).toContainText("Approved");
});
