import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./app.fixture.ts";
import { installBaselineState, openApp } from "./support.ts";

test.beforeEach(async ({ page }) => {
  await installBaselineState(page);
  await page.setViewportSize({ width: 1133, height: 753 });
});

const startTouchSwipe = async (
  page: Page,
  surface: Locator,
  deltaX: number,
) => {
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  return startTouchSwipeAt(
    page,
    {
      x: box!.x + box!.width * 0.58,
      y: box!.y + Math.min(72, box!.height * 0.28),
    },
    deltaX,
  );
};

const startTouchSwipeAt = async (
  page: Page,
  point: { x: number; y: number },
  deltaX: number,
) => {
  const cdp = await page.context().newCDPSession(page);
  const timestamp = Date.now() / 1000;

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
    timestamp,
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: point.x + deltaX, y: point.y }],
    timestamp: timestamp + 0.12,
  });

  return async () => {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
      timestamp: timestamp + 0.24,
    });
  };
};

const dispatchPointerSwipeAt = async (
  page: Page,
  point: { x: number; y: number },
  deltaX: number,
) => {
  await page.evaluate(
    ({ start, distance }) => {
      const target = document.elementFromPoint(start.x, start.y);
      if (!target) throw new Error("No swipe target found at the test point.");
      const pointerId = 41;
      const dispatch = (
        eventTarget: EventTarget,
        type: "pointerdown" | "pointermove" | "pointerup",
        clientX: number,
        buttons: number,
      ) =>
        eventTarget.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY: start.y,
            isPrimary: true,
            pointerId,
            pointerType: "touch",
            buttons,
          }),
        );

      dispatch(target, "pointerdown", start.x, 1);
      dispatch(window, "pointermove", start.x + distance, 1);
      dispatch(window, "pointerup", start.x + distance, 0);
    },
    { start: point, distance: deltaX },
  );
};

const getLocatorCenter = async (target: Locator) => {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  return {
    x: box!.x + box!.width / 2,
    y: box!.y + box!.height / 2,
  };
};

const getCurrentPanelContentTop = (panel: Locator) =>
  panel.evaluate((element) => {
    const current = element.querySelector<HTMLElement>(
      ".swipeable-tab-panel__layer.is-current",
    );
    return current?.firstElementChild?.getBoundingClientRect().top ?? null;
  });

const expectAlignedAdjacentPanels = async (panel: Locator) => {
  const geometry = await panel.evaluate((element) => {
    const current = element.querySelector<HTMLElement>(
      ".swipeable-tab-panel__layer.is-current",
    );
    const next = element.querySelector<HTMLElement>(
      ".swipeable-tab-panel__layer.is-next",
    );
    const currentContent = current?.firstElementChild?.getBoundingClientRect();
    const nextContent = next?.firstElementChild?.getBoundingClientRect();
    if (!current || !next || !currentContent || !nextContent) return null;
    return {
      contentTopDifference: Math.abs(currentContent.top - nextContent.top),
      contentGap: nextContent.left - currentContent.right,
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry!.contentTopDifference).toBeLessThanOrEqual(1);
  expect(geometry!.contentGap).toBeCloseTo(12, 0);
};

const touchTapAt = async (page: Page, point: { x: number; y: number }) => {
  const cdp = await page.context().newCDPSession(page);
  const timestamp = Date.now() / 1000;

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
    timestamp,
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
    timestamp: timestamp + 0.08,
  });
};

const touchTap = async (page: Page, target: Locator) => {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  await touchTapAt(page, {
    x: box!.x + box!.width / 2,
    y: box!.y + box!.height / 2,
  });
};

test("settings controls activate on the first touch without preparing tab previews", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await openApp(page, "/settings/appearance");

  const panel = page.locator("#settings-tab-panel");
  const oceanBlue = page.getByRole("radio", {
    name: "Ocean Blue Clear & confident",
  });
  await oceanBlue.scrollIntoViewIfNeeded();
  await expect(panel.locator(".is-preview")).toHaveCount(0);

  await touchTap(page, oceanBlue);

  await expect(oceanBlue).toHaveAttribute("aria-checked", "true");
  await expect(panel.locator(".is-preview")).toHaveCount(0);
});

test("a partially clipped settings tab navigates on the first touch", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await openApp(page, "/settings/profile");

  const tablist = page.getByRole("tablist", { name: "Settings sections" });
  const securityTab = tablist.getByRole("tab", {
    name: "Privacy & Security",
  });
  const visiblePoint = await securityTab.evaluate((tab) => {
    const tabElement = tab as HTMLElement;
    const list = tabElement.closest<HTMLElement>('[role="tablist"]');
    if (!list) throw new Error("Settings tablist is missing");
    list.scrollLeft =
      tabElement.offsetLeft -
      list.clientWidth +
      Math.round(tabElement.offsetWidth / 2);
    const tabBox = tabElement.getBoundingClientRect();
    const listBox = list.getBoundingClientRect();
    return {
      x: (Math.max(tabBox.left, listBox.left) + listBox.right) / 2,
      y: tabBox.top + tabBox.height / 2,
    };
  });

  await touchTapAt(page, visiblePoint);

  await expect(page).toHaveURL(/\/settings\/security$/);
  await expect(securityTab).toHaveAttribute("aria-selected", "true");
});

test("the profile bio only blocks tab swipes while it is focused for editing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await openApp(page, "/settings/profile");

  const panel = page.locator("#settings-tab-panel");
  const bio = page.locator("#profile-bio");
  await bio.scrollIntoViewIfNeeded();
  await expect(bio).not.toBeFocused();

  const finishUnfocusedSwipe = await startTouchSwipeAt(
    page,
    await getLocatorCenter(bio),
    -190,
  );
  await finishUnfocusedSwipe();
  await expect(page).toHaveURL(/\/settings\/appearance$/);

  await openApp(page, "/settings/profile");
  await bio.scrollIntoViewIfNeeded();
  await bio.focus();
  await expect(bio).toBeFocused();

  const finishFocusedSwipe = await startTouchSwipeAt(
    page,
    await getLocatorCenter(bio),
    -190,
  );
  await finishFocusedSwipe();

  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(bio).toBeFocused();
  await expect(panel).not.toHaveAttribute("data-tab-swipe-active", "");
});

test("settings content swipes between adjacent tabs without moving the sidebar", async ({
  page,
}) => {
  await openApp(page, "/settings/appearance");
  const app = page.locator(".courses-app");
  const panel = page.locator("#settings-tab-panel");
  const currentLayer = panel.locator(".swipeable-tab-panel__layer.is-current");
  const tablist = page.getByRole("tablist", { name: "Settings sections" });
  const indicator = tablist.locator(".page-tabs__indicator");
  const initialIndicator = await indicator.boundingBox();
  const mainBox = await page.locator(".courses-main").boundingBox();
  const panelBox = await panel.boundingBox();
  const currentRoot = currentLayer.locator(":scope > *");
  const initialRootBox = await currentRoot.boundingBox();
  const currentContentBox = await currentLayer
    .locator(":scope > .settings-content")
    .boundingBox();
  const tablistBox = await tablist.boundingBox();
  const firstSectionBox = await currentLayer
    .locator(".settings-section")
    .first()
    .boundingBox();

  expect(Math.abs(panelBox!.x - mainBox!.x)).toBeLessThan(1);
  expect(Math.abs(currentContentBox!.x - mainBox!.x)).toBeLessThan(1);
  expect(Math.abs(tablistBox!.x - firstSectionBox!.x)).toBeLessThan(1);
  expect(
    Math.abs(
      tablistBox!.x +
        tablistBox!.width -
        (firstSectionBox!.x + firstSectionBox!.width),
    ),
  ).toBeLessThan(1);

  await expect(panel.locator(".is-preview")).toHaveCount(0);
  await expect(panel).not.toHaveAttribute("data-tab-swipe-active", "");

  const finishSwipe = await startTouchSwipe(page, panel, -190);
  await expect(panel.locator(".is-preview.is-next")).toContainText(
    "Sidebar header",
  );
  expect(
    await currentLayer.evaluate(
      (element) =>
        new DOMMatrixReadOnly(getComputedStyle(element).transform).m41,
    ),
  ).toBeLessThan(-100);
  const movingRootBox = await currentRoot.boundingBox();
  expect(Math.abs(movingRootBox!.y - initialRootBox!.y)).toBeLessThan(1);
  const movingLayerGap = await panel.evaluate((element) => {
    const current = element.querySelector<HTMLElement>(
      ".swipeable-tab-panel__layer.is-current",
    );
    const next = element.querySelector<HTMLElement>(
      ".swipeable-tab-panel__layer.is-next",
    );
    if (!current || !next) return null;
    return (
      next.getBoundingClientRect().left - current.getBoundingClientRect().right
    );
  });
  expect(movingLayerGap).toBeCloseTo(12, 0);
  const movingIndicator = await indicator.boundingBox();
  expect(movingIndicator!.x).toBeGreaterThan(initialIndicator!.x);
  await expect(app).not.toHaveClass(/courses-app--resizing/);

  await finishSwipe();
  await expect(page).toHaveURL(/\/settings\/sidebar$/);
  await expect(panel).toHaveAttribute("data-settings-tab", "sidebar");
  await expect(currentLayer).toContainText("Sidebar header");
  await expect(panel).not.toHaveAttribute("data-tab-swipe-active", "");
  expect(
    await currentLayer.evaluate(
      (element) => getComputedStyle(element).transform,
    ),
  ).toBe("none");

  const finishReturnSwipe = await startTouchSwipe(page, panel, 190);
  await expect(panel.locator(".is-preview.is-previous")).toContainText(
    "Display mode",
  );
  await finishReturnSwipe();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
});

test("every Settings detail panel aligns with the tab content rail", async ({
  page,
}) => {
  const routes = [
    "/settings/profile",
    "/settings/learning",
    "/settings/notifications",
    "/settings/security",
    "/settings/account",
  ];

  for (const route of routes) {
    await openApp(page, route);
    const tablistBox = await page
      .getByRole("tablist", { name: "Settings sections" })
      .boundingBox();
    const contentBox = await page
      .locator("#settings-tab-panel .is-current > *")
      .boundingBox();

    expect(Math.abs(contentBox!.x - tablistBox!.x), route).toBeLessThan(1);
    expect(
      Math.abs(
        contentBox!.x + contentBox!.width - (tablistBox!.x + tablistBox!.width),
      ),
      route,
    ).toBeLessThan(1);
  }
});

test("the active Settings tab stays unobstructed on narrow mobile screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await openApp(page, "/settings/learning");

  const tablist = page.getByRole("tablist", { name: "Settings sections" });
  const learningTab = tablist.getByRole("tab", { name: "Learning" });
  await expect(learningTab).toBeVisible();
  await expect(learningTab).toHaveAttribute("aria-selected", "true");

  const overlayContent = await tablist.evaluate(
    (element) => getComputedStyle(element, "::after").content,
  );
  expect(overlayContent).toBe("none");

  const hitTarget = await learningTab.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    return hit === element || element.contains(hit);
  });
  expect(hitTarget).toBe(true);
});

test("swiping Settings keeps every newly selected tab inside the mobile tab strip", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page, "/settings/profile");

  const panel = page.locator("#settings-tab-panel");
  const tablist = page.getByRole("tablist", { name: "Settings sections" });
  const destinations = [
    "Appearance",
    "Sidebar",
    "Learning",
    "Notifications",
    "Privacy & Security",
    "Account",
  ];

  for (const name of destinations) {
    const finishSwipe = await startTouchSwipe(page, panel, -190);
    await finishSwipe();
    const selectedTab = tablist.getByRole("tab", { name });
    await expect(selectedTab).toHaveAttribute("aria-selected", "true");
    await expect
      .poll(() =>
        selectedTab.evaluate((element) => {
          const list = element.closest<HTMLElement>('[role="tablist"]');
          if (!list) return false;
          const listBounds = list.getBoundingClientRect();
          const tabBounds = element.getBoundingClientRect();
          return (
            tabBounds.left >= listBounds.left - 1 &&
            tabBounds.right <= listBounds.right + 1
          );
        }),
      )
      .toBe(true);
  }
});

test("discussion content and lesson tools use the same adjacent swipe behavior", async ({
  page,
}) => {
  await openApp(page, "/discussions/q-and-a");
  const discussionPanel = page.locator("#discussion-panel");
  const discussionMainBox = await page.locator(".courses-main").boundingBox();
  const discussionPanelBox = await discussionPanel.boundingBox();
  const discussionThreadBox = await discussionPanel
    .locator(".discussion-thread")
    .first()
    .boundingBox();
  expect(discussionMainBox).not.toBeNull();
  expect(discussionPanelBox).not.toBeNull();
  expect(discussionThreadBox).not.toBeNull();
  expect(Math.abs(discussionPanelBox!.x - discussionMainBox!.x)).toBeLessThan(
    1,
  );
  expect(
    Math.abs(
      discussionPanelBox!.x +
        discussionPanelBox!.width -
        (discussionMainBox!.x + discussionMainBox!.width),
    ),
  ).toBeLessThan(1);
  expect(discussionThreadBox!.x - discussionPanelBox!.x).toBeGreaterThan(20);
  const discussionContentTop = await getCurrentPanelContentTop(discussionPanel);
  expect(discussionContentTop).not.toBeNull();
  const finishDiscussionSwipe = await startTouchSwipe(
    page,
    discussionPanel,
    -190,
  );
  await expect(discussionPanel.locator(".is-preview.is-next")).toContainText(
    "Help with MySQL joins",
  );
  await expectAlignedAdjacentPanels(discussionPanel);
  await finishDiscussionSwipe();
  await expect(page).toHaveURL(/\/discussions\/comments$/);
  await expect(discussionPanel).toHaveAttribute(
    "data-discussion-tab",
    "comments",
  );
  await expect
    .poll(() => getCurrentPanelContentTop(discussionPanel))
    .toBeCloseTo(discussionContentTop!, 0);

  await openApp(
    page,
    "/learn/typescript-course/the-design-mindset?from=courses",
  );
  const lessonPanel = page.locator("#learning-discussion-tab-panel");
  const lessonTabs = page.getByRole("tablist", { name: "Lesson tools" });
  const lessonCurriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  await expect(lessonCurriculum).toBeVisible();
  const finishLessonTabStripSwipe = await startTouchSwipe(
    page,
    lessonTabs,
    -190,
  );
  await finishLessonTabStripSwipe();
  await expect(
    lessonTabs.getByRole("tab", { name: "Comments" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(lessonCurriculum).toBeVisible();
  const lessonColumnBox = await page
    .locator(".learning-workspace__lesson-column")
    .boundingBox();
  const lessonPanelBox = await lessonPanel.boundingBox();
  const lessonComposerBox = await lessonPanel
    .locator(".learning-comment-composer")
    .boundingBox();
  expect(lessonColumnBox).not.toBeNull();
  expect(lessonPanelBox).not.toBeNull();
  expect(lessonComposerBox).not.toBeNull();
  // The panel intentionally extends beyond its lesson column on both sides so
  // elevated cards can cast an unclipped shadow at the page edges.
  expect(lessonPanelBox!.x - lessonColumnBox!.x).toBeCloseTo(-12, 0);
  expect(
    lessonColumnBox!.x +
      lessonColumnBox!.width -
      (lessonPanelBox!.x + lessonPanelBox!.width),
  ).toBeCloseTo(-10, 0);
  expect(lessonComposerBox!.x - lessonPanelBox!.x).toBeGreaterThanOrEqual(6);
  const lessonContentTop = await getCurrentPanelContentTop(lessonPanel);
  expect(lessonContentTop).not.toBeNull();
  const finishLessonSwipe = await startTouchSwipe(page, lessonPanel, -190);
  await expect(lessonPanel.locator(".is-preview.is-next")).toContainText(
    "Your lesson notes",
  );
  await expectAlignedAdjacentPanels(lessonPanel);
  await finishLessonSwipe();
  await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect
    .poll(() => getCurrentPanelContentTop(lessonPanel))
    .toBeCloseTo(lessonContentTop!, 0);
  await expect(lessonCurriculum).toBeVisible();
});

test("mobile lesson tool swipes change tabs without opening course content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openApp(
    page,
    "/learn/typescript-course/career-opportunities?from=courses",
  );

  const lessonPanel = page.locator("#learning-discussion-tab-panel");
  const lessonTitle = page.locator("#learning-course-content-trigger");
  const lessonTools = page.locator(".learning-discussion__header");
  const courseDrawer = page.getByRole("dialog", { name: "Course lessons" });
  await expect(lessonPanel).toBeVisible();
  await expect(courseDrawer).toBeHidden();
  const positionBefore = {
    scrollTop: await page.evaluate(() => window.scrollY),
    titleTop: (await lessonTitle.boundingBox())!.y,
    toolsTop: (await lessonTools.boundingBox())!.y,
  };

  const finishLessonSwipe = await startTouchSwipe(page, lessonPanel, -190);
  await expect(lessonPanel.locator(".is-preview.is-next")).toContainText(
    "Your lesson notes",
  );
  await finishLessonSwipe();

  await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(
    positionBefore.scrollTop,
    0,
  );
  expect((await lessonTitle.boundingBox())!.y).toBeCloseTo(
    positionBefore.titleTop,
    0,
  );
  expect((await lessonTools.boundingBox())!.y).toBeCloseTo(
    positionBefore.toolsTop,
    0,
  );
  await expect(courseDrawer).toBeHidden();
});

test("mobile lesson tabs keep independent scroll positions throughout swipes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openApp(
    page,
    "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
  );

  const lessonPanel = page.locator("#learning-discussion-tab-panel");
  const lessonTools = page.locator(".learning-discussion__header");
  const currentContentTop = () =>
    lessonPanel.evaluate((panel) => {
      const content = panel.querySelector<HTMLElement>(
        ".swipeable-tab-panel__layer.is-current > :first-child",
      );
      return content?.getBoundingClientRect().top ?? null;
    });
  const previewContentTop = (position: "is-next" | "is-previous") =>
    lessonPanel.evaluate((panel, previewPosition) => {
      const content = panel.querySelector<HTMLElement>(
        `.swipeable-tab-panel__layer.${previewPosition} > :first-child`,
      );
      return content?.getBoundingClientRect().top ?? null;
    }, position);
  const visibleSwipePoint = () =>
    lessonPanel.evaluate((panel) => {
      const headerBottom = document
        .querySelector<HTMLElement>(".learning-discussion__header")!
        .getBoundingClientRect().bottom;
      const layer = panel.querySelector<HTMLElement>(
        ".swipeable-tab-panel__layer.is-current",
      );
      if (!layer) throw new Error("Current lesson tab layer missing");
      const bounds = layer.getBoundingClientRect();
      return {
        x: bounds.left + bounds.width * 0.58,
        y: Math.min(window.innerHeight - 96, headerBottom + 56),
      };
    });
  await page.evaluate(() => window.scrollTo({ top: 500, behavior: "auto" }));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(300);
  const commentsScrollTop = await page.evaluate(() => window.scrollY);
  const commentsContentTop = await currentContentTop();
  expect(commentsContentTop).not.toBeNull();

  const finishCommentsToNotes = await startTouchSwipeAt(
    page,
    await visibleSwipePoint(),
    -190,
  );
  const stickyHeaderBottom = await lessonTools.evaluate(
    (header) => header.getBoundingClientRect().bottom,
  );
  await expect
    .poll(() => previewContentTop("is-next"))
    .toBeCloseTo(stickyHeaderBottom + 12, 0);
  const notesPreviewTop = await previewContentTop("is-next");
  await finishCommentsToNotes();
  await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await currentContentTop()).toBeCloseTo(notesPreviewTop!, 0);

  const notesInitialScrollTop = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => window.scrollBy({ top: 96, behavior: "auto" }));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(notesInitialScrollTop + 60);
  const notesScrollTop = await page.evaluate(() => window.scrollY);
  const notesContentTop = await currentContentTop();
  expect(notesContentTop).not.toBeNull();

  const finishNotesToResources = await startTouchSwipeAt(
    page,
    await visibleSwipePoint(),
    -190,
  );
  await expect
    .poll(() => previewContentTop("is-next"))
    .toBeCloseTo(stickyHeaderBottom + 12, 0);
  const resourcesPreviewTop = await previewContentTop("is-next");
  await finishNotesToResources();
  await expect(page.getByRole("tab", { name: "Resources" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await currentContentTop()).toBeCloseTo(resourcesPreviewTop!, 0);
  const resourcesScrollTop = await page.evaluate(() => window.scrollY);
  const resourcesContentTop = await currentContentTop();

  const finishResourcesToQa = await startTouchSwipeAt(
    page,
    await visibleSwipePoint(),
    -190,
  );
  await expect
    .poll(() => previewContentTop("is-next"))
    .toBeCloseTo(stickyHeaderBottom + 12, 0);
  const qaPreviewTop = await previewContentTop("is-next");
  await finishResourcesToQa();
  await expect(page.getByRole("tab", { name: "Q&A" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await currentContentTop()).toBeCloseTo(qaPreviewTop!, 0);

  const finishQaToResources = await startTouchSwipeAt(
    page,
    await visibleSwipePoint(),
    190,
  );
  await expect
    .poll(() => previewContentTop("is-previous"))
    .toBeCloseTo(resourcesContentTop!, 0);
  await finishQaToResources();
  await expect(page.getByRole("tab", { name: "Resources" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(
    resourcesScrollTop,
    0,
  );
  expect(await currentContentTop()).toBeCloseTo(resourcesContentTop!, 0);

  const finishResourcesToNotes = await startTouchSwipeAt(
    page,
    await visibleSwipePoint(),
    190,
  );
  await expect
    .poll(() => previewContentTop("is-previous"))
    .toBeCloseTo(notesContentTop!, 0);
  await finishResourcesToNotes();
  await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(
    notesScrollTop,
    0,
  );
  expect(await currentContentTop()).toBeCloseTo(notesContentTop!, 0);

  const finishNotesToComments = await startTouchSwipeAt(
    page,
    await visibleSwipePoint(),
    190,
  );
  await expect
    .poll(() => previewContentTop("is-previous"))
    .toBeCloseTo(commentsContentTop!, 0);
  await finishNotesToComments();
  await expect(page.getByRole("tab", { name: "Comments" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(
    commentsScrollTop,
    0,
  );
  expect(await currentContentTop()).toBeCloseTo(commentsContentTop!, 0);
});

test("tablet lesson tool swipes preserve the sticky stack at 840px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 840, height: 779 });
  await openApp(
    page,
    "/learn/backend-nodejs/career-opportunities-15?from=courses",
  );

  const lessonPanel = page.locator("#learning-discussion-tab-panel");
  const player = page.locator(".learning-workspace__player-wrap");
  const lessonTools = page.locator(".learning-discussion__header");
  const scrollport = page.locator("#courses-main-scrollport");
  await scrollport.evaluate((element) => element.scrollTo(0, 360));
  await expect
    .poll(() => scrollport.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(100);
  const positionBefore = {
    scrollTop: await scrollport.evaluate((element) => element.scrollTop),
    playerTop: (await player.boundingBox())!.y,
    toolsTop: (await lessonTools.boundingBox())!.y,
  };
  const swipePoint = await lessonPanel.evaluate((panel) => {
    const headerBottom = document
      .querySelector<HTMLElement>(".learning-discussion__header")!
      .getBoundingClientRect().bottom;
    const card = Array.from(
      panel.querySelectorAll<HTMLElement>(".learning-comment-card"),
    ).find(
      (candidate) => candidate.getBoundingClientRect().top > headerBottom + 12,
    );
    if (!card)
      throw new Error("No visible tablet comment is available to swipe.");
    const bounds = card.getBoundingClientRect();
    return {
      x: bounds.left + bounds.width * 0.58,
      y: bounds.top + Math.min(56, bounds.height / 2),
    };
  });

  const finishSwipe = await startTouchSwipeAt(page, swipePoint, -190);
  await finishSwipe();
  await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const notesCard = lessonPanel
    .getByRole("heading", { name: "Your lesson notes" })
    .locator("..");
  await expect(notesCard).toBeVisible();
  expect(await scrollport.evaluate((element) => element.scrollTop)).toBeCloseTo(
    positionBefore.scrollTop,
    0,
  );
  expect((await player.boundingBox())!.y).toBeCloseTo(
    positionBefore.playerTop,
    0,
  );
  expect((await lessonTools.boundingBox())!.y).toBeCloseTo(
    positionBefore.toolsTop,
    0,
  );
  expect((await notesCard.boundingBox())!.y).toBeCloseTo(
    (await lessonTools.boundingBox())!.y +
      (await lessonTools.boundingBox())!.height +
      12,
    0,
  );
});

test("lesson tool tab changes keep the sticky lesson stack in place", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openApp(
    page,
    "/learn/typescript-course/career-opportunities?from=courses",
  );

  const lessonPanel = page.locator("#learning-discussion-tab-panel");
  const player = page.locator(".learning-workspace__player-wrap");
  const lessonTools = page.locator(".learning-discussion__header");

  await page.evaluate(() => window.scrollTo({ top: 360, behavior: "auto" }));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
  await expect(player).toHaveCSS("position", "sticky");
  await expect(lessonTools).toHaveCSS("position", "sticky");

  const playerTopBefore = (await player.boundingBox())!.y;
  const lessonToolsTopBefore = (await lessonTools.boundingBox())!.y;
  const scrollTopBefore = await page.evaluate(() => window.scrollY);
  const swipePoint = await lessonPanel.evaluate((panel) => {
    const headerBottom =
      document
        .querySelector<HTMLElement>(".learning-discussion__header")
        ?.getBoundingClientRect().bottom ?? 0;
    const card = Array.from(
      panel.querySelectorAll<HTMLElement>(".learning-comment-card"),
    ).find(
      (candidate) => candidate.getBoundingClientRect().top > headerBottom + 12,
    );
    if (!card) {
      throw new Error("No visible comment card is available to swipe.");
    }
    const bounds = card.getBoundingClientRect();
    return {
      x: bounds.left + bounds.width * 0.58,
      y: bounds.top + Math.min(56, bounds.height / 2),
    };
  });
  const finishSwipe = await startTouchSwipeAt(page, swipePoint, -190);
  await finishSwipe();

  await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const notesCard = lessonPanel
    .getByRole("heading", {
      name: "Your lesson notes",
    })
    .locator("..");
  await expect(notesCard).toBeVisible();
  const scrollAfter = await page.evaluate(() => window.scrollY);
  expect(scrollAfter).toBeCloseTo(scrollTopBefore, 0);
  expect((await player.boundingBox())!.y).toBeCloseTo(playerTopBefore, 0);
  expect((await lessonTools.boundingBox())!.y).toBeCloseTo(
    lessonToolsTopBefore,
    0,
  );
  expect((await notesCard.boundingBox())!.y).toBeCloseTo(
    (await lessonTools.boundingBox())!.y +
      (await lessonTools.boundingBox())!.height +
      12,
    0,
  );
});

test("lesson tool clicks position the incoming tab below the sticky lesson stack", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openApp(
    page,
    "/learn/typescript-course/career-opportunities?from=courses",
  );

  const lessonPanel = page.locator("#learning-discussion-tab-panel");
  const player = page.locator(".learning-workspace__player-wrap");
  const lessonTools = page.locator(".learning-discussion__header");
  await page.evaluate(() => window.scrollTo({ top: 360, behavior: "auto" }));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
  const playerTopBefore = (await player.boundingBox())!.y;
  const lessonToolsTopBefore = (await lessonTools.boundingBox())!.y;
  const scrollTopBefore = await page.evaluate(() => window.scrollY);

  await page
    .getByRole("tab", { name: "Notes" })
    .evaluate((tab) => (tab as HTMLButtonElement).click());

  await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const notesCard = lessonPanel
    .getByRole("heading", {
      name: "Your lesson notes",
    })
    .locator("..");
  await expect(notesCard).toBeVisible();
  const scrollAfter = await page.evaluate(() => window.scrollY);
  expect(scrollAfter).toBeCloseTo(scrollTopBefore, 0);
  expect((await player.boundingBox())!.y).toBeCloseTo(playerTopBefore, 0);
  expect((await lessonTools.boundingBox())!.y).toBeCloseTo(
    lessonToolsTopBefore,
    0,
  );
  expect((await notesCard.boundingBox())!.y).toBeCloseTo(
    (await lessonTools.boundingBox())!.y +
      (await lessonTools.boundingBox())!.height +
      12,
    0,
  );
});

test("desktop screen halves route swipes to the sidebar and curriculum outside lesson tabs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 779 });
  await openApp(
    page,
    "/learn/backend-nodejs/career-opportunities-15?from=courses",
  );

  const app = page.locator(".courses-app");
  const main = page.locator("main.learning-workspace__main");
  const player = page.getByRole("region", {
    name: /Lesson video player for Career Opportunities/,
  });
  const curriculumColumn = page.locator(
    ".learning-workspace__curriculum-column",
  );
  const curriculum = page.getByRole("complementary", {
    name: "Course curriculum",
  });
  const playerSwipePoint = async (side: "left" | "right") => {
    const bounds = await player.boundingBox();
    expect(bounds).not.toBeNull();
    const midpoint = page.viewportSize()!.width / 2;
    const x =
      side === "right"
        ? Math.max(
            midpoint + 64,
            Math.min(bounds!.x + bounds!.width - 48, midpoint + 260),
          )
        : Math.min(midpoint - 64, Math.max(bounds!.x + 48, midpoint - 260));
    if (side === "right") {
      expect(
        x,
        "right player swipe should start in the right half",
      ).toBeGreaterThan(midpoint);
    } else {
      expect(x, "left player swipe should start in the left half").toBeLessThan(
        midpoint,
      );
    }
    return {
      x,
      y: bounds!.y + bounds!.height * 0.34,
    };
  };

  await expect(curriculum).toBeVisible();
  await expect(app).not.toHaveClass(/courses-app--collapsed/);

  // The video occupies both logical halves. A rightward gesture beginning in
  // its right half belongs to course content, not the app sidebar.
  await dispatchPointerSwipeAt(page, await playerSwipePoint("right"), 190);
  await expect(main).toHaveClass(/is-curriculum-collapsed/);
  await expect(app).not.toHaveClass(/courses-app--collapsed/);
  await expect
    .poll(async () => (await curriculumColumn.boundingBox())?.width ?? 0)
    .toBeLessThanOrEqual(1);

  await dispatchPointerSwipeAt(page, await playerSwipePoint("right"), -190);
  await expect(main).not.toHaveClass(/is-curriculum-collapsed/);
  await expect(curriculum).toBeVisible();
  await expect
    .poll(async () => (await curriculumColumn.boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(300);

  // The same rightward gesture can begin on the content menu itself.
  const curriculumLesson = curriculum
    .locator(".learning-curriculum__lesson")
    .nth(2);
  await dispatchPointerSwipeAt(
    page,
    await getLocatorCenter(curriculumLesson),
    190,
  );
  await expect(main).toHaveClass(/is-curriculum-collapsed/);

  await dispatchPointerSwipeAt(page, await playerSwipePoint("right"), -190);
  await expect(main).not.toHaveClass(/is-curriculum-collapsed/);

  // Gestures beginning in the video’s left half remain owned by the app
  // sidebar, in both collapse and expand directions.
  await dispatchPointerSwipeAt(page, await playerSwipePoint("left"), -190);
  await expect(app).toHaveClass(/courses-app--collapsed/);
  await expect(main).not.toHaveClass(/is-curriculum-collapsed/);

  await dispatchPointerSwipeAt(page, await playerSwipePoint("left"), 190);
  await expect(app).not.toHaveClass(/courses-app--collapsed/);
  await expect(main).not.toHaveClass(/is-curriculum-collapsed/);
});

test("discussion surfaces keep swipe clipping outside mobile content gutters", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const [path, panelSelector, contentSelector] of [
    ["/discussions/q-and-a", "#discussion-panel", ".discussion-thread"],
    [
      "/learn/typescript-course/career-opportunities?from=home",
      "#learning-discussion-tab-panel",
      ".learning-comment-composer",
    ],
  ] as const) {
    await openApp(page, path);
    const panel = page.locator(panelSelector);
    await expect(panel).toBeVisible({ timeout: 15_000 });
    const mainBox = await page.locator(".courses-main").boundingBox();
    const panelBox = await panel.boundingBox();
    const contentBox = await panel
      .locator(contentSelector)
      .first()
      .boundingBox();
    expect(mainBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    expect(contentBox).not.toBeNull();

    expect(Math.abs(panelBox!.x - mainBox!.x), path).toBeLessThan(1);
    expect(
      Math.abs(panelBox!.x + panelBox!.width - (mainBox!.x + mainBox!.width)),
      path,
    ).toBeLessThan(1);
    expect(contentBox!.x - panelBox!.x, path).toBeGreaterThanOrEqual(12);

    const initialContentTop = await getCurrentPanelContentTop(panel);
    expect(initialContentTop, path).not.toBeNull();
    const finishSwipe = await startTouchSwipe(page, panel, -190);
    await expectAlignedAdjacentPanels(panel);
    await finishSwipe();
    await expect
      .poll(() => getCurrentPanelContentTop(panel), { message: path })
      .toBeCloseTo(initialContentTop!, 0);
  }
});

test("a short slow swipe springs back and an edge swipe stays inside the tab panel", async ({
  page,
}) => {
  await openApp(page, "/settings/profile");
  const app = page.locator(".courses-app");
  const panel = page.locator("#settings-tab-panel");
  await expect(panel.locator(".is-preview.is-previous")).toHaveCount(0);
  await expect(panel.locator(".is-preview.is-next")).toHaveCount(0);
  const finishEdgeSwipe = await startTouchSwipe(page, panel, 52);
  await expect(panel.locator(".is-preview.is-previous")).toHaveCount(0);
  await finishEdgeSwipe();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(app).not.toHaveClass(/courses-app--resizing/);
  await expect(panel).not.toHaveAttribute("data-tab-swipe-active", "");

  await openApp(page, "/settings/appearance");
  await expect(panel.locator(".is-preview")).toHaveCount(0);
  const finishShortSwipe = await startTouchSwipe(page, panel, -42);
  await expect(panel.locator(".is-preview.is-next")).toHaveCount(1);
  await finishShortSwipe();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
  await expect(panel.locator(".is-preview")).toHaveCount(2);
  await expect(panel).not.toHaveAttribute("data-tab-swipe-active", "");
});
