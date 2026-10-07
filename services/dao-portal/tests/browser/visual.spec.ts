import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import {
  controlledPortal,
  paymentProposal,
  ballot,
  payment,
  injectWallet,
} from "./fixtures";
import { newDraft } from "../../src/drafts";
const routes = [
  "overview",
  "governance",
  "treasury",
  "delegation",
  "ragequit",
  "history",
  "create",
  "guide",
];
test.describe("visual acceptance matrix", () => {
  test("active proposal details and completed wizard steps in both themes at all widths", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await controlledPortal(page);
    const draft = newDraft();
    draft.title = "Controlled review fixture";
    draft.actions = [payment];
    for (const field of Object.keys(draft.sections))
      draft.sections[field] =
        "Acceptance criteria, owner and measurable evidence for " + field + ".";
    for (const theme of ["light", "dark"] as const)
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme });
        const check = async (name: string) => {
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          const result = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          expect(
            result.violations.map((v) => ({
              id: v.id,
              nodes: v.nodes.map((n) => n.target),
            })),
            name,
          ).toEqual([]);
          await page.locator("#main-content").focus();
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path:
              "docs/evidence/journal-complete-2026-10-02/controlled-" +
              name +
              "-" +
              theme +
              "-" +
              width +
              ".png",
            fullPage: true,
          });
        };
        for (const [name, path] of [
          [
            "executable",
            "proposal/" + paymentProposal.contract + "/" + paymentProposal.id,
          ],
          ["community", "proposal/" + ballot.contract + "/1"],
          ["treasury", "treasury"],
        ]) {
          await page.goto("/#" + path);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await check(name);
        }
        await page.goto("/#create");
        await page.getByLabel("Import draft").setInputFiles({
          name: "fixture.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(draft)),
        });
        for (const [step, name] of [
          ["1 Decision", "decision"],
          ["2 Plan", "plan"],
          ["3 Actions", "actions"],
          ["4 Review", "review"],
        ]) {
          await page.getByRole("button", { name: step, exact: true }).click();
          await check(name);
        }
        const coherence = page.getByRole("checkbox", {
          name: "I checked that the written budget and configured actions agree, including assets, amounts and recipients.",
        });
        await coherence.check();
        await page.getByRole("button", { name: "2 Plan", exact: true }).click();
        await page.getByLabel("Budget", { exact: true }).fill("Changed budget");
        await page
          .getByRole("button", { name: "4 Review", exact: true })
          .click();
        await expect(coherence).not.toBeChecked();
      }
  });

  test.skip(
    ({ isMobile }) => Boolean(isMobile),
    "Matrix selects explicit viewports in the desktop runner.",
  );
  for (const theme of ["light", "dark"] as const)
    for (const width of [390, 768, 1440]) {
      test(
        theme + " at " + width + " px: routes, contrast and local assets",
        async ({ page }) => {
          test.setTimeout(120000);
          await page.setViewportSize({ width, height: 1000 });
          await page.emulateMedia({ colorScheme: theme });
          await controlledPortal(page);
          const remote: string[] = [];
          page.on("request", (r) => {
            if (/fonts\.google|fonts\.gstatic/.test(r.url()))
              remote.push(r.url());
          });
          for (const route of routes) {
            await page.goto("/#" + route);
            await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
            await expect(page.locator("html")).toHaveAttribute(
              "data-theme",
              theme,
            );
            expect(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            ).toBe(true);
            const art = page.locator(".chapter-figure:visible");
            if (await art.count()) {
              const a = await art.boundingBox(),
                title = await page.locator("h1").boundingBox();
              expect(
                !!a &&
                  !!title &&
                  a.x < title.x + title.width &&
                  a.x + a.width > title.x &&
                  a.y < title.y + title.height &&
                  a.y + a.height > title.y,
                route + " artwork must not overlap the title",
              ).toBe(false);
            }
            await expect(page.locator("main")).not.toContainText(
              /undefined|NaN/,
            );
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
              route,
            ).toEqual([]);
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
            mkdirSync("docs/evidence/journal-complete-2026-10-02", {
              recursive: true,
            });
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({
              path:
                "docs/evidence/journal-complete-2026-10-02/" +
                route +
                "-" +
                theme +
                "-" +
                width +
                ".png",
              fullPage: true,
            });
          }
          expect(remote).toEqual([]);
        },
      );
    }
  test("connected exit preview and unverified deployment warning stay accessible in both themes", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await controlledPortal(page);
    await injectWallet(page);
    await page.goto("/#ragequit");
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page.getByRole("button", { name: "Injected", exact: true }).click();
    for (const theme of ["light", "dark"] as const)
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ colorScheme: theme });
        await page.getByLabel("MANA to burn", { exact: true }).fill("1");
        await page.getByRole("button", { name: "Preview my exit" }).click();
        await page
          .getByRole("checkbox", {
            name: "I understand that my MANA will be permanently burned.",
          })
          .check();
        const check = async (name: string) => {
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
          await page.locator("#main-content").focus();
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path:
              "docs/evidence/journal-complete-2026-10-02/controlled-" +
              name +
              "-" +
              theme +
              "-" +
              width +
              ".png",
            fullPage: true,
          });
        };
        await check("exit-preview");
        await page
          .getByRole("button", { name: "Review permanent exit", exact: true })
          .click();
        await expect(page.getByRole("dialog")).not.toBeVisible();
        await expect(page.getByRole("alert")).toContainText(
          "configuration differs from the deployment reviewed",
        );
        await check("exit-blocked");
        await page
          .getByRole("button", { name: "Dismiss", exact: true })
          .click();
      }
  });
  test("320 px and 200% zoom reflow without clipping", async ({ page }) => {
    await controlledPortal(page);
    await injectWallet(page);
    for (const width of [320, 720]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.evaluate((width) => {
        document.documentElement.style.zoom = width === 720 ? "2" : "1";
      }, width);
      if (width === 320) {
        await page
          .getByRole("button", { name: "Connect wallet", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Injected", exact: true })
          .click();
      }
      for (const route of [
        ...routes,
        "proposal/" + paymentProposal.contract + "/" + paymentProposal.id,
      ]) {
        await page.goto("/#" + route);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          route + " at " + width,
        ).toBe(true);
      }
    }
  });
  test("system theme follows device changes, manual choice persists before app load", async ({
    page,
  }) => {
    await controlledPortal(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByLabel("Theme", { exact: true }).selectOption("dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.route("**/assets/*.js", (route) => route.abort());
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
  test("mobile navigation supports keyboard, escape and direct proposal routes", async ({
    page,
  }) => {
    await controlledPortal(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open navigation" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Navigation" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "Treasury · DAO funds", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Treasury", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
});
