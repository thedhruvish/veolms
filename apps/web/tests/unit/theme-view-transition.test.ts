import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyWithThemeViewTransition } from "../../src/shell/themeViewTransition.js";

type MockViewTransitionFactory = ReturnType<typeof installTransitionMock>;

function installTransitionMock() {
  const startViewTransition = vi.fn((updateCallback: () => void) => {
    updateCallback();
    const settled = Promise.resolve();
    return {
      finished: settled,
      ready: settled,
      updateCallbackDone: settled,
    };
  });
  Object.defineProperty(document, "startViewTransition", {
    value: startViewTransition,
    configurable: true,
    writable: true,
  });
  return startViewTransition;
}

function dispatchPointerDown(x: number, y: number) {
  document.body.dispatchEvent(
    new MouseEvent("pointerdown", { clientX: x, clientY: y, bubbles: true }),
  );
}

function rootStyle(): CSSStyleDeclaration {
  return document.documentElement.style;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("applyWithThemeViewTransition", () => {
  let startViewTransition: MockViewTransitionFactory;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    startViewTransition = installTransitionMock();
  });

  afterEach(() => {
    Reflect.deleteProperty(document, "startViewTransition");
    delete document.documentElement.dataset.themeTransition;
    for (const property of ["--theme-reveal-x", "--theme-reveal-y"]) {
      document.documentElement.style.removeProperty(property);
    }
    window.matchMedia = originalMatchMedia;
    vi.useRealTimers();
  });

  it("runs the commit inside the view transition", () => {
    const commit = vi.fn();
    applyWithThemeViewTransition(commit);
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("reveals from the pointerdown position with a fixed duration", async () => {
    dispatchPointerDown(0, 0);
    const commit = vi.fn();
    applyWithThemeViewTransition(commit);
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("0px");
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("0px");
    expect(rootStyle().getPropertyValue("--theme-reveal-duration")).toBe("");
    await vi.waitFor(() =>
      expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe(""),
    );
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("");
    expect(document.documentElement.dataset.themeTransition).toBeUndefined();
  });

  it("keeps the same fixed pacing for center clicks as corner clicks", () => {
    const centerX = Math.round(window.innerWidth / 2);
    const centerY = Math.round(window.innerHeight / 2);
    dispatchPointerDown(centerX, centerY);
    applyWithThemeViewTransition(vi.fn());
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe(
      `${centerX}px`,
    );
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe(
      `${centerY}px`,
    );
    // No duration override: the CSS default (1s) applies everywhere.
    expect(rootStyle().getPropertyValue("--theme-reveal-duration")).toBe("");
  });

  it("falls back to the CSS corner origins without any pointerdown", async () => {
    // A fresh module instance has never observed a pointerdown, matching the
    // first transition of a session (or keyboard/OS-triggered changes).
    vi.resetModules();
    const { applyWithThemeViewTransition: applyFresh } =
      await import("../../src/shell/themeViewTransition.js");
    applyFresh(vi.fn());
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("");
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("");
  });

  it("ignores pointerdowns that are too old to be the reveal trigger", () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    dispatchPointerDown(40, 80);
    vi.advanceTimersByTime(2100);
    applyWithThemeViewTransition(vi.fn());
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("");
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("");
  });

  it("keeps origin vars restaged by a newer transition", async () => {
    const firstTransitionFinished = deferred();
    const secondTransitionFinished = deferred();
    startViewTransition.mockImplementationOnce(() => ({
      finished: firstTransitionFinished.promise,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    }));
    startViewTransition.mockImplementationOnce(() => ({
      finished: secondTransitionFinished.promise,
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
    }));

    dispatchPointerDown(10, 20);
    applyWithThemeViewTransition(vi.fn());
    dispatchPointerDown(30, 40);
    applyWithThemeViewTransition(vi.fn());
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("30px");

    // Skipping the first transition must not wipe the second one's origin;
    // the module registered its finished handler before this await resumes.
    firstTransitionFinished.resolve();
    await firstTransitionFinished.promise;
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("30px");
    expect(rootStyle().getPropertyValue("--theme-reveal-y")).toBe("40px");

    secondTransitionFinished.resolve();
    await secondTransitionFinished.promise;
    expect(rootStyle().getPropertyValue("--theme-reveal-x")).toBe("");
  });

  it("commits directly when the browser lacks view transitions", () => {
    Reflect.deleteProperty(document, "startViewTransition");
    const commit = vi.fn();
    applyWithThemeViewTransition(commit);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("commits directly under reduced motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    }) as unknown as typeof window.matchMedia;
    const commit = vi.fn();
    applyWithThemeViewTransition(commit);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(startViewTransition).not.toHaveBeenCalled();
  });
});
