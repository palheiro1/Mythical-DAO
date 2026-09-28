import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test.beforeEach(async ({ page }) => {
  await page.route(/tally\.xyz|snapshot\.org|charmverse\.io/, (route) =>
    route.abort(),
  );
});
test("public routes render without governance platforms or horizontal overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A shared world. A collective future." }),
  ).toBeVisible();
  for (const [route, heading] of [
    ["governance", "Governance"],
    ["treasury", "The treasury"],
    ["delegation", "Your voice. Your choice."],
    ["ragequit", "Leave on your own terms."],
    ["history", "Governance history"],
    ["create", "Create a proposal"],
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
  }
  expect(errors).toEqual([]);
});
test("drafts persist locally; disconnected users cannot publish", async ({
  page,
}) => {
  await page.goto("/#create");
  await page.getByLabel("Proposal title").fill("A community habitat");
  await page
    .getByLabel("Problem", { exact: true })
    .fill("We need a shared home.");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Proposal title")).toHaveValue(
    "A community habitat",
  );
  await expect(
    page.getByRole("button", { name: "Simulate & review publication" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Community ballot", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Alternative 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "+ Add alternative", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Alternative 3", exact: true }),
  ).toBeVisible();
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
