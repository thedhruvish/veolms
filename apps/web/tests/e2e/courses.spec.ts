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
  const titleSortOption = page.getByRole("option", {
    name: "Sort by: Title",
  });
  await titleSortOption.hover();
  const optionInsets = await titleSortOption.evaluate((option) => {
    const content = option.closest(".themed-select__content");
    if (!(content instanceof HTMLElement)) return null;
    const contentRect = content.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    return {
      inlineStart: optionRect.left - contentRect.left,
      inlineEnd: contentRect.right - optionRect.right,
    };
  });
  expect(optionInsets).not.toBeNull();
  expect(optionInsets?.inlineStart).toBeCloseTo(1, 0);
  expect(optionInsets?.inlineEnd).toBeCloseTo(1, 0);
  await titleSortOption.click();
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

test("unenrolled courses open their course overview from Explore Course", async ({
  page,
}) => {
  const figmaCourse = page.getByRole("article", {
    name: /Figma UI Essentials/,
  });

  await figmaCourse.getByRole("button", { name: "Explore Course" }).click();

  await expect(page).toHaveURL(/\/courses\/figma-ui-essentials\/overview$/);
  await expect(
    page.getByRole("heading", { name: "Course Overview", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nothing here yet", level: 2 }),
  ).toBeVisible();
});
