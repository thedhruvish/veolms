import { describe, expect, it } from "vitest";
import {
  getAdjacentTab,
  getNearestTabScrollLeft,
  shouldCompleteTabSwipe,
} from "../../src/navigation/SwipeableTabPanel";

describe("swipeable tab navigation", () => {
  const tabs = ["profile", "appearance", "sidebar", "learning"] as const;

  it("moves one tab at a time and respects both boundaries", () => {
    expect(getAdjacentTab(tabs, "appearance", 1)).toBe("sidebar");
    expect(getAdjacentTab(tabs, "appearance", -1)).toBe("profile");
    expect(getAdjacentTab(tabs, "profile", -1)).toBeNull();
    expect(getAdjacentTab(tabs, "learning", 1)).toBeNull();
  });

  it("settles after a deliberate drag but returns after a short slow drag", () => {
    expect(
      shouldCompleteTabSwipe({ distance: -128, velocity: -0.15, width: 600 }),
    ).toBe(true);
    expect(
      shouldCompleteTabSwipe({ distance: -42, velocity: -0.16, width: 600 }),
    ).toBe(false);
  });

  it("accepts a directional fling and rejects velocity against the gesture", () => {
    expect(
      shouldCompleteTabSwipe({ distance: 30, velocity: 0.64, width: 600 }),
    ).toBe(true);
    expect(
      shouldCompleteTabSwipe({ distance: 30, velocity: -0.64, width: 600 }),
    ).toBe(false);
  });

  it("scrolls only enough to keep the selected tab inside the tab strip", () => {
    expect(
      getNearestTabScrollLeft({
        scrollLeft: 0,
        scrollWidth: 620,
        clientWidth: 320,
        viewportLeft: 0,
        viewportRight: 320,
        tabLeft: 330,
        tabRight: 390,
      }),
    ).toBe(82);
    expect(
      getNearestTabScrollLeft({
        scrollLeft: 180,
        scrollWidth: 620,
        clientWidth: 320,
        viewportLeft: 0,
        viewportRight: 320,
        tabLeft: -20,
        tabRight: 40,
      }),
    ).toBe(148);
    expect(
      getNearestTabScrollLeft({
        scrollLeft: 80,
        scrollWidth: 620,
        clientWidth: 320,
        viewportLeft: 0,
        viewportRight: 320,
        tabLeft: 80,
        tabRight: 160,
      }),
    ).toBe(80);
  });
});
