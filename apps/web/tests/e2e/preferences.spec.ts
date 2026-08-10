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
  const paletteMenu = page.getByRole("menu", { name: "Choose a color theme" });
  await page.getByRole("menuitemradio", { name: /Ocean Blue/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ocean");
  await expectStoredValue(page, "veolms-academy-theme", "ocean");
  await expect(paletteMenu).toBeVisible();

  await sidebar
    .getByRole("button", { name: "Open role and appearance menu" })
    .click();
  await expect(paletteMenu).toBeHidden();
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

test("theme picker keeps pointer choices open and makes keyboard previews reversible", async ({
  page,
}) => {
  await openApp(page, "/");
  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const trigger = sidebar.getByRole("button", { name: "Choose color theme" });

  await trigger.click();
  const menu = page.getByRole("menu", { name: "Choose a color theme" });
  const graphite = menu.getByRole("menuitemradio", {
    name: /Graphite Studio/,
  });
  const ocean = menu.getByRole("menuitemradio", { name: /Ocean Blue/ });

  await expect(graphite).toBeFocused();
  await ocean.hover();
  await expect(page.locator("html")).toHaveAttribute(
    "data-palette",
    "graphite",
  );
  await expectStoredValue(page, "veolms-academy-theme", "graphite");

  await page.keyboard.press("ArrowDown");
  const copper = menu.getByRole("menuitemradio", { name: /Copper Slate/ });
  await expect(copper).toBeFocused();
  await expect(copper).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "violet");
  await expectStoredValue(page, "veolms-academy-theme", "graphite");

  await page.getByRole("main").click({ position: { x: 20, y: 20 } });
  await expect(menu).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute(
    "data-palette",
    "graphite",
  );

  await trigger.click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "violet");
  await expectStoredValue(page, "veolms-academy-theme", "violet");

  await trigger.click();
  await ocean.click();
  await expect(menu).toBeVisible();
  await expect(ocean).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ocean");
  await expectStoredValue(page, "veolms-academy-theme", "ocean");
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
