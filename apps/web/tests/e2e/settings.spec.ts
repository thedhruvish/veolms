import { test, expect } from "./app.fixture.ts";
import { expectStoredValue, installBaselineState, openApp } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
});

test("profile settings validate, save, and retain academy-local identity", async ({
  page,
}) => {
  await openApp(page, "/settings/profile");

  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "profile",
  );
  await expect(page.getByRole("tab", { name: "Profile" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  const displayName = page.getByLabel("Display name", { exact: true });
  const email = page.getByLabel("Email address", { exact: true });
  const photoFile = page.getByLabel("Profile photo file");
  const save = page.getByRole("button", { name: "Save changes" });

  await expect(displayName).toHaveValue("Ashi Singh");
  await expect(email).toHaveAttribute("readonly", "");
  await expect(photoFile).toHaveAttribute("tabindex", "-1");
  await expect(save).toBeDisabled();

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator(".settings-profile__avatar--large")).toContainText(
    "AS",
  );
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(
    page.locator(".settings-profile__avatar--large img"),
  ).toBeVisible();
  await expect(save).toBeDisabled();

  await displayName.fill("");
  await save.click();
  await expect(
    page.getByText("Enter the name you want to use in this academy."),
  ).toBeVisible();
  await expect(displayName).toHaveAttribute("aria-invalid", "true");

  await displayName.fill("Avery Patel");
  await expect(displayName).toHaveValue("Avery Patel");
  await save.click();
  await expect(page.getByRole("status")).toContainText("Changes saved");
  await expect(save).toBeDisabled();
  await expect(
    page.locator(
      ".courses-profile__button > span:not(.shell-profile-avatar) strong",
    ),
  ).toHaveText("Avery Patel");

  await page.getByRole("button", { name: "Remove" }).click();
  await save.click();
  await expect(
    page.locator(".courses-profile__button > .shell-profile-avatar"),
  ).toHaveText("AP");

  await expect
    .poll(() =>
      page.evaluate(() => {
        const value = localStorage.getItem("veolms-profile-student");
        return value ? JSON.parse(value).displayName : null;
      }),
    )
    .toBe("Avery Patel");

  await page.reload();
  await expect(displayName).toHaveValue("Avery Patel");
  await expect(
    page.locator(
      ".courses-profile__button > span:not(.shell-profile-avatar) strong",
    ),
  ).toHaveText("Avery Patel");
  await expect(
    page.locator(".courses-profile__button > .shell-profile-avatar"),
  ).toHaveText("AP");

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileNavigation = page.getByRole("navigation", {
    name: "Student mobile navigation",
  });
  await mobileNavigation
    .getByRole("button", { name: "More navigation options" })
    .click();
  const mobileProfile = page
    .getByRole("dialog", { name: /More/ })
    .locator(".mobile-menu-sheet__profile");
  await expect(mobileProfile).toContainText("Avery Patel");
  await expect(mobileProfile.locator(".shell-profile-avatar")).toHaveText("AP");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Manage sign-in & security" }).click();
  await expect(page).toHaveURL(/\/settings\/security$/);
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "security",
  );
});

test("profile settings preserve an unsaved draft while offline", async ({
  page,
}) => {
  await openApp(page, "/settings/profile");

  const displayName = page.getByLabel("Display name", { exact: true });
  const save = page.getByRole("button", { name: "Save changes" });
  await displayName.fill("Offline draft");

  await page.context().setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByRole("status")).toContainText("offline");
  await expect(save).toBeDisabled();
  await expect(displayName).toHaveValue("Offline draft");

  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(save).toBeEnabled();
  await expect(displayName).toHaveValue("Offline draft");
});

test("profile field and public-visibility labels share one text baseline", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1064, height: 753 });
  await openApp(page, "/settings/profile");

  const baselineDeltas = await page
    .locator(".settings-profile__field-heading")
    .evaluateAll((headings) => {
      const textBottom = (element: Element) => {
        const textNode = [...element.childNodes].find(
          (node) =>
            node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        if (!textNode) throw new Error("Expected a visible label text node");
        const range = document.createRange();
        range.selectNodeContents(textNode);
        return range.getBoundingClientRect().bottom;
      };

      return headings.map((heading) => {
        const fieldLabel = heading.querySelector(
          ":scope > label:not(.settings-profile__visibility-checkbox)",
        );
        const visibilityLabel = heading.querySelector(
          ".settings-profile__visibility-checkbox > span:first-child",
        );
        if (!fieldLabel || !visibilityLabel)
          throw new Error("Expected both profile field labels");
        return {
          field: fieldLabel.textContent?.trim(),
          delta: textBottom(visibilityLabel) - textBottom(fieldLabel),
        };
      });
    });

  expect(baselineDeltas.map(({ field }) => field)).toEqual([
    "Email address",
    "Mobile number",
    "LinkedIn URL",
    "GitHub URL",
    "Portfolio",
  ]);
  for (const { delta } of baselineDeltas) {
    expect(Math.abs(delta)).toBeLessThan(0.1);
  }
});

test("appearance and sidebar preferences persist through their direct settings routes", async ({
  page,
}) => {
  await openApp(page, "/settings/appearance");

  const colorThemeSection = page
    .locator(".settings-section")
    .filter({ has: page.getByRole("heading", { name: "Color theme" }) });
  const colorThemeOptions = colorThemeSection.getByRole("radio");
  await expect(colorThemeOptions.nth(0)).toContainText("Veo Onyx");
  await expect(colorThemeOptions.nth(1)).toContainText("Ocean Blue");
  await expect(colorThemeOptions.nth(2)).toContainText("Midnight Azure");
  await expect(page.locator("html")).toHaveAttribute(
    "data-sidebar-icon-style",
    "monochrome",
  );

  const randomTheme = page.getByRole("switch", {
    name: "Random theme on app open",
  });
  await randomTheme.click();
  await expect(randomTheme).toHaveAttribute("aria-checked", "true");
  const graphitePoolOption = page.getByRole("checkbox", {
    name: /Graphite Studio/,
  });
  await graphitePoolOption.click();
  await expect(graphitePoolOption).toHaveAttribute("aria-checked", "false");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const pool = localStorage.getItem("veolms-random-academy-theme-pool");
        return pool ? JSON.parse(pool) : null;
      }),
    )
    .not.toContain("graphite");

  await page.setViewportSize({ width: 350, height: 780 });
  await expect
    .poll(() =>
      page.evaluate(() => ({
        viewport: window.innerWidth,
        content: document.documentElement.scrollWidth,
      })),
    )
    .toEqual({ viewport: 350, content: 350 });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await randomTheme.click();
  await expect(randomTheme).toHaveAttribute("aria-checked", "false");

  await page.getByRole("radio", { name: /Light/ }).click();
  await page.getByRole("radio", { name: /Ocean Blue/ }).click();
  await page.getByRole("switch", { name: "Reduce animations" }).click();
  await page.getByRole("radio", { name: "Extra large" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ocean");
  await expect(page.locator("html")).toHaveAttribute(
    "data-reduce-animations",
    "false",
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-text-size",
    "extra-large",
  );
  await expectStoredValue(page, "veolms-theme", "light");
  await expectStoredValue(page, "veolms-academy-theme", "ocean");

  await page.getByRole("tab", { name: "Sidebar" }).click();
  await expect(page).toHaveURL(/\/settings\/sidebar$/);
  const iconStyleSection = page
    .locator(".settings-section")
    .filter({ has: page.getByRole("heading", { name: "Icon style" }) });
  await expect(iconStyleSection.getByText("Recommended")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Monochrome/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(
    page.getByRole("radio", { name: "Follow color theme" }),
  ).toHaveAttribute("aria-checked", "true");
  const showThemeIcon = page.getByRole("switch", {
    name: "Show theme icon",
  });
  const sidebarThemePicker = page
    .getByRole("complementary", { name: "Student navigation" })
    .getByRole("button", { name: "Choose color theme" });
  await expect(showThemeIcon).toHaveAttribute("aria-checked", "true");
  await expect(sidebarThemePicker).toBeVisible();
  await showThemeIcon.click();
  await expect(showThemeIcon).toHaveAttribute("aria-checked", "false");
  await expect(sidebarThemePicker).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const storedPreferences = localStorage.getItem(
          "veolms-sidebar-preferences",
        );
        return storedPreferences
          ? JSON.parse(storedPreferences).showThemeIcon
          : null;
      }),
    )
    .toBe(false);
  const widthInput = page.getByRole("spinbutton", {
    name: "Sidebar max width in pixels",
  });
  await widthInput.fill("420");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const storedPreferences = localStorage.getItem(
          "veolms-sidebar-preferences",
        );
        return storedPreferences
          ? JSON.parse(storedPreferences).sidebarMaxWidth
          : null;
      }),
    )
    .toBe(420);

  await page.reload();
  await expect(widthInput).toHaveValue("420");
  await expect(showThemeIcon).toHaveAttribute("aria-checked", "false");
  await expect(sidebarThemePicker).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ocean");
});

test("learning settings save a coherent preference object", async ({
  page,
}) => {
  await openApp(page, "/settings/learning");
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "learning",
  );

  await expect(
    page.getByRole("switch", { name: "Autoplay next lecture" }),
  ).toHaveCount(0);

  const reminders = page.getByRole("switch", { name: "Learning reminders" });
  if ((await reminders.getAttribute("aria-checked")) !== "true")
    await reminders.click();
  await page.getByRole("button", { name: "Sat", exact: true }).click();

  const stored = await page.evaluate(() => {
    const storedPreferences = localStorage.getItem(
      "veolms-learning-preferences",
    );
    return storedPreferences ? JSON.parse(storedPreferences) : null;
  });
  expect(stored).not.toBeNull();
  if (!stored) throw new Error("Expected learning preferences to be stored");
  expect(stored).not.toHaveProperty("autoplayNextLecture");
  expect(stored.learningReminders).toBe(true);
  expect(stored.reminderDays).toContain("sat");

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sat", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
