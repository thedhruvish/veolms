import { test, expect } from "./app.fixture.ts";
import { expectStoredValue, installBaselineState, openApp } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
  await openApp(page, "/courses");
});

test("course enrollment, search, category, and sort controls derive the visible catalogue", async ({
  page,
}) => {
  const grid = page.getByRole("region", { name: "Courses" });
  await expect(grid.getByRole("article")).toHaveCount(6);

  await page.getByRole("tab", { name: "Enrolled", exact: true }).click();
  await expect(grid.getByRole("article")).toHaveCount(4);
  await page.getByRole("tab", { name: "Not Enrolled" }).click();
  await expect(grid.getByRole("article")).toHaveCount(2);
  await page.getByRole("tab", { name: "All" }).click();

  await page.getByPlaceholder("Search your courses...").fill("mongo");
  await expect(grid.getByRole("article")).toHaveCount(1);
  await expect(
    grid.getByRole("article", { name: /MongoDB & Database Design/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();

  await page.getByRole("combobox", { name: "Filter by category" }).click();
  await page.getByRole("option", { name: "Development", exact: true }).click();
  await expect(grid.getByRole("article")).toHaveCount(2);
  await expect(
    grid.getByRole("article", { name: /Complete Backend with Node.js/ }),
  ).toBeVisible();
  await expect(
    grid.getByRole("article", { name: /The Ultimate TypeScript Course/ }),
  ).toBeVisible();

  await page.getByRole("combobox", { name: "Filter by category" }).click();
  await page.getByRole("option", { name: "All Categories" }).click();
  await page.getByRole("combobox", { name: "Sort courses" }).click();
  await page.getByRole("option", { name: "Sort by: Title" }).click();
  await expect(grid.getByRole("heading", { level: 2 })).toHaveText([
    "AWS Cloud Practitioner Essentials",
    "Complete Backend with Node.js",
    "Figma UI Essentials",
    "MongoDB & Database Design",
    "The Ultimate TypeScript Course",
    "UI/UX Design Mastery",
  ]);
});

test("wishlist state is shared across catalogue routes and survives reload", async ({
  page,
}) => {
  await page
    .getByRole("button", {
      name: "Add The Ultimate TypeScript Course to wishlist",
    })
    .click();
  await expectStoredValue(page, "veolms-wishlist", '["typescript-course"]');

  const navigation = page.getByRole("complementary", {
    name: "Student navigation",
  });
  await expect(
    navigation.getByRole("button", { name: "Wishlist (1)" }),
  ).toBeVisible();
  await navigation.getByRole("button", { name: "Wishlist (1)" }).click();
  await expect(page).toHaveURL(/\/wishlist$/);

  const wishlist = page.getByRole("region", { name: "Wishlist" });
  await expect(wishlist.getByRole("article")).toHaveCount(1);
  await expect(
    wishlist.getByRole("article", { name: /The Ultimate TypeScript Course/ }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Remove The Ultimate TypeScript Course from wishlist",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", {
      name: "Remove The Ultimate TypeScript Course from wishlist",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your wishlist is empty" }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-wishlist", "[]");
});
