import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { controlledPortal, config, injectWallet, member } from "./fixtures";

test("all six map locations open their existing routes and return to camp", async ({
  page,
}) => {
  await controlledPortal(page);
  await page.goto("/");
  for (const [label, route, heading] of [
    ["Council · Governance", "governance", "Governance"],
    ["Treasury · DAO funds", "treasury", "Treasury"],
    ["Seekers · Delegation", "delegation", "Delegation"],
    ["Planning table · Create proposal", "create", "Create a proposal"],
    ["Chronicle · History", "history", "Governance history"],
    ["Departure · Exit DAO", "ragequit", "Exit DAO"],
  ]) {
    const link = page
      .getByRole("navigation", { name: "Camp map", exact: true })
      .getByRole("link", { name: label, exact: true });
    await link.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`#${route}$`));
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Back to camp", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "The Seekers’ Camp", exact: true }),
    ).toBeVisible();
    // Route navigation restores focus on the next animation frame.
    await expect(page.locator("#main-content")).toBeFocused();
  }
});

test("camp follows the saved theme and remains usable without the artwork", async ({
  page,
}) => {
  await controlledPortal(page);
  await page.goto("/");
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await expect(page.locator(".camp-map:visible img")).toHaveAttribute(
    "src",
    "/journal/map-small.webp",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".camp-map:visible img")).toHaveAttribute(
    "src",
    "/journal/map-small.webp",
  );
  await page.getByLabel("Theme", { exact: true }).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".camp-map:visible img")).toHaveAttribute(
    "src",
    "/journal/map-small.webp",
  );
  await page.route("**/journal/map*.webp", (r) => r.abort());
  await page.reload();
  await expect(page.locator(".camp-map:visible")).toHaveClass(
    /camp-map-fallback/,
  );
  await page
    .getByRole("navigation", { name: "Camp destinations" })
    .getByRole("link", { name: /Treasury/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Treasury", exact: true }),
  ).toBeVisible();
});

test("map has accessible mobile targets, reflows and respects reduced motion", async ({
  page,
}) => {
  await controlledPortal(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");
  for (const theme of ["light", "dark"]) {
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    for (const target of await page.locator(".camp-hotspot:visible").all()) {
      const box = await target.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
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
  }
});

test("treasury numbers expose exact fractions and distinguish zero, dust and revocable allowance", async ({
  page,
}) => {
  await controlledPortal(page);
  await page.route("**/api/treasury", (r) =>
    r.fulfill({
      json: {
        asOfBlock: "1000",
        accounts: [
          {
            role: "treasury",
            address: config.contracts.treasury!.address,
            assets: [
              {
                symbol: "GEM",
                address: config.contracts.gem!.address,
                balance: "657100440000000000000000",
                decimals: 18,
                ragequit: true,
                allowance: (2n ** 256n - 1n).toString(),
              },
              {
                symbol: "WETH",
                address: config.contracts.weth!.address,
                balance: "80000000000000",
                decimals: 18,
              },
              {
                symbol: "USDC",
                address: config.contracts.usdcNative!.address,
                balance: "0",
                decimals: 6,
              },
              {
                symbol: "USDC.e",
                address: config.contracts.usdcBridged!.address,
                balance: "1",
                decimals: 6,
              },
            ],
          },
        ],
      },
    }),
  );
  await page.goto("/#treasury");
  const exact = page.getByRole("button", {
    name: "≈657,100 GEM · Show exact amount",
    exact: true,
  });
  await exact.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Exact amount: 657100.44 GEM", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Unlimited (revocable)", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "0.00 USDC · Show exact amount",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "<0.01 USDC.e · Show exact amount",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "0.00008 WETH · Show exact amount",
      exact: true,
    }),
  ).toBeVisible();
});

test("Max and exit quote keep every MANA decimal even when the balance is rounded", async ({
  page,
}) => {
  await controlledPortal(page);
  await injectWallet(page);
  const raw = "1234567890123456789";
  await page.route("**/api/members/*", (r) =>
    r.fulfill({
      json: {
        balance: raw,
        votes: raw,
        delegate: member,
        supply: "1000000000000000000000",
        allowance: "0",
        asOfBlock: "1000",
      },
    }),
  );
  await page.goto("/#ragequit");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Injected", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "≈1 MANA · Show exact amount",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Max", exact: true }).click();
  await expect(page.getByLabel("MANA to burn", { exact: true })).toHaveValue(
    "1.234567890123456789",
  );
  const request = page.waitForRequest((r) =>
    r.url().includes("/api/redeem-preview?"),
  );
  await page
    .getByRole("button", { name: "Preview my exit", exact: true })
    .click();
  expect(new URL((await request).url()).searchParams.get("amount")).toBe(raw);
  await expect(
    page.getByRole("button", { name: /0.00 USDC.*Show exact amount/ }).first(),
  ).toBeVisible();
});
