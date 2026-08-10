import { ArrowLeft } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { VideoPlayer as YouTubeVideoPlayer } from "../VideoPlayer";
import { getInitialAcademyTheme, persistAcademyTheme } from "../themes";
import { courseVideos, lessonsById, lessonVideoMap } from "./courseContent";
import { Curriculum } from "./Curriculum";
import { getCourseThumbnail, getCourseTitle } from "./courseMetadata";
import { Discussion } from "./Discussion";

const CURRICULUM_COLLAPSE_DRAG_DISTANCE = 80;
const CURRICULUM_EXPAND_DRAG_DISTANCE = 10;
const CURRICULUM_MIN_WIDTH = 300;

interface LearningWorkspaceProps {
  courseSlug: string | undefined;
  onNavigateCourses: () => void;
}

interface CurriculumResize {
  pointerId: number;
  startX: number;
  startWidth: number;
  collapsedAtStart: boolean;
  collapsedDuringDrag: boolean;
  collapsedAtX: number | null;
  expandedFromRail: boolean;
  expandedAtX: number | null;
  width: number;
  handle: HTMLDivElement;
}

interface CurriculumPointerEvent {
  pointerId: number;
  clientX: number;
}

type LearningWorkspaceStyle = CSSProperties & {
  "--learning-curriculum-width": string;
};

export function LearningWorkspace({
  courseSlug,
  onNavigateCourses,
}: LearningWorkspaceProps) {
  const [theme] = useState(
    () => localStorage.getItem("veolms-theme") || "dark",
  );
  const [academyTheme] = useState(getInitialAcademyTheme);
  const [selectedLesson, setSelectedLesson] = useState(() => {
    const savedLesson = Number(localStorage.getItem("veolms-last-lesson"));
    return lessonsById.has(savedLesson) ? savedLesson : 1;
  });
  const courseTitle = getCourseTitle(courseSlug);
  const [lessonDrawer, setLessonDrawer] = useState(false);
  const [curriculumFocusRequest, setCurriculumFocusRequest] = useState(0);
  const [curriculumWidth, setCurriculumWidth] = useState(() => {
    const saved = Number(localStorage.getItem("veolms-curriculum-width"));
    return Number.isFinite(saved) ? Math.min(560, Math.max(300, saved)) : 400;
  });
  const [curriculumCollapsed, setCurriculumCollapsed] = useState(false);
  const [curriculumResizing, setCurriculumResizing] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const lessonTriggerRef = useRef<HTMLButtonElement>(null);
  const lessonDialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const curriculumResizeRef = useRef<CurriculumResize | null>(null);
  const curriculumResizeMoveRef = useRef<
    ((event: PointerEvent) => void) | null
  >(null);
  const curriculumResizeFinishRef = useRef<
    ((event: PointerEvent, cancelled?: boolean) => void) | null
  >(null);
  const currentLesson = lessonsById.get(selectedLesson) || lessonsById.get(9)!;
  const courseThumbnail = getCourseThumbnail(courseSlug);

  const toggleTheaterMode = () => {
    setLessonDrawer(false);
    setTheaterMode((current) => {
      const nextMode = !current;

      if (nextMode) {
        window.requestAnimationFrame(() => {
          window.scrollTo({
            top: 0,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "auto"
              : "smooth",
          });
        });
      }

      return nextMode;
    });
  };

  const openLessonDrawer = () => {
    if (!window.matchMedia("(max-width: 1080px)").matches) {
      setCurriculumCollapsed(false);
    }
    setCurriculumFocusRequest((request) => request + 1);
    if (!window.matchMedia("(max-width: 1080px)").matches) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setLessonDrawer(true);
  };

  const closeLessonDrawer = () => {
    setLessonDrawer(false);
    window.setTimeout(
      () => (previousFocusRef.current || lessonTriggerRef.current)?.focus?.(),
      0,
    );
  };

  const commitCurriculumWidth = (value: number) => {
    const nextWidth = Math.min(560, Math.max(300, value));
    setCurriculumWidth(nextWidth);
    localStorage.setItem(
      "veolms-curriculum-width",
      String(Math.round(nextWidth)),
    );
  };

  const startCurriculumResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.matchMedia("(max-width: 1080px)").matches) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    curriculumResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: curriculumWidth,
      collapsedAtStart: curriculumCollapsed,
      collapsedDuringDrag: false,
      collapsedAtX: null,
      expandedFromRail: false,
      expandedAtX: null,
      width: curriculumWidth,
      handle: event.currentTarget,
    };
    setCurriculumResizing(true);
  };

  const collapseCurriculumFromDrag = (
    resize: CurriculumResize,
    pointerX: number,
  ) => {
    // Keep the active resize session and pointer capture alive. The rail stays
    // interactive while collapsed so the same held gesture can move back left
    // and expand the curriculum again without a second pointer-down.
    resize.collapsedDuringDrag = true;
    resize.collapsedAtX = pointerX;
    resize.expandedFromRail = false;
    resize.expandedAtX = null;
    setCurriculumCollapsed(true);
  };

  const moveCurriculumResize = (event: CurriculumPointerEvent) => {
    const resize = curriculumResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    if (resize.collapsedDuringDrag && !resize.expandedFromRail) {
      const expandDelta = resize.collapsedAtX! - event.clientX;
      if (expandDelta < CURRICULUM_EXPAND_DRAG_DISTANCE) return;
      resize.collapsedDuringDrag = false;
      resize.expandedFromRail = true;
      resize.expandedAtX = event.clientX;
      resize.width = CURRICULUM_MIN_WIDTH;
      setCurriculumCollapsed(false);
      setCurriculumWidth(CURRICULUM_MIN_WIDTH);
      return;
    }

    if (resize.collapsedAtStart && !resize.expandedFromRail) {
      const expandDelta = resize.startX - event.clientX;
      if (expandDelta < CURRICULUM_EXPAND_DRAG_DISTANCE) return;
      resize.expandedFromRail = true;
      resize.expandedAtX = event.clientX;
      resize.width = CURRICULUM_MIN_WIDTH;
      setCurriculumCollapsed(false);
      setCurriculumWidth(CURRICULUM_MIN_WIDTH);
      return;
    }

    // The rail sits on the curriculum's left edge: dragging right narrows the
    // panel, while dragging left gives it more room.
    const dragStartX = resize.expandedFromRail
      ? resize.expandedAtX!
      : resize.startX;
    const widthDelta = dragStartX - event.clientX;
    const baseWidth = resize.expandedFromRail
      ? CURRICULUM_MIN_WIDTH
      : resize.startWidth;
    const widthPastMinimum = baseWidth + widthDelta - CURRICULUM_MIN_WIDTH;
    const forceClose = widthPastMinimum <= -CURRICULUM_COLLAPSE_DRAG_DISTANCE;
    if (forceClose) {
      collapseCurriculumFromDrag(resize, event.clientX);
      return;
    }

    resize.width = Math.min(
      560,
      Math.max(CURRICULUM_MIN_WIDTH, baseWidth + widthDelta),
    );
    setCurriculumWidth(resize.width);
  };

  const endCurriculumResize = (
    event: CurriculumPointerEvent,
    cancelled = false,
  ) => {
    const resize = curriculumResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const dragStartX = resize.expandedFromRail
      ? resize.expandedAtX!
      : resize.startX;
    const widthDelta = dragStartX - event.clientX;
    curriculumResizeRef.current = null;
    setCurriculumResizing(false);
    resize.handle?.releasePointerCapture?.(resize.pointerId);

    if (cancelled) {
      setCurriculumCollapsed(resize.collapsedAtStart);
      setCurriculumWidth(resize.startWidth);
      return;
    }
    if (resize.collapsedDuringDrag) {
      setCurriculumCollapsed(true);
      return;
    }
    if (resize.collapsedAtStart && !resize.expandedFromRail) {
      setCurriculumCollapsed(true);
      return;
    }
    const baseWidth = resize.expandedFromRail
      ? CURRICULUM_MIN_WIDTH
      : resize.startWidth;
    const widthPastMinimum = baseWidth + widthDelta - CURRICULUM_MIN_WIDTH;
    if (widthPastMinimum <= -CURRICULUM_COLLAPSE_DRAG_DISTANCE) {
      setCurriculumCollapsed(true);
      return;
    }
    setCurriculumCollapsed(false);
    commitCurriculumWidth(resize.width);
  };

  curriculumResizeMoveRef.current = moveCurriculumResize;
  curriculumResizeFinishRef.current = endCurriculumResize;

  useEffect(() => {
    if (!curriculumResizing) return undefined;
    const continueResize = (event: PointerEvent) =>
      curriculumResizeMoveRef.current?.(event);
    const finishResize = (event: PointerEvent) =>
      curriculumResizeFinishRef.current?.(event);
    const cancelResize = (event: PointerEvent) =>
      curriculumResizeFinishRef.current?.(event, true);
    window.addEventListener("pointermove", continueResize);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", cancelResize);
    return () => {
      window.removeEventListener("pointermove", continueResize);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", cancelResize);
    };
  }, [curriculumResizing]);

  const handleCurriculumResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      if (curriculumCollapsed && event.key === "ArrowLeft") {
        setCurriculumCollapsed(false);
        commitCurriculumWidth(400);
        return;
      }
      if (!curriculumCollapsed) {
        const direction = event.key === "ArrowRight" ? -16 : 16;
        commitCurriculumWidth(curriculumWidth + direction);
      }
    } else if (event.key === "Home") {
      event.preventDefault();
      setCurriculumCollapsed(true);
    } else if (event.key === "End") {
      event.preventDefault();
      setCurriculumCollapsed(false);
      commitCurriculumWidth(560);
    }
  };

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.dataset.theme =
        theme === "device" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.appearance = theme;
    };
    applyTheme();
    if (theme !== "device") return undefined;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.palette = academyTheme;
    persistAcademyTheme(academyTheme);
  }, [academyTheme]);

  useEffect(() => {
    localStorage.setItem("veolms-last-lesson", String(selectedLesson));
  }, [selectedLesson]);

  useEffect(() => {
    sessionStorage.removeItem("veolms-course-autostart");
    localStorage.removeItem("veolms-player-autoplay");
  }, []);

  useEffect(() => {
    document.body.style.overflow = lessonDrawer ? "hidden" : "";
    if (!lessonDrawer)
      return () => {
        document.body.style.overflow = "";
      };

    const dialog = lessonDialogRef.current;
    const focusableSelector =
      '.lesson-drawer-panel button:not([disabled]):not([tabindex="-1"]), .lesson-drawer-panel input:not([disabled]), .lesson-drawer-panel [tabindex]:not([tabindex="-1"])';
    const initialFocusFrame = window.requestAnimationFrame(() => {
      dialog
        ?.querySelector<HTMLElement>(focusableSelector)
        ?.focus({ preventScroll: true });
    });
    const onDrawerKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLessonDrawer();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(focusableSelector),
      ].filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onDrawerKeyDown);
    return () => {
      window.cancelAnimationFrame(initialFocusFrame);
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onDrawerKeyDown);
    };
  }, [lessonDrawer]);

  return (
    <div
      className={`learning-workspace ${theaterMode ? "is-theater" : ""} ${curriculumResizing ? "is-curriculum-resizing" : ""}`}
    >
      <main
        className="learning-workspace__main"
        inert={lessonDrawer ? true : undefined}
        aria-hidden={lessonDrawer || undefined}
        style={
          {
            "--learning-curriculum-width": `${curriculumCollapsed ? 8 : curriculumWidth}px`,
          } as LearningWorkspaceStyle
        }
      >
        <section className="learning-workspace__lesson-column">
          <div className="learning-workspace__player-wrap">
            <button
              type="button"
              className="learning-workspace__back"
              aria-label="Return to all courses"
              onClick={onNavigateCourses}
            >
              <ArrowLeft size={22} />
            </button>
            <YouTubeVideoPlayer
              media={lessonVideoMap[selectedLesson] || courseVideos[0]!}
              lessonTitle={currentLesson[1]}
              theaterMode={theaterMode}
              onTheaterToggle={toggleTheaterMode}
            />
          </div>

          <button
            ref={lessonTriggerRef}
            type="button"
            className="learning-workspace__lesson-heading"
            aria-label="Open course lessons"
            aria-expanded={lessonDrawer}
            onClick={openLessonDrawer}
          >
            <div className="min-w-0">
              <h1>{currentLesson[1]}</h1>
            </div>
          </button>
          <Discussion />
        </section>

        <div
          className={`learning-workspace__curriculum-column ${curriculumCollapsed ? "is-collapsed" : ""}`}
        >
          <div
            className="learning-curriculum__resize-rail"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize course curriculum"
            aria-valuemin={300}
            aria-valuemax={560}
            aria-valuenow={
              curriculumCollapsed ? undefined : Math.round(curriculumWidth)
            }
            aria-valuetext={
              curriculumCollapsed
                ? "Course curriculum collapsed"
                : `${Math.round(curriculumWidth)} pixels wide`
            }
            tabIndex={0}
            onKeyDown={handleCurriculumResizeKeyDown}
            onPointerDown={startCurriculumResize}
            onPointerMove={moveCurriculumResize}
            onPointerUp={endCurriculumResize}
            onPointerCancel={(event) => endCurriculumResize(event, true)}
          />
          <Curriculum
            selectedLesson={selectedLesson}
            setSelectedLesson={setSelectedLesson}
            courseTitle={courseTitle}
            courseThumbnail={courseThumbnail}
            focusRequest={curriculumFocusRequest}
          />
        </div>
      </main>

      {lessonDrawer && (
        <div
          ref={lessonDialogRef}
          className="lesson-drawer-shell"
          role="dialog"
          aria-modal="true"
          aria-label="Course lessons"
        >
          <button
            type="button"
            aria-label="Close lesson list"
            aria-hidden="true"
            tabIndex={-1}
            onClick={closeLessonDrawer}
            className="lesson-drawer-backdrop"
          />
          <div className="lesson-drawer-panel">
            <Curriculum
              selectedLesson={selectedLesson}
              setSelectedLesson={setSelectedLesson}
              courseTitle={courseTitle}
              courseThumbnail={courseThumbnail}
              focusRequest={curriculumFocusRequest}
              onClose={closeLessonDrawer}
            />
          </div>
        </div>
      )}
    </div>
  );
}
