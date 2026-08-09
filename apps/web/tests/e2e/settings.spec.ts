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

test("appearance and sidebar preferences persist through their direct settings routes", async ({
  page,
}) => {
  await openApp(page, "/settings/appearance");

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

  const autoplay = page.getByRole("switch", { name: "Autoplay next lecture" });
  const startingState = await autoplay.getAttribute("aria-checked");
  await autoplay.click();

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
  expect(stored.autoplayNextLecture).toBe(startingState !== "true");
  expect(stored.learningReminders).toBe(true);
  expect(stored.reminderDays).toContain("sat");

  await page.reload();
  await expect(autoplay).toHaveAttribute(
    "aria-checked",
    String(startingState !== "true"),
  );
  await expect(
    page.getByRole("button", { name: "Sat", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
