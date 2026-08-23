import { ArrowUp } from "@phosphor-icons/react/ArrowUp";
import { ArrowsInLineVertical } from "@phosphor-icons/react/ArrowsInLineVertical";
import { ArrowsOutLineVertical } from "@phosphor-icons/react/ArrowsOutLineVertical";
import { CaretDown } from "@phosphor-icons/react/CaretDown";
import { Check } from "@phosphor-icons/react/Check";
import { Circle } from "@phosphor-icons/react/Circle";
import { CrosshairSimple } from "@phosphor-icons/react/CrosshairSimple";
import { Eye } from "@phosphor-icons/react/Eye";
import { ListMagnifyingGlass } from "@phosphor-icons/react/ListMagnifyingGlass";
import { Play } from "@phosphor-icons/react/Play";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { ExpandableSearch } from "../ExpandableSearch";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../components/ui/context-menu";
import { lessonsById, sections } from "./courseContent";
import {
  isStoredBoolean,
  isStoredString,
  useSessionStorageState,
} from "./useSessionStorageState";

type CurriculumScrollDirection = "up" | "down";
type CurriculumScrollMode = "idle" | "edge" | "hold";

const LESSON_PROGRESS_COMPLETE_THRESHOLD = 99.5;

const SCROLL_CONTROL_IDLE_DELAY_MS = 2400;
const SCROLL_CONTROL_HOLD_DELAY_MS = 360;
const SCROLL_CONTROL_HOLD_BASE_SPEED = 112;
const SCROLL_CONTROL_HOLD_MAX_SPEED = 1440;
const SCROLL_CONTROL_HOLD_MAX_POINTER_DISTANCE = 260;
const SCROLL_EDGE_THRESHOLD = 0.5;

export const getCurriculumHoldScrollSpeed = (pointerDistance: number) => {
  const normalizedDistance = Math.min(
    1,
    Math.max(0, pointerDistance) / SCROLL_CONTROL_HOLD_MAX_POINTER_DISTANCE,
  );
  const easedDistance = Math.pow(normalizedDistance, 0.8);

  return (
    SCROLL_CONTROL_HOLD_BASE_SPEED +
    (SCROLL_CONTROL_HOLD_MAX_SPEED - SCROLL_CONTROL_HOLD_BASE_SPEED) *
      easedDistance
  );
};

export const getCurriculumScrollDirectionAtEdge = (
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  fallbackDirection: CurriculumScrollDirection,
) => {
  const maximumScrollTop = Math.max(0, scrollHeight - clientHeight);
  if (maximumScrollTop <= SCROLL_EDGE_THRESHOLD) return fallbackDirection;
  if (scrollTop <= SCROLL_EDGE_THRESHOLD) return "down";
  if (scrollTop >= maximumScrollTop - SCROLL_EDGE_THRESHOLD) return "up";
  return fallbackDirection;
};

interface CurriculumProps {
  selectedLesson: number;
  lessonProgress?: Readonly<Record<number, number>>;
  onSelectLesson: (lessonNumber: number) => void;
  onOpenCourseOverview: () => void;
  courseTitle: string;
  courseThumbnail: string;
  onClose?: () => void;
  focusRequest?: number;
  persistenceKey: string;
  scrollportId?: string;
  scrollportRef?: RefObject<HTMLElement | null>;
}

export function Curriculum({
  selectedLesson,
  lessonProgress = {},
  onSelectLesson,
  onOpenCourseOverview,
  courseTitle,
  courseThumbnail,
  onClose,
  focusRequest = 0,
  persistenceKey,
  scrollportId,
  scrollportRef,
}: CurriculumProps) {
  const [expanded, setExpanded] = useState<number[]>([1, 2]);
  const storageBase = `veolms-learning-${persistenceKey}-curriculum`;
  const [lessonSearch, setLessonSearch] = useSessionStorageState(
    `${storageBase}-search`,
    "",
    isStoredString,
  );
  const [searchOpen, setSearchOpen] = useSessionStorageState(
    `${storageBase}-search-open`,
    false,
    isStoredBoolean,
  );
  const [showScrollControl, setShowScrollControl] = useState(false);
  const [scrollControlDirection, setScrollControlDirection] =
    useState<CurriculumScrollDirection>("up");
  const [scrollControlMode, setScrollControlMode] =
    useState<CurriculumScrollMode>("idle");
  const activeLessonSearch = searchOpen ? lessonSearch : "";
  const lessonSearchInputId = `learning-curriculum-search-${useId().replaceAll(":", "")}`;
  const activeLessonRef = useRef<HTMLButtonElement>(null);
  const currentSectionRef = useRef<HTMLElement>(null);
  const lessonListRef = useRef<HTMLDivElement>(null);
  const curriculumRef = useRef<HTMLElement>(null);
  const handledFocusRequestRef = useRef(0);
  const lastCurriculumScrollTopRef = useRef(0);
  const scrollControlDirectionRef = useRef<CurriculumScrollDirection>("up");
  const scrollControlIdleTimerRef = useRef<number | null>(null);
  const edgeScrollFrameRef = useRef<number | null>(null);
  const holdScrollFrameRef = useRef<number | null>(null);
  const holdDelayTimerRef = useRef<number | null>(null);
  const holdPointerIdRef = useRef<number | null>(null);
  const holdPointerCenterYRef = useRef<number | null>(null);
  const holdPointerDistanceRef = useRef(0);
  const suppressScrollControlClickRef = useRef(false);
  const pointerDownStoppedEdgeRef = useRef(false);
  const preserveScrollDirectionRef = useRef(false);
  const currentSection =
    sections.find((section) =>
      section.lessons.some(([number]) => number === selectedLesson),
    ) || sections[0]!;
  const currentLesson = lessonsById.get(selectedLesson) || lessonsById.get(1)!;
  const courseProgress = 52;
  const sectionIds = sections.map(({ id }) => id);
  const expandedSectionCount = sectionIds.reduce(
    (count, id) => count + (expanded.includes(id) ? 1 : 0),
    0,
  );
  const allSectionsExpanded = expandedSectionCount === sectionIds.length;
  const allSectionsCollapsed = expandedSectionCount === 0;

  const getLessonProgress = (number: number, status: string) => {
    const storedProgress = lessonProgress[number];
    if (typeof storedProgress === "number")
      return Math.max(0, Math.min(100, storedProgress));
    if (status === "done") return 100;
    if (status === "active") return 52;
    return 0;
  };

  const setCurriculumScrollport = useCallback(
    (node: HTMLElement | null) => {
      curriculumRef.current = node;
      if (scrollportRef) scrollportRef.current = node;
    },
    [scrollportRef],
  );

  const clearScrollControlIdleTimer = useCallback(() => {
    if (scrollControlIdleTimerRef.current === null) return;
    window.clearTimeout(scrollControlIdleTimerRef.current);
    scrollControlIdleTimerRef.current = null;
  }, []);

  const scheduleScrollControlHide = useCallback(() => {
    clearScrollControlIdleTimer();
    scrollControlIdleTimerRef.current = window.setTimeout(() => {
      scrollControlIdleTimerRef.current = null;
      if (
        edgeScrollFrameRef.current !== null ||
        holdScrollFrameRef.current !== null
      ) {
        return;
      }
      setShowScrollControl(false);
    }, SCROLL_CONTROL_IDLE_DELAY_MS);
  }, [clearScrollControlIdleTimer]);

  const clearHoldDelay = useCallback(() => {
    if (holdDelayTimerRef.current === null) return;
    window.clearTimeout(holdDelayTimerRef.current);
    holdDelayTimerRef.current = null;
  }, []);

  const cancelEdgeScroll = useCallback(
    (hideAfterIdle = true) => {
      if (edgeScrollFrameRef.current === null) return false;
      window.cancelAnimationFrame(edgeScrollFrameRef.current);
      edgeScrollFrameRef.current = null;
      setScrollControlMode("idle");
      if (hideAfterIdle) scheduleScrollControlHide();
      return true;
    },
    [scheduleScrollControlHide],
  );

  const cancelHoldScroll = useCallback(
    (hideAfterIdle = true) => {
      if (holdScrollFrameRef.current === null) return false;
      window.cancelAnimationFrame(holdScrollFrameRef.current);
      holdScrollFrameRef.current = null;
      setScrollControlMode("idle");
      if (hideAfterIdle) scheduleScrollControlHide();
      return true;
    },
    [scheduleScrollControlHide],
  );

  const cancelAutomatedScroll = useCallback(() => {
    clearHoldDelay();
    const stoppedEdge = cancelEdgeScroll(false);
    const stoppedHold = cancelHoldScroll(false);
    if (stoppedEdge || stoppedHold) scheduleScrollControlHide();
    return stoppedEdge || stoppedHold;
  }, [
    cancelEdgeScroll,
    cancelHoldScroll,
    clearHoldDelay,
    scheduleScrollControlHide,
  ]);

  const revealScrollControl = useCallback(
    (direction: CurriculumScrollDirection) => {
      scrollControlDirectionRef.current = direction;
      setScrollControlDirection(direction);
      setShowScrollControl(true);
      if (
        edgeScrollFrameRef.current === null &&
        holdScrollFrameRef.current === null
      ) {
        scheduleScrollControlHide();
      }
    },
    [scheduleScrollControlHide],
  );

  const syncScrollControlDirectionAtEdge = useCallback(
    (fallbackDirection: CurriculumScrollDirection) => {
      const curriculum = curriculumRef.current;
      if (!curriculum) return fallbackDirection;

      const nextDirection = getCurriculumScrollDirectionAtEdge(
        curriculum.scrollTop,
        curriculum.scrollHeight,
        curriculum.clientHeight,
        fallbackDirection,
      );
      scrollControlDirectionRef.current = nextDirection;
      setScrollControlDirection(nextDirection);
      return nextDirection;
    },
    [],
  );

  useEffect(() => {
    const curriculum = curriculumRef.current;
    if (!curriculum) return undefined;

    lastCurriculumScrollTopRef.current = curriculum.scrollTop;
    const updateScrollControl = () => {
      const nextScrollTop = curriculum.scrollTop;
      const delta = nextScrollTop - lastCurriculumScrollTopRef.current;
      lastCurriculumScrollTopRef.current = nextScrollTop;
      const fallbackDirection = delta > 0 ? "down" : "up";
      const edgeDirection = getCurriculumScrollDirectionAtEdge(
        nextScrollTop,
        curriculum.scrollHeight,
        curriculum.clientHeight,
        fallbackDirection,
      );
      const isAtEdge = edgeDirection !== fallbackDirection;

      if (isAtEdge) {
        scrollControlDirectionRef.current = edgeDirection;
        setScrollControlDirection(edgeDirection);
      }
      if (Math.abs(delta) < 0.5) return;
      if (
        edgeScrollFrameRef.current !== null ||
        holdScrollFrameRef.current !== null ||
        preserveScrollDirectionRef.current
      ) {
        return;
      }
      revealScrollControl(edgeDirection);
    };
    const interruptAutomatedScroll = () => {
      preserveScrollDirectionRef.current = false;
      cancelAutomatedScroll();
    };
    const beginScrollbarScroll = (event: PointerEvent) => {
      if (event.target === curriculum) {
        preserveScrollDirectionRef.current = false;
      }
    };
    const interruptFromKeyboard = (event: KeyboardEvent) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
        ].includes(event.key)
      ) {
        preserveScrollDirectionRef.current = false;
        cancelAutomatedScroll();
      }
    };

    curriculum.addEventListener("scroll", updateScrollControl, {
      passive: true,
    });
    curriculum.addEventListener("wheel", interruptAutomatedScroll, {
      passive: true,
    });
    curriculum.addEventListener("touchmove", interruptAutomatedScroll, {
      passive: true,
    });
    curriculum.addEventListener("pointerdown", beginScrollbarScroll);
    curriculum.addEventListener("keydown", interruptFromKeyboard);
    return () => {
      curriculum.removeEventListener("scroll", updateScrollControl);
      curriculum.removeEventListener("wheel", interruptAutomatedScroll);
      curriculum.removeEventListener("touchmove", interruptAutomatedScroll);
      curriculum.removeEventListener("pointerdown", beginScrollbarScroll);
      curriculum.removeEventListener("keydown", interruptFromKeyboard);
    };
  }, [cancelAutomatedScroll, revealScrollControl, scrollportId]);

  useEffect(
    () => () => {
      clearScrollControlIdleTimer();
      clearHoldDelay();
      if (edgeScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(edgeScrollFrameRef.current);
      }
      if (holdScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(holdScrollFrameRef.current);
      }
    },
    [clearHoldDelay, clearScrollControlIdleTimer],
  );

  const scrollCurriculumToEdge = useCallback(
    (direction: CurriculumScrollDirection) => {
      const curriculum = curriculumRef.current;
      if (!curriculum) return;

      cancelEdgeScroll(false);
      cancelHoldScroll(false);
      clearScrollControlIdleTimer();
      preserveScrollDirectionRef.current = true;
      const target =
        direction === "down"
          ? Math.max(0, curriculum.scrollHeight - curriculum.clientHeight)
          : 0;
      const start = curriculum.scrollTop;
      const distance = target - start;
      if (Math.abs(distance) < 1) {
        syncScrollControlDirectionAtEdge(direction);
        scheduleScrollControlHide();
        return;
      }

      setShowScrollControl(true);
      setScrollControlMode("edge");
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        curriculum.scrollTop = target;
        syncScrollControlDirectionAtEdge(direction);
        setScrollControlMode("idle");
        scheduleScrollControlHide();
        return;
      }

      const duration = Math.min(
        850,
        Math.max(340, 300 + Math.abs(distance) * 0.28),
      );
      let startedAt: number | null = null;
      const advance = (timestamp: number) => {
        if (startedAt === null) startedAt = timestamp;
        const progress = Math.min(1, (timestamp - startedAt) / duration);
        const easedProgress = 1 - Math.pow(1 - progress, 4);
        curriculum.scrollTop = start + distance * easedProgress;

        if (progress < 1) {
          edgeScrollFrameRef.current = window.requestAnimationFrame(advance);
          return;
        }

        curriculum.scrollTop = target;
        edgeScrollFrameRef.current = null;
        syncScrollControlDirectionAtEdge(direction);
        setScrollControlMode("idle");
        scheduleScrollControlHide();
      };

      edgeScrollFrameRef.current = window.requestAnimationFrame(advance);
    },
    [
      cancelEdgeScroll,
      cancelHoldScroll,
      clearScrollControlIdleTimer,
      scheduleScrollControlHide,
      syncScrollControlDirectionAtEdge,
    ],
  );

  const startHeldCurriculumScroll = useCallback(() => {
    const curriculum = curriculumRef.current;
    if (!curriculum) return;

    clearHoldDelay();
    cancelEdgeScroll(false);
    cancelHoldScroll(false);
    clearScrollControlIdleTimer();
    preserveScrollDirectionRef.current = true;
    suppressScrollControlClickRef.current = true;
    setShowScrollControl(true);
    setScrollControlMode("hold");

    const direction = syncScrollControlDirectionAtEdge(
      scrollControlDirectionRef.current,
    );
    const directionMultiplier = direction === "down" ? 1 : -1;
    let previousTimestamp = performance.now();
    const advance = (timestamp: number) => {
      const frameSeconds = Math.min(
        0.05,
        (timestamp - previousTimestamp) / 1000,
      );
      previousTimestamp = timestamp;
      const maximumScrollTop = Math.max(
        0,
        curriculum.scrollHeight - curriculum.clientHeight,
      );
      const requestedScrollTop =
        curriculum.scrollTop +
        directionMultiplier *
          getCurriculumHoldScrollSpeed(holdPointerDistanceRef.current) *
          frameSeconds;
      const nextScrollTop = Math.min(
        maximumScrollTop,
        Math.max(0, requestedScrollTop),
      );
      curriculum.scrollTop = nextScrollTop;

      const reachedEdge =
        direction === "down"
          ? nextScrollTop >= maximumScrollTop - 0.5
          : nextScrollTop <= 0.5;
      if (reachedEdge) {
        holdScrollFrameRef.current = null;
        syncScrollControlDirectionAtEdge(direction);
        setScrollControlMode("idle");
        scheduleScrollControlHide();
        return;
      }

      holdScrollFrameRef.current = window.requestAnimationFrame(advance);
    };

    holdScrollFrameRef.current = window.requestAnimationFrame(advance);
  }, [
    cancelEdgeScroll,
    cancelHoldScroll,
    clearHoldDelay,
    clearScrollControlIdleTimer,
    scheduleScrollControlHide,
    syncScrollControlDirectionAtEdge,
  ]);

  const handleScrollControlClick = () => {
    if (suppressScrollControlClickRef.current) {
      suppressScrollControlClickRef.current = false;
      pointerDownStoppedEdgeRef.current = false;
      return;
    }
    if (pointerDownStoppedEdgeRef.current) {
      pointerDownStoppedEdgeRef.current = false;
      scheduleScrollControlHide();
      return;
    }
    if (cancelAutomatedScroll()) return;
    scrollCurriculumToEdge(scrollControlDirectionRef.current);
  };

  const handleScrollControlPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) return;
    clearHoldDelay();
    pointerDownStoppedEdgeRef.current = cancelEdgeScroll(false);
    holdPointerIdRef.current = event.pointerId;
    holdPointerCenterYRef.current =
      event.currentTarget.getBoundingClientRect().top +
      event.currentTarget.getBoundingClientRect().height / 2;
    holdPointerDistanceRef.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
    holdDelayTimerRef.current = window.setTimeout(
      startHeldCurriculumScroll,
      SCROLL_CONTROL_HOLD_DELAY_MS,
    );
  };

  const handleScrollControlPointerMove = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (holdPointerIdRef.current !== event.pointerId) return;
    const pointerCenterY = holdPointerCenterYRef.current;
    if (pointerCenterY === null) return;

    const directionMultiplier =
      scrollControlDirectionRef.current === "down" ? 1 : -1;
    holdPointerDistanceRef.current = Math.max(
      0,
      (event.clientY - pointerCenterY) * directionMultiplier,
    );
  };

  const finishScrollControlPointer = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (holdPointerIdRef.current !== event.pointerId) return;
    holdPointerIdRef.current = null;
    holdPointerCenterYRef.current = null;
    holdPointerDistanceRef.current = 0;
    clearHoldDelay();
    if (cancelHoldScroll()) suppressScrollControlClickRef.current = true;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cancelScrollControlPointer = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    finishScrollControlPointer(event);
    pointerDownStoppedEdgeRef.current = false;
    suppressScrollControlClickRef.current = false;
  };

  const scrollItemToTop = (element: HTMLElement | null) => {
    const curriculum = element?.closest<HTMLElement>(".learning-curriculum");
    if (!element || !curriculum) return;

    const itemTop =
      element.getBoundingClientRect().top -
      curriculum.getBoundingClientRect().top +
      curriculum.scrollTop;

    curriculum.scrollTo({
      top: itemTop,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  const revealAndScrollTo = (
    target: "section" | "chapter",
    sectionId: number,
  ) => {
    setSearchOpen(false);
    setExpanded((current) =>
      current.includes(sectionId) ? current : [...current, sectionId],
    );

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const targetElement =
          target === "section"
            ? currentSectionRef.current
            : activeLessonRef.current;
        const curriculum = targetElement?.closest<HTMLElement>(
          ".learning-curriculum",
        );
        const lessonList = lessonListRef.current;
        if (!targetElement || !curriculum || !lessonList) return;

        const targetTop =
          targetElement.getBoundingClientRect().top -
          curriculum.getBoundingClientRect().top +
          curriculum.scrollTop;
        const currentRevealSpace = Number.parseFloat(
          lessonList.dataset.revealSpace || "0",
        );
        const maximumScrollWithoutRevealSpace = Math.max(
          0,
          curriculum.scrollHeight -
            currentRevealSpace -
            curriculum.clientHeight,
        );
        const nextRevealSpace = Math.ceil(
          Math.max(0, targetTop - maximumScrollWithoutRevealSpace) + 4,
        );

        if (nextRevealSpace !== currentRevealSpace) {
          lessonList.dataset.revealSpace = String(nextRevealSpace);
          lessonList.style.setProperty(
            "--curriculum-reveal-space",
            `${nextRevealSpace}px`,
          );
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => scrollItemToTop(targetElement));
          });
          return;
        }

        scrollItemToTop(targetElement);
      });
    });
  };

  const openLessonSearch = useCallback(() => {
    const curriculum = curriculumRef.current;
    if (curriculum) {
      cancelAutomatedScroll();
      lastCurriculumScrollTopRef.current = 0;
      curriculum.scrollTop = 0;
    }
    setSearchOpen(true);
  }, [cancelAutomatedScroll, setSearchOpen]);

  const handleLessonSearchOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        openLessonSearch();
        return;
      }
      setSearchOpen(false);
    },
    [openLessonSearch, setSearchOpen],
  );

  useEffect(() => {
    const lessonList = lessonListRef.current;
    if (!lessonList) return;
    lessonList.dataset.revealSpace = "0";
    lessonList.style.setProperty("--curriculum-reveal-space", "0px");
  }, [selectedLesson]);

  const toggleSection = (id: number) => {
    setExpanded((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  useEffect(() => {
    if (!focusRequest || focusRequest === handledFocusRequestRef.current)
      return undefined;

    handledFocusRequestRef.current = focusRequest;
    setExpanded((current) =>
      current.includes(currentSection.id)
        ? current
        : [...current, currentSection.id],
    );

    let firstFrame: number;
    let secondFrame: number | undefined;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        scrollItemToTop(activeLessonRef.current);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [focusRequest, currentSection.id]);

  return (
    <ContextMenu>
      <aside
        ref={setCurriculumScrollport}
        id={scrollportId}
        className="learning-curriculum"
        aria-label="Course curriculum"
      >
        <div
          className={`learning-curriculum__scroll-top-anchor${showScrollControl ? " is-visible" : ""}`}
          data-direction={scrollControlDirection}
          aria-hidden={!showScrollControl}
        >
          <button
            type="button"
            data-fixed-radius
            className={`learning-curriculum__scroll-top${scrollControlMode !== "idle" ? " is-scrolling" : ""}`}
            data-direction={scrollControlDirection}
            data-scroll-mode={scrollControlMode}
            aria-label={
              scrollControlMode !== "idle"
                ? "Stop curriculum scrolling"
                : scrollControlDirection === "down"
                  ? "Scroll curriculum to bottom"
                  : "Scroll curriculum to top"
            }
            title={
              scrollControlMode !== "idle"
                ? "Stop scrolling"
                : scrollControlDirection === "down"
                  ? "Scroll to bottom — hold and move down to accelerate"
                  : "Scroll to top — hold and move up to accelerate"
            }
            tabIndex={showScrollControl ? 0 : -1}
            onClick={handleScrollControlClick}
            onPointerDown={handleScrollControlPointerDown}
            onPointerMove={handleScrollControlPointerMove}
            onPointerUp={finishScrollControlPointer}
            onPointerCancel={cancelScrollControlPointer}
          >
            <ArrowUp
              className="learning-curriculum__scroll-top-icon"
              size={20}
              weight="bold"
              aria-hidden="true"
            />
          </button>
        </div>
        <ContextMenuTrigger
          render={<div className="learning-curriculum__hero" />}
        >
          <img
            src={courseThumbnail}
            alt=""
            className="learning-curriculum__cover"
          />
          <div className="learning-curriculum__shade" aria-hidden="true" />
          <button
            type="button"
            className="learning-curriculum__overview-link"
            aria-label={
              searchOpen
                ? "Close lesson search"
                : `View course overview for ${courseTitle}`
            }
            title={searchOpen ? "Close search" : "View"}
            onClick={() => {
              if (searchOpen) {
                setSearchOpen(false);
                return;
              }
              onOpenCourseOverview();
            }}
          />
          <header className="learning-curriculum__overview">
            <div className="learning-curriculum__overview-content">
              <div className="learning-curriculum__title-row [container-type:inline-size]">
                <ExpandableSearch
                  inputId={lessonSearchInputId}
                  label="Search lessons"
                  placeholder="Search lessons..."
                  value={lessonSearch}
                  onValueChange={setLessonSearch}
                  open={searchOpen}
                  onOpenChange={handleLessonSearchOpenChange}
                  overlay
                  shortcutPriority
                  backLabel="Back from lesson search"
                  triggerClassName="learning-curriculum__search-trigger rounded-full"
                  triggerIconSize={21.375}
                  backButtonClassName="learning-curriculum__search-trigger rounded-full"
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[clamp(1rem,4.25cqi,1.1875rem)]">
                      {courseTitle}
                    </h2>
                  </div>
                </ExpandableSearch>
              </div>
            </div>
          </header>

          <div className="learning-curriculum__sticky-meta">
            <div className="learning-curriculum__progress-copy">
              <span>Progress</span>
              <strong>{courseProgress}%</strong>
            </div>
            <div
              className="learning-curriculum__progress-track"
              role="progressbar"
              aria-label={`Course progress: ${courseProgress} percent`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={courseProgress}
            >
              <span style={{ width: `${courseProgress}%` }} />
            </div>
            <div
              className="learning-curriculum__current"
              aria-label="Current lesson location"
            >
              <button
                type="button"
                className="learning-curriculum__current-action"
                aria-label={`Go to current section, Section ${currentSection.id}: ${currentSection.title}`}
                title={`Go to Section ${currentSection.id}: ${currentSection.title}`}
                onClick={() => {
                  if (searchOpen) {
                    setSearchOpen(false);
                    return;
                  }
                  revealAndScrollTo("section", currentSection.id);
                }}
              >
                <span
                  className="learning-curriculum__current-key"
                  aria-hidden="true"
                >
                  S{currentSection.id}:
                </span>
                <span className="learning-curriculum__current-label">
                  {currentSection.title}
                </span>
              </button>
              <button
                type="button"
                className="learning-curriculum__current-action"
                aria-label={`Go to current chapter, Chapter ${selectedLesson}: ${currentLesson[1]}`}
                title={`Go to Chapter ${selectedLesson}: ${currentLesson[1]}`}
                onClick={() => {
                  if (searchOpen) {
                    setSearchOpen(false);
                    return;
                  }
                  revealAndScrollTo("chapter", currentSection.id);
                }}
              >
                <span
                  className="learning-curriculum__current-key"
                  aria-hidden="true"
                >
                  L{selectedLesson}:
                </span>
                <span className="learning-curriculum__current-label">
                  {currentLesson[1]}
                </span>
              </button>
            </div>
          </div>
        </ContextMenuTrigger>

        <div ref={lessonListRef} className="learning-curriculum__lesson-list">
          {sections.map((section) => {
            const matchingLessons = section.lessons.filter((lesson) =>
              lesson[1]
                .toLowerCase()
                .includes(activeLessonSearch.toLowerCase()),
            );
            const isOpen =
              expanded.includes(section.id) ||
              Boolean(activeLessonSearch && matchingLessons.length > 0);
            if (
              activeLessonSearch &&
              !section.title
                .toLowerCase()
                .includes(activeLessonSearch.toLowerCase()) &&
              matchingLessons.length === 0
            )
              return null;
            return (
              <section
                key={section.id}
                ref={
                  section.id === currentSection.id
                    ? currentSectionRef
                    : undefined
                }
                className="learning-curriculum__section"
              >
                <button
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={isOpen}
                  className="learning-curriculum__section-toggle"
                >
                  <span
                    className={`learning-curriculum__section-arrow${isOpen ? " is-open" : ""}`}
                    aria-hidden="true"
                  >
                    <CaretDown size={17} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    Section {section.id}: {section.title}
                  </span>
                  <span className="learning-curriculum__section-progress">
                    {section.progress}
                  </span>
                </button>
                {matchingLessons.length > 0 && (
                  <div
                    className={`learning-curriculum__section-lessons ${isOpen ? "is-open" : ""}`}
                    aria-hidden={!isOpen ? true : undefined}
                    inert={!isOpen ? true : undefined}
                  >
                    <div className="learning-curriculum__section-lessons-inner">
                      {matchingLessons.map(
                        ([number, title, duration, status]) => {
                          const active = selectedLesson === number;
                          const progress = getLessonProgress(number, status);
                          const completed =
                            status === "done" ||
                            progress >= LESSON_PROGRESS_COMPLETE_THRESHOLD;
                          const showProgress = active || progress > 0;
                          return (
                            <button
                              type="button"
                              key={number}
                              ref={active ? activeLessonRef : undefined}
                              onClick={() => {
                                onSelectLesson(number);
                                onClose?.();
                              }}
                              className={`learning-curriculum__lesson ${active ? "is-active" : ""}`}
                            >
                              {completed ? (
                                <span
                                  className="learning-curriculum__lesson-status"
                                  aria-label="Completed"
                                >
                                  <Check size={12} weight="bold" />
                                </span>
                              ) : showProgress ? (
                                <span
                                  className="learning-curriculum__lesson-progress"
                                  role="progressbar"
                                  aria-label={`Lecture ${number} progress`}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-valuenow={Math.round(progress)}
                                  aria-valuetext={`${Math.round(progress)}% watched`}
                                >
                                  <svg viewBox="0 0 20 20" aria-hidden="true">
                                    <circle
                                      className="learning-curriculum__lesson-progress-track"
                                      cx="10"
                                      cy="10"
                                      r="8"
                                    />
                                    <circle
                                      className="learning-curriculum__lesson-progress-value"
                                      cx="10"
                                      cy="10"
                                      r="8"
                                      pathLength="100"
                                      strokeDasharray="100"
                                      strokeDashoffset={100 - progress}
                                    />
                                  </svg>
                                </span>
                              ) : (
                                <Circle
                                  size={20}
                                  className="learning-curriculum__lesson-status learning-curriculum__lesson-status--todo"
                                />
                              )}
                              <span className="learning-curriculum__lesson-number">
                                {number}.
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                {title}
                              </span>
                              <span className="learning-curriculum__lesson-duration">
                                {duration}
                              </span>
                            </button>
                          );
                        },
                      )}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </aside>

      <ContextMenuContent aria-label="Course curriculum actions">
        <ContextMenuGroup>
          <ContextMenuLabel>Curriculum actions</ContextMenuLabel>
          {!allSectionsExpanded && (
            <ContextMenuItem onClick={() => setExpanded(sectionIds)}>
              <ArrowsOutLineVertical aria-hidden="true" />
              Expand all sections
            </ContextMenuItem>
          )}
          {!allSectionsCollapsed && (
            <ContextMenuItem onClick={() => setExpanded([])}>
              <ArrowsInLineVertical aria-hidden="true" />
              Collapse all sections
            </ContextMenuItem>
          )}
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem
            onClick={() => revealAndScrollTo("section", currentSection.id)}
          >
            <CrosshairSimple aria-hidden="true" />
            Go to current section
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => revealAndScrollTo("chapter", currentSection.id)}
          >
            <Play aria-hidden="true" />
            Go to current lecture
          </ContextMenuItem>
          <ContextMenuItem onClick={openLessonSearch}>
            <ListMagnifyingGlass aria-hidden="true" />
            Search lectures
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem onClick={onOpenCourseOverview}>
            <Eye aria-hidden />
            View course overview
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}
