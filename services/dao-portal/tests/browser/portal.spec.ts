import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { controlledPortal } from "./fixtures";
test.beforeEach(async ({ page }) => {
  await controlledPortal(page);
  await page.route(
    /tally\.xyz|snapshot\.org|charmverse\.io|fonts\.googleapis\.com|fonts\.gstatic\.com/,
    (route) => route.abort(),
  );
});
test("public routes render without governance platforms, fonts or horizontal overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [route, heading] of [
    ["overview", "The Seekers’ Camp"],
    ["governance", "Governance"],
    ["treasury", "Treasury"],
    ["delegation", "Delegation"],
    ["ragequit", "Exit DAO"],
    ["history", "Governance history"],
    ["create", "Create a proposal"],
    ["guide", "How governance works"],
  ]) {
    await page.goto("/#" + route);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator("main")).not.toContainText(/undefined|NaN/);
  }
  expect(errors).toEqual([]);
});
test("old drafts and multi-step edits persist without a wallet", async ({
  page,
}) => {
  await page.goto("/#create");
  await page.getByLabel("Proposal title").fill("A community habitat");
  await page
    .getByLabel("Problem", { exact: true })
    .fill("We need a shared home.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Proposal title")).toHaveValue(
    "A community habitat",
  );
  await page
    .getByRole("button", { name: "Community ballot", exact: true })
    .click();
  await page.getByRole("button", { name: "3 Choices" }).click();
  await page
    .getByRole("textbox", { name: "Alternative 1", exact: true })
    .fill("Forest");
  await page
    .getByRole("button", { name: "+ Add alternative", exact: true })
    .click();
  await expect(page.getByLabel("Alternative 3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "1 Decision" }).click();
  await expect(page.getByLabel("Problem", { exact: true })).toHaveValue(
    "We need a shared home.",
  );
  await page.getByRole("button", { name: "4 Review" }).click();
  await expect(
    page.getByRole("button", { name: "Simulate & review publication" }),
  ).toBeDisabled();
  await expect(page.locator("#exact-text")).toContainText(
    "We need a shared home.",
  );
  await page
    .getByRole("button", {
      name: "Complete Decision before publication.",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Decision", { exact: true })).toBeFocused();
});
test("overview meets automated accessibility checks", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});
