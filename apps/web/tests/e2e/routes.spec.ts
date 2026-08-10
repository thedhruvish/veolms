import { test, expect } from "./app.fixture.ts";
import { installBaselineState, openApp } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
});

test("canonical home and direct routes preserve their titles", async ({
  page,
}) => {
  await openApp(page, "/");
  await expect(
    page.getByRole("heading", { name: /Good evening, Ashi/ }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/^Home .* ProCodrr$/);

  await page.goto("/home/");
  await expect(
    page.getByRole("heading", { name: /Good evening, Ashi/ }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/^Home .* ProCodrr$/);

  await page.goto("/settings/learning/");
  await expect(
    page.getByRole("heading", { name: "Settings", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "learning",
  );

  await page.goto("/wishlist");
  await expect(
    page.getByRole("heading", { name: "Wishlist", level: 1 }),
  ).toBeVisible();
});

test("unknown, nested, and case-mismatched URLs retain the Home fallback contract", async ({
  page,
}) => {
  for (const path of [
    "/not-a-route",
    "/COURSES",
    "/courses/typescript-course/lesson-1",
  ]) {
    await test.step(path, async () => {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: /Good evening, Ashi/ }),
      ).toBeVisible();
      await expect(page).toHaveTitle(/^Home .* ProCodrr$/);
      expect(new URL(page.url()).pathname).toBe(path);
    });
  }
});

test("deferred workspace routes use the clean empty state", async ({
  page,
}) => {
  for (const [path, title] of [
    ["/courses/create", "Create Course"],
    ["/courses/typescript-course/overview", "Course Overview"],
    ["/reviews", "Reviews"],
    ["/analytics", "Analytics"],
    ["/orders", "Orders"],
    ["/messages", "Messages"],
    ["/order-history", "Order History"],
    ["/notifications", "Notifications"],
  ] as const) {
    await test.step(path, async () => {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: title, level: 1 }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Nothing here yet", level: 2 }),
      ).toBeVisible();
    });
  }
});

test("every creator Create Course action opens the dedicated empty route", async ({
  page,
}) => {
  await openApp(page, "/");
  const sidebar = page.getByRole("complementary", {
    name: "Student navigation",
  });
  await sidebar
    .getByRole("button", { name: "Open role and appearance menu" })
    .click();
  await page.getByRole("menuitemradio", { name: "Creator" }).click();

  const expectEmptyCreateCourseRoute = async () => {
    await expect(page).toHaveURL(/\/courses\/create$/);
    await expect(
      page.getByRole("heading", { name: "Create Course", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nothing here yet", level: 2 }),
    ).toBeVisible();
  };

  await page
    .getByRole("button", { name: "Create Course", exact: true })
    .click();
  await expectEmptyCreateCourseRoute();

  await page.goBack();
  await page
    .getByRole("button", { name: "Create Course Build a new course" })
    .click();
  await expectEmptyCreateCourseRoute();

  await page.goBack();
  await page
    .getByRole("complementary", { name: "Creator navigation" })
    .getByRole("button", { name: "Courses" })
    .click();
  await page
    .getByRole("button", { name: "Create Course", exact: true })
    .click();
  await expectEmptyCreateCourseRoute();
});

test("framework navigation keeps the academy shell and transient catalogue state mounted", async ({
  page,
}) => {
  await openApp(page, "/courses");
  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });
  const search = page.getByPlaceholder("Search your courses...");

  const historyLength = await page.evaluate(() => window.history.length);
  await navigation.getByRole("button", { name: "Courses" }).click();
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);

  await search.fill("Node.js");
  await expect(search).toHaveValue("Node.js");
  await navigation.getByRole("button", { name: "Courses" }).press("Control+,");
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "appearance",
  );

  await page.goBack();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(page.getByPlaceholder("Search your courses...")).toHaveValue(
    "Node.js",
  );
});

test("navigation, course opening, and browser history keep route state coherent", async ({
  page,
}) => {
  await openApp(page, "/");
  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });

  await navigation.getByRole("button", { name: "Courses" }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(
    page.getByRole("heading", { name: "Courses", level: 1 }),
  ).toBeVisible();

  await page.getByRole("article", { name: /UI\/UX Design Mastery/ }).click();
  await expect(page).toHaveURL(/\/courses\/ui-ux-design-mastery$/);
  await expect(
    page.getByRole("heading", {
      name: "The Beginning of a Design Journey",
      level: 1,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Return to all courses" }).click();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(
    page.getByRole("heading", { name: "Courses", level: 1 }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/courses\/ui-ux-design-mastery$/);
  await expect(
    page.getByRole("complementary", { name: "Course curriculum" }),
  ).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/courses$/);
  await expect(
    navigation.getByRole("button", { name: "Courses" }),
  ).toHaveAttribute("aria-current", "page");
});
