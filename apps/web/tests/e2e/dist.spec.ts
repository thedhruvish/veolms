import { test, expect } from "./app.fixture.ts";
import { installBaselineState, openApp } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
});

test("compiled client serves direct routes and bundled course artwork", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  // A clean URL must return its own prerendered document. Serving the SPA
  // fallback here briefly paints Home and forces React to replace the whole
  // shell after hydration, which causes the wrong-page flash and large CLS.
  const settingsDocument = await page.request.get("/settings/appearance");
  expect(settingsDocument.ok()).toBe(true);
  const settingsHtml = await settingsDocument.text();
  expect(settingsHtml).toContain("<title>Settings · ProCodrr</title>");
  expect(settingsHtml).toContain("Display mode");

  const catalogueDocument = await page.request.get("/explore-courses");
  expect(catalogueDocument.ok()).toBe(true);
  const catalogueHtml = await catalogueDocument.text();
  expect(catalogueHtml).toContain(
    "<title>Explore Courses · ProCodrr</title>",
  );
  expect(catalogueHtml).toContain("UI/UX Design Mastery");

  await openApp(page, "/");
  await expect(
    page.getByRole("heading", { name: /Good evening, Ashi/ }),
  ).toBeVisible();

  await page.goto("/explore-courses");
  await expect(
    page.getByRole("heading", { name: "Explore Courses", level: 1 }),
  ).toBeVisible();
  const courseImages = page
    .getByRole("region", { name: "Explore Courses" })
    .locator("img");
  await expect(courseImages).toHaveCount(7);
  await expect
    .poll(() =>
      courseImages.evaluateAll((images) =>
        images.every((image) => {
          const courseImage = image as HTMLImageElement;
          return courseImage.complete && courseImage.naturalWidth > 0;
        }),
      ),
    )
    .toBe(true);

  await page.goto("/settings/appearance");
  await expect(page.getByRole("tabpanel")).toHaveAttribute(
    "data-settings-tab",
    "appearance",
  );
  await expect(page).toHaveTitle(/^Settings .* ProCodrr$/);

  await page.goto("/COURSES");
  await expect(
    page.getByRole("heading", { name: /Good evening, Ashi/ }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/^Home .* ProCodrr$/);
  expect(new URL(page.url()).pathname).toBe("/COURSES");
  expect(browserErrors).toEqual([]);
});

test("compiled learning route keeps the deployment-provided course-media URL contract", async ({
  page,
}) => {
  await openApp(page, "/learn/typescript-course");
  await expect(
    page.getByRole("heading", {
      name: "The Beginning of a Design Journey",
      level: 1,
    }),
  ).toBeVisible();
  const player = page.getByRole("region", { name: /Lesson video player/ });
  await expect(player).toBeVisible();
  const video = player.locator("video");
  const mediaSource = await video.getAttribute("src");
  expect(mediaSource).not.toBeNull();
  const mediaUrl = new URL(mediaSource!, page.url());
  expect(mediaUrl.pathname).toMatch(/\/course-videos\/.+\.mp4$/);
  expect(mediaUrl.pathname).toContain("%20");
});
