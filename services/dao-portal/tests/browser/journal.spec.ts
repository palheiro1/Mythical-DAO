import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  controlledPortal,
  config,
  paymentProposal,
  recipient,
} from "./fixtures";
import { encodeFunctionData, maxUint256 } from "viem";
import { tokenAbi } from "../../shared/abis";

test("decision summaries add exact payments by address and keep approvals distinct", async ({
  page,
}) => {
  await controlledPortal(page);
  const native = config.contracts.usdcNative!.address;
  const bridged = config.contracts.usdcBridged!.address;
  const targets = [recipient, recipient, native, native, bridged, native];
  const values = ["10000000000000000000", "1000000000000", "0", "0", "0", "0"];
  const calldatas = [
    "0x",
    "0x",
    encodeFunctionData({
      abi: tokenAbi,
      functionName: "transfer",
      args: [recipient, 1200000n],
    }),
    encodeFunctionData({
      abi: tokenAbi,
      functionName: "transfer",
      args: [recipient, 30000n],
    }),
    encodeFunctionData({
      abi: tokenAbi,
      functionName: "transfer",
      args: [recipient, 4560000n],
    }),
    encodeFunctionData({
      abi: tokenAbi,
      functionName: "approve",
      args: [recipient, maxUint256],
    }),
  ];
  await page.route("**/api/proposals?*", (r) =>
    r.fulfill({
      json: {
        items: [{ ...paymentProposal, targets, values, calldatas }],
        nextCursor: null,
      },
    }),
  );
  await page.goto("/#governance");
  await expect(page.locator(".decision-effect strong")).toHaveText(
    "10.000001 POL + 1.23 USDC + 4.56 USDC.e + 1 token authorizations",
  );
  await expect(page.locator(".decision-row")).toHaveAttribute(
    "href",
    `#proposal/${paymentProposal.contract}/${paymentProposal.id}`,
  );
});

test("compact map expands, traps focus, closes with Escape and keeps the original destinations", async ({
  page,
}) => {
  await controlledPortal(page);
  await page.goto("/");
  const expand = page.getByRole("button", { name: "Expand map", exact: true });
  await expand.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "The Seekers’ Camp" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog
      .getByRole("navigation", { name: "Expanded camp map" })
      .getByRole("link"),
  ).toHaveCount(6);
  await dialog.getByRole("button", { name: "Close map" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close map" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(expand).toBeFocused();
  await expand.click();
  await dialog
    .getByRole("navigation", { name: "Expanded camp map" })
    .getByRole("link", { name: "Treasury · DAO funds", exact: true })
    .click();
  await expect(page).toHaveURL(/#treasury$/);
  await expect(
    page.getByRole("heading", { name: "Treasury", exact: true }),
  ).toBeVisible();
});

test("initial health loading is not presented as a confirmed failure", async ({
  page,
}) => {
  await controlledPortal(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/health", async (r) => {
    await pending;
    await r.fulfill({
      json: { status: "ok", signingAllowed: true, sources: [], head: "1000" },
    });
  });
  try {
    await page.goto("/");
    await expect(page.locator(".setup-banner")).toContainText(
      "Checking live data…",
    );
    await expect(page.locator(".setup-banner")).not.toContainText(
      "couldn’t verify",
    );
    release();
    await expect(page.locator(".network-status")).toContainText(
      "Data verified",
    );
  } finally {
    release();
  }
});

test("the approved journal design covers every operational route", async ({
  page,
}) => {
  await controlledPortal(page);
  for (const route of ["overview", "governance", "treasury"]) {
    await page.goto("/#" + route);
    await expect(page.locator("html")).toHaveAttribute(
      "data-design",
      "journal",
    );
  }
  for (const route of [
    "delegation",
    "create",
    "ragequit",
    "history",
    "guide",
  ]) {
    await page.goto("/#" + route);
    await expect(page.locator("html")).toHaveAttribute(
      "data-design",
      "journal",
    );
  }
});

test("official artwork, layouts and map dialog pass the pilot visual matrix", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The matrix selects its own desktop and mobile widths.");
  test.setTimeout(120000);
  await controlledPortal(page);
  await page.route("**/api/health", (r) =>
    r.fulfill({
      json: {
        status: "syncing",
        signingAllowed: true,
        historyComplete: false,
        head: "1000",
        sources: [],
        sync: {
          percent: 27.5,
          governancePercent: 36,
          updatedAt: Date.now(),
          sources: [],
        },
      },
    }),
  );
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of ["overview", "governance", "treasury"]) {
        await page.goto("/#" + route);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.locator(".sync-percent")).toHaveText("27.50%");
        for (const img of await page
          .locator('img:visible[loading="lazy"]')
          .all())
          await img.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            page
              .locator("img:visible")
              .evaluateAll((images) =>
                images
                  .filter(
                    (i) =>
                      !(i as HTMLImageElement).complete ||
                      !(i as HTMLImageElement).naturalWidth,
                  )
                  .map((i) => i.getAttribute("src")),
              ),
          )
          .toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          route + " " + width,
        ).toBe(true);
        const violations = (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations;
        expect(
          violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => n.target),
          })),
          route + " " + theme + " " + width,
        ).toEqual([]);
        await page.locator("#main-content").focus();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `docs/evidence/journal-complete-2026-10-02/pilot-${route}-${theme}-${width}.png`,
          fullPage: true,
        });
      }
    }
    await page.goto("/");
    await page.getByRole("button", { name: "Expand map", exact: true }).click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.keyboard.press("Escape");
  }
});

test("treasury activity starts with six dated entries and expands the loaded history", async ({
  page,
}) => {
  await controlledPortal(page);
  await page.route("**/api/events", (r) =>
    r.fulfill({
      json: {
        items: Array.from({ length: 9 }, (_, i) => ({
          chain_id: 137,
          contract: config.contracts.usdcNative!.address,
          block_number: 900 - i,
          block_hash: "0x" + "a".repeat(64),
          tx_hash: "0x" + String(i).padStart(64, "0"),
          log_index: i,
          event_name: "Transfer",
          args: {},
        })),
      },
    }),
  );
  await page.goto("/#treasury");
  await expect(page.locator(".journal-activity")).toHaveCount(6);
  await expect(page.locator(".journal-activity time").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Show all 9 loaded entries", exact: true })
    .click();
  await expect(page.locator(".journal-activity")).toHaveCount(9);
  await page
    .getByRole("button", { name: "Show fewer entries", exact: true })
    .click();
  await expect(page.locator(".journal-activity")).toHaveCount(6);
});
