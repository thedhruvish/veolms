import { test, expect } from "./app.fixture.ts";
import { expectStoredValue, installBaselineState, openApp } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
});

test("lesson choice, curriculum width, and player preferences persist", async ({
  page,
}) => {
  await openApp(page, "/courses/typescript-course");
  await expect(
    page.getByRole("heading", {
      name: "The Beginning of a Design Journey",
      level: 1,
    }),
  ).toBeVisible();

  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  await curriculum.getByRole("button", { name: /Usability Testing/ }).click();
  await expect(
    page.getByRole("heading", { name: "Usability Testing", level: 1 }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-last-lesson", "10");

  const resize = page.getByRole("separator", {
    name: "Resize course curriculum",
  });
  await resize.press("End");
  await expect(resize).toHaveAttribute("aria-valuenow", "560");
  await expectStoredValue(page, "veolms-curriculum-width", "560");
  await resize.press("Home");
  await expect(resize).toHaveAttribute(
    "aria-valuetext",
    "Course curriculum collapsed",
  );
  await resize.press("ArrowLeft");
  await expect(resize).toHaveAttribute("aria-valuenow", "400");

  const player = page.getByRole("region", {
    name: /Lesson video player for Usability Testing/,
  });
  await player.getByRole("button", { name: "Toggle captions" }).click();
  await expect(
    player.getByRole("button", { name: "Toggle captions" }),
  ).toHaveAttribute("aria-pressed", "true");

  await player.getByRole("button", { name: "Player settings" }).click();
  await page.getByRole("menuitem", { name: /Playback speed/ }).click();
  await page.getByRole("menuitemradio", { name: "1.5x" }).click();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((video) => (video as HTMLVideoElement).playbackRate),
    )
    .toBe(1.5);

  const autoplay = player.getByRole("switch", { name: "Autoplay off" });
  await autoplay.click();
  await expectStoredValue(page, "veolms-player-autoplay", "on");

  await player.getByRole("button", { name: "Enter theater mode" }).click();
  await expect(
    player.getByRole("button", { name: "Exit theater mode" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Usability Testing", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Autoplay on" }),
  ).toHaveAttribute("aria-checked", "true");
});

test("mobile lesson drawer closes with Escape and returns focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/courses/typescript-course");

  const trigger = page.getByRole("button", { name: "Open course lessons" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Course lessons" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe("hidden");

  const focusable = dialog.locator(
    "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
  );
  await focusable.first().focus();
  await page.keyboard.press("Shift+Tab");
  await expect(focusable.last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(focusable.first()).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog
    .locator(".lesson-drawer-backdrop")
    .click({ position: { x: 2, y: 2 } });
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog.getByRole("button", { name: /Usability Testing/ }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Usability Testing", level: 1 }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-last-lesson", "10");
});

test("curriculum search, section expansion, and lesson selection retain their current contracts", async ({
  page,
}) => {
  await openApp(page, "/courses/typescript-course");

  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  const firstSection = curriculum.getByRole("button", {
    name: /Section 1: Introduction/,
  });
  await expect(firstSection).toHaveAttribute("aria-expanded", "true");
  await firstSection.click();
  await expect(firstSection).toHaveAttribute("aria-expanded", "false");
  await firstSection.click();
  await expect(firstSection).toHaveAttribute("aria-expanded", "true");

  await curriculum.getByRole("button", { name: "Search lessons" }).click();
  const lessonSearch = curriculum.getByRole("searchbox", {
    name: "Search lessons",
  });
  await expect(lessonSearch).toBeFocused();
  await lessonSearch.fill("usability");
  await expect(
    curriculum.getByRole("button", { name: /Section 2: User Research/ }),
  ).toBeVisible();
  await expect(
    curriculum.getByRole("button", { name: /Usability Testing/ }),
  ).toBeVisible();

  await lessonSearch.fill("no matching lesson");
  await expect(
    curriculum.getByRole("button", { name: /Section \d:/ }),
  ).toHaveCount(0);

  await lessonSearch.fill("usability");
  await curriculum.getByRole("button", { name: /Usability Testing/ }).click();
  await expect(
    page.getByRole("heading", { name: "Usability Testing", level: 1 }),
  ).toBeVisible();
  await expectStoredValue(page, "veolms-last-lesson", "10");
});

test("lesson tools and discussion interactions retain their current contracts", async ({
  page,
}) => {
  await openApp(page, "/courses/typescript-course");

  const discussion = page.locator("section.learning-discussion");
  const lessonTools = discussion.getByRole("tablist", { name: "Lesson tools" });
  const questionsTab = lessonTools.getByRole("tab", { name: "Q&A" });
  await questionsTab.click();
  await expect(questionsTab).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Questions & answers", level: 3 }),
  ).toBeVisible();

  const commentsTab = lessonTools.getByRole("tab", { name: "Comments" });
  await commentsTab.click();
  await expect(commentsTab).toHaveAttribute("aria-selected", "true");

  const commentSearch = discussion.getByRole("searchbox", {
    name: "Search comments",
  });
  await commentSearch.focus();
  await expect(commentSearch).toBeFocused();
  await commentSearch.fill("easing curve");
  await expect(discussion.getByRole("article")).toHaveCount(1);
  await expect(
    discussion
      .getByRole("article")
      .getByRole("heading", { name: "Ethan Park", level: 3 }),
  ).toBeVisible();

  await commentSearch.fill("no matching comment");
  await expect(page.getByText("No comments match that search")).toBeVisible();
  await expect(discussion.getByRole("article")).toHaveCount(0);
  await commentSearch.fill("");

  const composer = page.getByRole("textbox", { name: "Add a comment" });
  await composer.fill("   ");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Write a comment before sending.",
  );

  await composer.fill(
    "This discussion characterization should survive extraction.",
  );
  await composer.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Comment posted.");
  const postedComment = discussion.getByRole("article").filter({
    hasText: "This discussion characterization should survive extraction.",
  });
  await expect(
    postedComment.getByRole("heading", { name: "Sofia Chen", level: 3 }),
  ).toBeVisible();

  const ethanComment = discussion
    .getByRole("article")
    .filter({ hasText: "Ethan Park" });
  const like = ethanComment.getByRole("button", { name: "Like" });
  await expect(like).toHaveAttribute("aria-pressed", "false");
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await like.click();
  await expect(like).toHaveAttribute("aria-pressed", "false");
});

test("core player controls, shortcuts, seek state, and ambient preference remain functional", async ({
  page,
}) => {
  await openApp(page, "/courses/typescript-course");
  const player = page.getByRole("region", {
    name: /Lesson video player for The Beginning of a Design Journey/,
  });
  const video = player.locator("video");

  await player.getByRole("button", { name: "Play", exact: true }).click();
  await expect(
    player.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await player.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    player.getByRole("button", { name: "Play", exact: true }),
  ).toBeVisible();

  await player.getByRole("button", { name: "Mute", exact: true }).click();
  await expect(
    player.getByRole("button", { name: "Unmute", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("m");
  await expect(
    player.getByRole("button", { name: "Mute", exact: true }),
  ).toBeVisible();

  await video.evaluate((element) => {
    (element as HTMLVideoElement).currentTime = 10;
    element.dispatchEvent(new Event("timeupdate"));
  });
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThanOrEqual(15);
  await expectStoredValue(
    page,
    "veolms-watch-01 introduction to veolms.mp4",
    "15",
  );

  await player.getByRole("button", { name: "Player settings" }).click();
  const ambient = page.getByRole("menuitemcheckbox", { name: "Ambient mode" });
  await ambient.click();
  await expectStoredValue(page, "veolms-player-ambient", "on");
});
