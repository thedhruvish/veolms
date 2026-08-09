import { test, expect } from "./app.fixture.ts";
import { expectStoredValue, installBaselineState, openApp } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
});

test("role, appearance, and academy palette persist across routes and reloads", async ({
  page,
}) => {
  await openApp(page, "/");
  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });

  await sidebar.getByRole("button", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance",
    "light",
  );
  await expectStoredValue(page, "veolms-theme", "light");

  await sidebar.getByRole("button", { name: "Choose color theme" }).click();
  await page.getByRole("menuitemradio", { name: /Ocean Blue/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ocean");
  await expectStoredValue(page, "veolms-academy-theme", "ocean");

  await sidebar
    .getByRole("button", { name: "Open role and appearance menu" })
    .click();
  await page.getByRole("menuitemradio", { name: "Creator" }).click();
  await expect(
    page.getByRole("complementary", { name: "Creator navigation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Good afternoon, Anurag/ }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-role", "creator");

  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "Creator navigation" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ocean");

  await page
    .getByRole("complementary", { name: "Creator navigation" })
    .getByRole("button", { name: "Courses" })
    .click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ocean");
});

test("sidebar collapse and hide shortcuts persist without losing navigation", async ({
  page,
}) => {
  await openApp(page, "/courses");

  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(
    page.getByRole("button", { name: "Expand navigation" }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-sidebar-mode", "collapsed");

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand navigation" }),
  ).toBeVisible();

  await page.keyboard.press("Control+b");
  await expect(
    page.getByRole("button", { name: "Collapse navigation" }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-sidebar-mode", "expanded");

  await page.keyboard.press("Control+Alt+b");
  await expectStoredValue(page, "veolms-sidebar-mode", "hidden");
  await expect(page.locator(".courses-sidebar")).toHaveAttribute("inert", "");

  await page.keyboard.press("Control+Alt+b");
  await expectStoredValue(page, "veolms-sidebar-mode", "expanded");
  await expect(
    page.getByRole("complementary", { name: "Student navigation" }),
  ).toBeVisible();
});

test("mobile More dialog traps the workflow and restores focus on Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/courses");

  const mobileNavigation = page.getByRole("navigation", {
    name: "Student mobile navigation",
  });
  await expect(mobileNavigation).toBeVisible();
  const more = mobileNavigation.getByRole("button", {
    name: "More navigation options",
  });
  await more.click();

  const dialog = page.getByRole("dialog", { name: /More/ });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("hidden");
  await expect(dialog).toBeFocused();

  const focusable = dialog.locator(
    "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
  );
  await page.keyboard.press("Shift+Tab");
  await expect(focusable.last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(focusable.first()).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(more).toBeFocused();
});
