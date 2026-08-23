import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

const SWIPE_ACTIVATION_DISTANCE = 10;
const SWIPE_DIRECTION_RATIO = 1.15;
const SWIPE_MIN_FLING_DISTANCE = 24;
const SWIPE_FLING_VELOCITY = 0.42;
const SWIPE_SETTLE_DURATION = 240;
const DEFAULT_TAB_SWIPE_GAP = 12;
const TAB_VISIBILITY_INSET = 12;

const TAB_SWIPE_EXCLUSION_SELECTOR = [
  ".app-slider",
  'input[type="range"]',
  '[role="slider"]',
  "progress",
  '[role="progressbar"]',
  "video",
  ".youtube-player",
  "[data-tab-swipe-ignore]",
].join(",");

const TAB_SWIPE_EDITING_SELECTOR = [
  'input:not([type="range"])',
  "textarea",
  "select",
  '[role="textbox"]',
  '[contenteditable]:not([contenteditable="false"])',
].join(",");

type SwipeAxis = "pending" | "horizontal";

interface TabSwipeGesture<T extends string> {
  pointerId: number;
  startX: number;
  startY: number;
  startedAt: number;
  lastX: number;
  lastTimestamp: number;
  velocityX: number;
  offset: number;
  gap: number;
  axis: SwipeAxis;
  targetTab: T | null;
  editingTarget: HTMLElement | null;
}

interface SwipeableTabPanelProps<T extends string> {
  tabs: readonly T[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  tabListRef: RefObject<HTMLElement | null>;
  id: string;
  labelledBy: string;
  className?: string;
  stateAttribute?: `data-${string}`;
  onSwipePrepare?: () => void;
  /**
   * Keeps the host scroll position stable while a destination panel is
   * rendered. This is useful when a long tab can switch to a short tab below
   * sticky UI, where shrinking the document would otherwise clamp the scroll
   * position back to the top.
   */
  preserveScrollPosition?: boolean;
  /**
   * Optionally aligns fresh destination content below sticky chrome without
   * changing the host scroll position or moving that chrome.
   */
  resolveDestinationContentTop?: (context: {
    surface: HTMLElement;
    destination: T;
    direction: -1 | 1;
    scrollTarget: ScrollTarget;
    currentScrollTop: number;
  }) => number | null;
  children: (tab: T, preview: boolean) => ReactNode;
}

type ScrollTarget = HTMLElement | Window;

interface ScrollSnapshot {
  target: ScrollTarget;
  top: number;
  surfaceHeight: number;
}

interface TabScrollState {
  top: number;
  contentOffset: number;
}

interface PendingDestinationScrollState<T extends string> {
  destination: T;
  target: ScrollTarget;
  top: number;
  contentOffset: number | null;
  contentTop: number | null;
}

const isSwipeExcludedTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest(TAB_SWIPE_EXCLUSION_SELECTOR));

const getSwipeEditingTarget = (target: EventTarget | null) =>
  target instanceof Element
    ? target.closest<HTMLElement>(TAB_SWIPE_EDITING_SELECTOR)
    : null;

const syncTabSwipeGap = (surface: HTMLElement) => {
  const currentLayer = surface.querySelector<HTMLElement>(
    ".swipeable-tab-panel__layer.is-current",
  );
  if (!currentLayer) return DEFAULT_TAB_SWIPE_GAP;

  const layerStyle = getComputedStyle(currentLayer);
  const inlineStart = Number.parseFloat(layerStyle.paddingLeft) || 0;
  const inlineEnd = Number.parseFloat(layerStyle.paddingRight) || 0;
  const gap = DEFAULT_TAB_SWIPE_GAP - inlineStart - inlineEnd;
  surface.style.setProperty("--tab-swipe-gap", `${gap}px`);
  return gap;
};

const findScrollTarget = (surface: HTMLElement): ScrollTarget => {
  let ancestor = surface.parentElement;
  while (ancestor) {
    const style = getComputedStyle(ancestor);
    const canScrollVertically =
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      ancestor.scrollHeight > ancestor.clientHeight;
    if (canScrollVertically) return ancestor;
    ancestor = ancestor.parentElement;
  }
  return window;
};

const getScrollTop = (target: ScrollTarget) =>
  target instanceof Window ? target.scrollY : target.scrollTop;

const restoreScrollTop = (target: ScrollTarget, top: number) => {
  if (target instanceof Window) {
    const scrollingElement = document.scrollingElement;
    if (scrollingElement) {
      scrollingElement.scrollTop = top;
      return;
    }
    target.scrollTo(0, top);
    return;
  }
  target.scrollTop = top;
};

export const getAdjacentTab = <T extends string>(
  tabs: readonly T[],
  activeTab: T,
  direction: -1 | 1,
): T | null => {
  const activeIndex = tabs.indexOf(activeTab);
  return tabs[activeIndex + direction] ?? null;
};

export const shouldCompleteTabSwipe = ({
  distance,
  velocity,
  width,
}: {
  distance: number;
  velocity: number;
  width: number;
}) => {
  const distanceThreshold = Math.min(116, width * 0.24);
  const travelledFarEnough = Math.abs(distance) >= distanceThreshold;
  const fastFling =
    Math.abs(distance) >= SWIPE_MIN_FLING_DISTANCE &&
    Math.abs(velocity) >= SWIPE_FLING_VELOCITY &&
    Math.sign(velocity) === Math.sign(distance);
  return travelledFarEnough || fastFling;
};

export const getNearestTabScrollLeft = ({
  scrollLeft,
  scrollWidth,
  clientWidth,
  viewportLeft,
  viewportRight,
  tabLeft,
  tabRight,
  inset = TAB_VISIBILITY_INSET,
}: {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
  viewportLeft: number;
  viewportRight: number;
  tabLeft: number;
  tabRight: number;
  inset?: number;
}) => {
  const safeInset = Math.min(inset, clientWidth / 4);
  const visibleLeft = viewportLeft + safeInset;
  const visibleRight = viewportRight - safeInset;
  let nextScrollLeft = scrollLeft;

  if (tabLeft < visibleLeft) {
    nextScrollLeft += tabLeft - visibleLeft;
  } else if (tabRight > visibleRight) {
    nextScrollLeft += tabRight - visibleRight;
  }

  return Math.max(
    0,
    Math.min(Math.max(0, scrollWidth - clientWidth), nextScrollLeft),
  );
};

const scrollTabIntoView = (
  tabList: HTMLElement,
  tab: string,
  behavior: ScrollBehavior,
) => {
  const button = Array.from(
    tabList.querySelectorAll<HTMLElement>("[data-swipe-tab-id]"),
  ).find((candidate) => candidate.dataset.swipeTabId === tab);
  if (!button) return;

  const listBounds = tabList.getBoundingClientRect();
  const tabBounds = button.getBoundingClientRect();
  const left = getNearestTabScrollLeft({
    scrollLeft: tabList.scrollLeft,
    scrollWidth: tabList.scrollWidth,
    clientWidth: tabList.clientWidth,
    viewportLeft: listBounds.left,
    viewportRight: listBounds.right,
    tabLeft: tabBounds.left,
    tabRight: tabBounds.right,
  });
  if (Math.abs(left - tabList.scrollLeft) < 0.5) return;

  if (typeof tabList.scrollTo === "function") {
    tabList.scrollTo({ left, behavior });
  } else {
    tabList.scrollLeft = left;
  }
};

const readTabGeometry = (tabList: HTMLElement, tab: string) => {
  const button = Array.from(
    tabList.querySelectorAll<HTMLElement>("[data-swipe-tab-id]"),
  ).find((candidate) => candidate.dataset.swipeTabId === tab);
  if (!button) return null;
  const style = getComputedStyle(button);
  const indicatorToken = style
    .getPropertyValue("--page-tab-active-indicator")
    .trim();
  const color = indicatorToken.includes("--page-tab-tone")
    ? style.getPropertyValue("--page-tab-tone").trim()
    : indicatorToken.includes("--accent")
      ? style.getPropertyValue("--accent").trim()
      : indicatorToken;
  return {
    left: button.offsetLeft,
    width: button.offsetWidth,
    color: color || "var(--accent)",
  };
};

const writeIndicatorGeometry = (
  tabList: HTMLElement,
  geometry: { left: number; width: number; color: string },
) => {
  tabList.style.setProperty("--page-tab-indicator-left", `${geometry.left}px`);
  tabList.style.setProperty(
    "--page-tab-indicator-width",
    `${geometry.width}px`,
  );
  tabList.style.setProperty("--page-tab-indicator-color", geometry.color);
};

export function SwipeableTabPanel<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  tabListRef,
  id,
  labelledBy,
  className = "",
  stateAttribute,
  onSwipePrepare,
  preserveScrollPosition = false,
  resolveDestinationContentTop,
  children,
}: SwipeableTabPanelProps<T>) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<TabSwipeGesture<T> | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<number | null>(null);
  const pendingDestinationRef = useRef<T | null>(null);
  const consumedSwipeRef = useRef(false);
  const previewsPreparedRef = useRef(false);
  const onTabChangeRef = useRef(onTabChange);
  const activeTabRef = useRef(activeTab);
  const activePropRef = useRef(activeTab);
  const pendingScrollSnapshotRef = useRef<ScrollSnapshot | null>(null);
  const tabScrollStatesRef = useRef(new Map<T, TabScrollState>());
  const pendingDestinationScrollStateRef =
    useRef<PendingDestinationScrollState<T> | null>(null);
  const retainedScrollTargetRef = useRef<ScrollTarget | null>(null);
  const clearRetainedHeightRef = useRef<(() => void) | null>(null);
  const retainedHeightReadyRef = useRef(false);
  const [renderedTab, setRenderedTab] = useState(activeTab);
  const [settling, setSettling] = useState(false);
  const [previewsReady, setPreviewsReady] = useState(preserveScrollPosition);
  const visibleTabRef = useRef<T | null>(null);

  onTabChangeRef.current = onTabChange;
  activePropRef.current = activeTab;

  const setSurfaceOffset = useCallback((offset: number) => {
    surfaceRef.current?.style.setProperty("--tab-swipe-offset", `${offset}px`);
  }, []);

  const lockSurfaceHeight = useCallback(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.style.setProperty(
      "--tab-swipe-height",
      `${Math.ceil(surface.getBoundingClientRect().height)}px`,
    );
  }, []);

  const clearRetainedHeight = useCallback(() => {
    const target = retainedScrollTargetRef.current;
    const clear = clearRetainedHeightRef.current;
    if (target && clear) target.removeEventListener("scroll", clear);
    retainedScrollTargetRef.current = null;
    clearRetainedHeightRef.current = null;
    retainedHeightReadyRef.current = false;
    surfaceRef.current?.style.removeProperty("height");
  }, []);

  const retainSurfaceHeightForScroll = useCallback(() => {
    const snapshot = pendingScrollSnapshotRef.current;
    const surface = surfaceRef.current;
    if (!snapshot || !surface) return;

    clearRetainedHeight();
    if (snapshot.top <= 1) return;
    retainedHeightReadyRef.current = false;
    surface.style.setProperty(
      "height",
      `${snapshot.surfaceHeight}px`,
      "important",
    );
    const clearWhenReturnedToTop = () => {
      if (!retainedHeightReadyRef.current) return;
      if (getScrollTop(snapshot.target) > 1) return;
      clearRetainedHeight();
    };
    retainedScrollTargetRef.current = snapshot.target;
    clearRetainedHeightRef.current = clearWhenReturnedToTop;
    snapshot.target.addEventListener("scroll", clearWhenReturnedToTop, {
      passive: true,
    });
  }, [clearRetainedHeight]);

  const captureTabScrollState = useCallback(
    (tab: T, snapshot: ScrollSnapshot) => {
      const surface = surfaceRef.current;
      if (!surface) return;
      const contentOffset =
        Number.parseFloat(
          surface.style.getPropertyValue("--tab-destination-offset"),
        ) || 0;
      tabScrollStatesRef.current.set(tab, {
        top: snapshot.top,
        contentOffset,
      });
    },
    [],
  );

  const prepareDestinationScrollPosition = useCallback(
    (destination: T) => {
      const snapshot = pendingScrollSnapshotRef.current;
      const surface = surfaceRef.current;
      if (!preserveScrollPosition || !snapshot || !surface) return;

      const direction: -1 | 1 =
        tabs.indexOf(destination) > tabs.indexOf(renderedTab) ? 1 : -1;
      const savedState = tabScrollStatesRef.current.get(destination);
      const resolvedContentTop = resolveDestinationContentTop?.({
        surface,
        destination,
        direction,
        scrollTarget: snapshot.target,
        currentScrollTop: snapshot.top,
      });
      const chromePinned = typeof resolvedContentTop === "number";
      const keepPinnedChrome =
        chromePinned && savedState !== undefined && savedState.top <= 1;
      const destinationContentTop =
        chromePinned && (!savedState || keepPinnedChrome)
          ? resolvedContentTop
          : null;
      pendingDestinationScrollStateRef.current = {
        destination,
        target: snapshot.target,
        top:
          !chromePinned || keepPinnedChrome
            ? snapshot.top
            : (savedState?.top ?? snapshot.top),
        contentOffset:
          !chromePinned || keepPinnedChrome
            ? null
            : (savedState?.contentOffset ?? null),
        contentTop:
          typeof destinationContentTop === "number"
            ? destinationContentTop
            : null,
      };
      retainSurfaceHeightForScroll();
    },
    [
      preserveScrollPosition,
      renderedTab,
      resolveDestinationContentTop,
      retainSurfaceHeightForScroll,
      tabs,
    ],
  );

  const syncPreviewScrollPositions = useCallback(
    (snapshot?: ScrollSnapshot) => {
      if (!preserveScrollPosition) return;
      const surface = surfaceRef.current;
      if (!surface) return;

      const scrollTarget = snapshot?.target ?? findScrollTarget(surface);
      const currentScrollTop = snapshot?.top ?? getScrollTop(scrollTarget);
      const renderedIndex = tabs.indexOf(renderedTab);
      const previewLayers = surface.querySelectorAll<HTMLElement>(
        ".swipeable-tab-panel__layer.is-preview[data-swipe-panel-tab]",
      );

      previewLayers.forEach((layer) => {
        const destination = layer.dataset.swipePanelTab as T | undefined;
        if (!destination) return;

        const savedState = tabScrollStatesRef.current.get(destination);
        let previewOffset = 0;
        if (savedState) {
          previewOffset =
            savedState.contentOffset + currentScrollTop - savedState.top;
        } else {
          const destinationIndex = tabs.indexOf(destination);
          const direction: -1 | 1 = destinationIndex > renderedIndex ? 1 : -1;
          const destinationContentTop = resolveDestinationContentTop?.({
            surface,
            destination,
            direction,
            scrollTarget,
            currentScrollTop,
          });
          const destinationContent =
            layer.firstElementChild as HTMLElement | null;
          if (typeof destinationContentTop === "number" && destinationContent) {
            const currentPreviewOffset =
              Number.parseFloat(
                layer.style.getPropertyValue("--tab-preview-y"),
              ) || 0;
            const destinationContentBaseTop =
              destinationContent.getBoundingClientRect().top -
              currentPreviewOffset;
            previewOffset = Math.max(
              0,
              destinationContentTop - destinationContentBaseTop,
            );
          }
        }

        if (Math.abs(previewOffset) >= 0.5) {
          layer.style.setProperty("--tab-preview-y", `${previewOffset}px`);
        } else {
          layer.style.removeProperty("--tab-preview-y");
        }
      });
    },
    [preserveScrollPosition, renderedTab, resolveDestinationContentTop, tabs],
  );

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const pendingState = pendingDestinationScrollStateRef.current;
    if (!pendingState || pendingState.destination !== renderedTab) return;
    pendingDestinationScrollStateRef.current = null;
    const previousContentOffset =
      Number.parseFloat(
        surface.style.getPropertyValue("--tab-destination-offset"),
      ) || 0;
    surface.style.removeProperty("--tab-destination-offset");
    restoreScrollTop(pendingState.target, pendingState.top);

    let contentOffset = pendingState.contentOffset ?? 0;
    if (
      pendingState.contentOffset === null &&
      pendingState.contentTop !== null
    ) {
      const destinationContent = surface.querySelector<HTMLElement>(
        ".swipeable-tab-panel__layer.is-current > :first-child",
      );
      if (destinationContent) {
        contentOffset = Math.max(
          0,
          pendingState.contentTop -
            (destinationContent.getBoundingClientRect().top -
              previousContentOffset),
        );
      }
    }

    if (contentOffset >= 0.5) {
      surface.style.setProperty(
        "--tab-destination-offset",
        `${contentOffset}px`,
      );
    }
    tabScrollStatesRef.current.set(renderedTab, {
      top: pendingState.top,
      contentOffset,
    });
    pendingScrollSnapshotRef.current = null;
    retainedHeightReadyRef.current = true;
  }, [renderedTab]);

  useLayoutEffect(() => {
    if (!previewsReady) return;
    syncPreviewScrollPositions();
  }, [previewsReady, renderedTab, syncPreviewScrollPositions]);

  const updateIndicator = useCallback(
    (targetTab: T | null = null, progress = 0, tracking = false) => {
      const tabList = tabListRef.current;
      if (!tabList) return;
      const activeGeometry = readTabGeometry(tabList, activeTabRef.current);
      if (!activeGeometry) return;
      const targetGeometry = targetTab
        ? readTabGeometry(tabList, targetTab)
        : null;
      const clampedProgress = Math.max(0, Math.min(1, progress));
      const geometry = targetGeometry
        ? {
            left:
              activeGeometry.left +
              (targetGeometry.left - activeGeometry.left) * clampedProgress,
            width:
              activeGeometry.width +
              (targetGeometry.width - activeGeometry.width) * clampedProgress,
            color:
              clampedProgress >= 0.5
                ? targetGeometry.color
                : activeGeometry.color,
          }
        : activeGeometry;
      tabList.toggleAttribute("data-tab-swipe-tracking", tracking);
      writeIndicatorGeometry(tabList, geometry);
    },
    [tabListRef],
  );

  const revealTab = useCallback(
    (tab: T, behavior: ScrollBehavior) => {
      const tabList = tabListRef.current;
      if (!tabList) return;
      scrollTabIntoView(tabList, tab, behavior);
    },
    [tabListRef],
  );

  const prepareSwipePreviews = useCallback(() => {
    if (previewsPreparedRef.current) return;
    previewsPreparedRef.current = true;
    onSwipePrepare?.();
    setPreviewsReady(true);
  }, [onSwipePrepare]);

  const resetVisualState = useCallback(
    (tab: T) => {
      const surface = surfaceRef.current;
      activeTabRef.current = tab;
      setRenderedTab(tab);
      setSurfaceOffset(0);
      surface?.style.removeProperty("--tab-swipe-height");
      surface?.removeAttribute("data-tab-swipe-active");
      surface?.removeAttribute("data-tab-swipe-settling");
      tabListRef.current?.removeAttribute("data-tab-swipe-active");
      tabListRef.current?.removeAttribute("data-tab-swipe-tracking");
      setSettling(false);
      requestAnimationFrame(() => updateIndicator());
    },
    [setSurfaceOffset, tabListRef, updateIndicator],
  );

  useLayoutEffect(() => {
    updateIndicator();
  }, [renderedTab, updateIndicator]);

  useLayoutEffect(() => {
    const behavior =
      visibleTabRef.current === null ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";
    visibleTabRef.current = renderedTab;
    const frame = window.requestAnimationFrame(() =>
      revealTab(renderedTab, behavior),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [renderedTab, revealTab]);

  useLayoutEffect(() => {
    const pendingDestination = pendingDestinationRef.current;
    if (pendingDestination === activeTab) {
      pendingDestinationRef.current = null;
      if (navigationTimerRef.current !== null) {
        window.clearTimeout(navigationTimerRef.current);
        navigationTimerRef.current = null;
      }
      prepareDestinationScrollPosition(activeTab);
      resetVisualState(activeTab);
      return;
    }
    if (
      pendingDestination === null &&
      gestureRef.current === null &&
      !settling &&
      renderedTab !== activeTab
    ) {
      if (preserveScrollPosition) {
        const surface = surfaceRef.current;
        if (surface) {
          lockSurfaceHeight();
          const scrollTarget = findScrollTarget(surface);
          pendingScrollSnapshotRef.current = {
            target: scrollTarget,
            top: getScrollTop(scrollTarget),
            surfaceHeight: Math.ceil(surface.getBoundingClientRect().height),
          };
          captureTabScrollState(renderedTab, pendingScrollSnapshotRef.current);
          prepareDestinationScrollPosition(activeTab);
        }
      }
      resetVisualState(activeTab);
    }
  }, [
    activeTab,
    captureTabScrollState,
    lockSurfaceHeight,
    prepareDestinationScrollPosition,
    preserveScrollPosition,
    renderedTab,
    resetVisualState,
    settling,
  ]);

  useEffect(() => {
    const tabList = tabListRef.current;
    if (!tabList || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      updateIndicator();
      revealTab(activeTabRef.current, "auto");
    });
    observer.observe(tabList);
    return () => observer.disconnect();
  }, [revealTab, tabListRef, updateIndicator]);

  useEffect(
    () => () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
      if (navigationTimerRef.current !== null) {
        window.clearTimeout(navigationTimerRef.current);
      }
      gestureRef.current = null;
      pendingDestinationRef.current = null;
      pendingScrollSnapshotRef.current = null;
      pendingDestinationScrollStateRef.current = null;
      clearRetainedHeight();
      surfaceRef.current?.style.removeProperty("--tab-swipe-height");
      surfaceRef.current?.style.removeProperty("--tab-destination-offset");
      surfaceRef.current?.removeAttribute("data-tab-swipe-active");
      surfaceRef.current?.removeAttribute("data-tab-swipe-settling");
      tabListRef.current?.removeAttribute("data-tab-swipe-active");
      tabListRef.current?.removeAttribute("data-tab-swipe-tracking");
    },
    [clearRetainedHeight, tabListRef],
  );

  const finishSettle = useCallback(
    (destination: T | null) => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = window.setTimeout(
        () => {
          settleTimerRef.current = null;
          if (!destination) {
            pendingScrollSnapshotRef.current = null;
            pendingDestinationScrollStateRef.current = null;
            resetVisualState(activeTabRef.current);
            return;
          }

          prepareDestinationScrollPosition(destination);
          pendingDestinationRef.current = destination;
          onTabChangeRef.current(destination);
          navigationTimerRef.current = window.setTimeout(() => {
            if (pendingDestinationRef.current !== destination) return;
            pendingDestinationRef.current = null;
            navigationTimerRef.current = null;
            resetVisualState(activePropRef.current);
          }, 500);
        },
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : SWIPE_SETTLE_DURATION,
      );
    },
    [prepareDestinationScrollPosition, resetVisualState],
  );

  const startSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const editingTarget = getSwipeEditingTarget(event.target);
    if (
      event.pointerType !== "touch" ||
      !event.isPrimary ||
      gestureRef.current ||
      settling ||
      isSwipeExcludedTarget(event.target) ||
      editingTarget === document.activeElement
    )
      return;

    if (preserveScrollPosition) {
      const scrollTarget = findScrollTarget(event.currentTarget);
      const snapshot = {
        target: scrollTarget,
        top: getScrollTop(scrollTarget),
        surfaceHeight: Math.ceil(
          event.currentTarget.getBoundingClientRect().height,
        ),
      };
      syncPreviewScrollPositions(snapshot);
    }

    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: event.timeStamp,
      lastX: event.clientX,
      lastTimestamp: event.timeStamp,
      velocityX: 0,
      offset: 0,
      gap: DEFAULT_TAB_SWIPE_GAP,
      axis: "pending",
      targetTab: null,
      editingTarget,
    };
  };

  const moveSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const horizontalDistance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);

    if (gesture.axis === "pending") {
      if (
        verticalDistance >= SWIPE_ACTIVATION_DISTANCE &&
        verticalDistance > horizontalDistance * SWIPE_DIRECTION_RATIO
      ) {
        gestureRef.current = null;
        return;
      }
      if (horizontalDistance < SWIPE_ACTIVATION_DISTANCE) return;
      if (horizontalDistance <= verticalDistance * SWIPE_DIRECTION_RATIO)
        return;
      gesture.axis = "horizontal";
      gesture.gap = syncTabSwipeGap(event.currentTarget);
      lockSurfaceHeight();
      if (preserveScrollPosition) {
        const scrollTarget = findScrollTarget(event.currentTarget);
        const snapshot = {
          target: scrollTarget,
          top: getScrollTop(scrollTarget),
          surfaceHeight: Math.ceil(
            event.currentTarget.getBoundingClientRect().height,
          ),
        };
        pendingScrollSnapshotRef.current = snapshot;
        captureTabScrollState(renderedTab, snapshot);
        syncPreviewScrollPositions(snapshot);
      }
      prepareSwipePreviews();
      gesture.editingTarget?.blur();
      consumedSwipeRef.current = true;
      event.currentTarget.setAttribute("data-tab-swipe-active", "");
      tabListRef.current?.setAttribute("data-tab-swipe-active", "");
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    event.preventDefault();
    const direction: -1 | 1 = deltaX < 0 ? 1 : -1;
    const targetTab = getAdjacentTab(tabs, renderedTab, direction);
    const width = Math.max(1, event.currentTarget.clientWidth);
    const travel = Math.max(1, width + gesture.gap);
    const offset = targetTab
      ? Math.max(-travel, Math.min(travel, deltaX))
      : deltaX * 0.16;
    const timestamp = Math.max(
      event.timeStamp || performance.now(),
      gesture.lastTimestamp + 1,
    );
    const elapsed = timestamp - gesture.lastTimestamp;
    const instantaneousVelocity = (event.clientX - gesture.lastX) / elapsed;
    gesture.velocityX =
      gesture.velocityX === 0 || elapsed > 80
        ? instantaneousVelocity
        : gesture.velocityX * 0.35 + instantaneousVelocity * 0.65;
    gesture.lastX = event.clientX;
    gesture.lastTimestamp = timestamp;
    gesture.offset = offset;
    gesture.targetTab = targetTab;

    setSurfaceOffset(offset);
    updateIndicator(targetTab, Math.abs(offset) / travel, true);
  };

  const endSwipe = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled = false,
  ) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // The browser may release capture before pointercancel is dispatched.
    }
    if (gesture.axis !== "horizontal") return;

    const width = Math.max(1, event.currentTarget.clientWidth);
    const averageVelocity =
      gesture.offset /
      Math.max(1, (event.timeStamp || performance.now()) - gesture.startedAt);
    const velocity =
      Math.abs(gesture.velocityX) > Math.abs(averageVelocity)
        ? gesture.velocityX
        : averageVelocity;
    const destination =
      !cancelled &&
      gesture.targetTab &&
      shouldCompleteTabSwipe({
        distance: gesture.offset,
        velocity,
        width,
      })
        ? gesture.targetTab
        : null;

    tabListRef.current?.removeAttribute("data-tab-swipe-tracking");
    setSettling(true);
    event.currentTarget.setAttribute("data-tab-swipe-settling", "");
    requestAnimationFrame(() => {
      setSurfaceOffset(
        destination
          ? Math.sign(gesture.offset) * Math.max(1, width + gesture.gap)
          : 0,
      );
      updateIndicator(destination, destination ? 1 : 0, false);
      if (destination) {
        revealTab(
          destination,
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        );
      }
      finishSettle(destination);
    });
  };

  const dataState = stateAttribute
    ? ({ [stateAttribute]: renderedTab } as Record<string, string>)
    : {};
  const previousTab = getAdjacentTab(tabs, renderedTab, -1);
  const nextTab = getAdjacentTab(tabs, renderedTab, 1);

  return (
    <div
      ref={surfaceRef}
      id={id}
      className={`swipeable-tab-panel${className ? ` ${className}` : ""}`}
      role="tabpanel"
      aria-labelledby={labelledBy}
      tabIndex={0}
      data-sidebar-swipe-ignore
      data-learning-swipe-ignore
      {...dataState}
      onPointerDown={startSwipe}
      onPointerMove={moveSwipe}
      onPointerUp={endSwipe}
      onPointerCancel={(event) => endSwipe(event, true)}
      onClickCapture={(event) => {
        if (!consumedSwipeRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        window.setTimeout(() => {
          consumedSwipeRef.current = false;
        }, 0);
      }}
    >
      <div className="swipeable-tab-panel__layer is-current flow-root">
        {children(renderedTab, false)}
      </div>
      {previewsReady && previousTab && (
        <div
          className="swipeable-tab-panel__layer is-preview is-previous flow-root"
          data-swipe-panel-tab={previousTab}
          aria-hidden="true"
          inert
        >
          <Suspense fallback={null}>{children(previousTab, true)}</Suspense>
        </div>
      )}
      {previewsReady && nextTab && (
        <div
          className="swipeable-tab-panel__layer is-preview is-next flow-root"
          data-swipe-panel-tab={nextTab}
          aria-hidden="true"
          inert
        >
          <Suspense fallback={null}>{children(nextTab, true)}</Suspense>
        </div>
      )}
    </div>
  );
}
