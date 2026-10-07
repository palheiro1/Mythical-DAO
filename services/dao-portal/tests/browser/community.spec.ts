import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  controlledPortal,
  config,
  paymentProposal,
  injectWallet,
} from "./fixtures";
import polygon from "../../deployments/polygon.json" with { type: "json" };
const configured = {
  ...config,
  contracts: {
    ...config.contracts,
    ...Object.fromEntries(
      ["mana", "usdcNative", "weth"].map((role) => [
        role,
        polygon.contracts[role as "mana"],
      ]),
    ),
  },
  integrations: {
    telegram: { channelUrl: "https://t.me/mythical_alerts" },
    discord: {
      serverId: "809857155401646151",
      channelId: "1195328129435177041",
      channelUrl:
        "https://discord.com/channels/809857155401646151/1195328129435177041",
    },
  },
};
async function setup(page: Parameters<typeof controlledPortal>[0]) {
  await controlledPortal(page);
  await page.route("**/api/config", (r) => r.fulfill({ json: configured }));
}
test("community order, Telegram instructions, contextual access and no eager widget", async ({
  page,
}) => {
  await setup(page);
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("widgetbot")) requests.push(r.url());
  });
  await page.goto("/#overview");
  await expect(
    page.getByRole("heading", { name: "Stay connected" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Get governance alerts" }),
  ).toHaveAttribute("href", "https://t.me/mythical_alerts");
  expect(await page.locator("main h2").allTextContents()).toEqual(
    expect.arrayContaining([
      "Recent decisions",
      "Stay connected",
      "Make yourself at home",
    ]),
  );
  expect(requests).toEqual([]);
  await page.goto("/#governance");
  await expect(
    page.getByRole("button", { name: "Open DAO chat" }),
  ).toBeVisible();
  await page.goto(
    `/#proposal/${paymentProposal.contract}/${paymentProposal.id}`,
  );
  await expect(
    page.getByRole("link", { name: "Get governance alerts" }),
  ).toBeVisible();
  await page.goto("/#delegation");
  await expect(
    page.getByRole("button", { name: "Buy / Sell MANA" }),
  ).toBeVisible();
});
test("chat uses the exact channel, loads on demand and unloads on Escape with restored focus", async ({
  page,
}) => {
  await setup(page);
  let requests = 0;
  await page.route("https://emerald.widgetbot.io/**", (r) => {
    requests++;
    return r.fulfill({
      contentType: "text/html",
      body: "<h1>Discord sign-in required</h1><button>Sign in</button>",
    });
  });
  await page.goto("/#overview");
  expect(requests).toBe(0);
  const open = page.getByRole("button", { name: "Open DAO chat" });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Campfire" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("iframe")).toHaveAttribute(
    "src",
    "https://emerald.widgetbot.io/channels/809857155401646151/1195328129435177041",
  );
  await expect(
    dialog.getByRole("link", { name: "Open in Discord" }),
  ).toHaveAttribute("href", configured.integrations.discord.channelUrl);
  await expect(page.frameLocator("iframe").getByRole("heading")).toHaveText(
    "Discord sign-in required",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(open).toBeFocused();
  await page.goBack(); // The initial frame load must not add a navigable history entry.
  expect(requests).toBe(1);
});
test("blocked widget retains direct access and never affects portal operation", async ({
  page,
}) => {
  await setup(page);
  await page.route("https://emerald.widgetbot.io/**", (r) => r.abort());
  await page.goto("/#governance");
  await page.getByRole("button", { name: "Open DAO chat" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("link", { name: "Open in Discord" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close Campfire" }).click();
  await expect(
    page.getByRole("link", { name: "Create proposal", exact: true }).last(),
  ).toBeVisible();
});
test("all four trade paths preserve exact amounts without a wallet or portal transaction", async ({
  page,
}) => {
  await setup(page);
  let operations = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && /preflight|simulate/.test(r.url()))
      operations++;
  });
  await page.goto("/#overview");
  await page.getByRole("button", { name: "Buy / Sell MANA" }).click();
  const dialog = page.getByRole("dialog", { name: "Trade MANA" });
  for (const side of ["Buy", "Sell"])
    for (const asset of ["usdcNative", "weth"]) {
      await dialog
        .getByRole("button", { name: `${side} MANA`, exact: true })
        .click();
      await dialog.getByRole("combobox").selectOption(asset);
      const link = dialog.getByRole("link", { name: "Continue on Uniswap" });
      let url = new URL((await link.getAttribute("href"))!);
      expect(url.searchParams.has("value")).toBe(false);
      await dialog
        .getByRole("textbox")
        .fill(
          side === "Sell" ? "9007199254740993.123456789123456789" : "1.123456",
        );
      url = new URL((await link.getAttribute("href"))!);
      expect(url.searchParams.get("chain")).toBe("polygon");
      expect(url.searchParams.get("inputCurrency")?.toLowerCase()).toBe(
        configured.contracts[
          side === "Sell" ? "mana" : (asset as "weth")
        ]!.address.toLowerCase(),
      );
      expect(url.searchParams.get("outputCurrency")?.toLowerCase()).toBe(
        configured.contracts[
          side === "Buy" ? "mana" : (asset as "weth")
        ]!.address.toLowerCase(),
      );
      expect(url.searchParams.get("value")).toBe(
        await dialog.getByRole("textbox").inputValue(),
      );
    }
  await dialog.getByRole("textbox").fill("1e18");
  await expect(
    dialog.getByRole("button", { name: "Continue on Uniswap" }),
  ).toBeDisabled();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(operations).toBe(0);
});
test("missing or invalid integrations fail closed without hiding MANA trading", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/config", (r) =>
    r.fulfill({
      json: {
        ...configured,
        integrations: { telegram: { channelUrl: "https://evil.example" } },
      },
    }),
  );
  await page.goto("/#overview");
  await expect(
    page.getByText("Telegram · official channel link pending"),
  ).toBeVisible();
  await expect(
    page.getByText("Discord · official channel link pending"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Buy / Sell MANA" }),
  ).toBeEnabled();
  await expect(page.locator("iframe")).toHaveCount(0);
});
test("trade dialog is accessible and fits 320px and 200% reflow in both themes", async ({
  page,
}) => {
  await setup(page);
  for (const colorScheme of ["light", "dark"] as const)
    for (const width of [320, 768]) {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/#overview");
      await page.evaluate(() => {
        document.documentElement.style.zoom = innerWidth === 768 ? "2" : "1";
      });
      await page.getByRole("button", { name: "Buy / Sell MANA" }).click();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      expect(
        (await new AxeBuilder({ page }).include(".community-dialog").analyze())
          .violations,
      ).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Buy / Sell MANA" }),
      ).toBeFocused();
    }
});
test("return from Uniswap revalidates membership once and does not assume a swap succeeded", async ({
  page,
}) => {
  await setup(page);
  await injectWallet(page);
  let reads = 0;
  await page.route("**/api/members/*", (r) => {
    reads++;
    return r.fulfill({
      json: {
        balance: "17009000000000000000000",
        votes: "1000000000000000000000",
        delegate: "0x1111111111111111111111111111111111111111",
        supply: "1",
        allowance: "0",
      },
    });
  });
  await page.goto("/#delegation");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page.getByRole("button", { name: "Injected", exact: true }).click();
  await expect.poll(() => reads).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Buy / Sell MANA" }).click();
  await page.route("https://app.uniswap.org/**", (r) =>
    r.fulfill({ body: "Uniswap external navigation test" }),
  );
  const popup = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Continue on Uniswap" }).click();
  const tab = await popup;
  const before = reads;
  await tab.close();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(page.getByText("Swap completed", { exact: true })).toHaveCount(
    0,
  );
});
