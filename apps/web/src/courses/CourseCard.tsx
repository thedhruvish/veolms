import {
  Archive,
  ArrowCounterClockwise,
  Certificate,
  ChartBar,
  CopySimple,
  DotsThreeVertical,
  Eye,
  Flag,
  GraduationCap,
  Heart,
  LinkSimple,
  ListBullets,
  PaperPlaneTilt,
  PencilSimple,
  Play,
  Plus,
  ShareNetwork,
  Trash,
  UploadSimple,
  UsersThree,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useBackDismiss } from "../navigation/useBackDismiss";
import type { Course, CoursePricing, CourseRole } from "./catalogue";

const courseOverviewPath = (course: Course) =>
  `/courses/${encodeURIComponent(course.id)}/overview`;

const creatorStatusStyles = {
  published: "border-emerald-400/25 bg-emerald-500/15 text-emerald-300",
  draft: "border-amber-400/25 bg-amber-500/15 text-amber-300",
  archived: "border-violet-400/25 bg-violet-500/15 text-violet-300",
} as const;

const studentStatusStyles = {
  "not-enrolled": "border-fuchsia-400/30 bg-fuchsia-500/15 text-fuchsia-200",
  "not-started": "border-slate-400/20 bg-slate-500/20 text-slate-200",
  "in-progress": "border-sky-400/25 bg-sky-500/15 text-sky-300",
  completed: "border-emerald-400/25 bg-emerald-500/15 text-emerald-300",
} as const;

const courseMenuWidth = 238;
const courseMenuGap = 8;
type CourseMenuHorizontalPlacement = "right" | "left" | "aligned";
type CourseMenuVerticalPlacement = "below" | "above";

const getCourseMenuBoundary = (element: HTMLElement) => {
  const boundary = {
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    left: 0,
  };
  let ancestor = element.parentElement;

  while (ancestor) {
    const styles = window.getComputedStyle(ancestor);
    const clipsContent = /(auto|scroll|hidden|clip)/.test(
      `${styles.overflow} ${styles.overflowX} ${styles.overflowY}`,
    );

    if (clipsContent) {
      const bounds = ancestor.getBoundingClientRect();
      boundary.top = Math.max(boundary.top, bounds.top);
      boundary.right = Math.min(boundary.right, bounds.right);
      boundary.bottom = Math.min(boundary.bottom, bounds.bottom);
      boundary.left = Math.max(boundary.left, bounds.left);
    }

    ancestor = ancestor.parentElement;
  }

  return boundary;
};

const DEFAULT_NOT_ENROLLED_PRICING: CoursePricing = {
  price: "₹1,999",
  originalPrice: "₹2,999",
  discount: "33% off",
};

const getStudentStatus = (course: Course) => {
  if (!course.enrolled) return "not-enrolled" as const;
  const progress = course.progress ?? 0;
  if (progress >= 100) return "completed" as const;
  if (progress > 0) return "in-progress" as const;
  return "not-started" as const;
};

const getStudentStatusLabel = (course: Course) => {
  const status = getStudentStatus(course);
  if (status === "not-enrolled") return "Not Enrolled";
  if (status === "completed") return "Completed";
  if (status === "in-progress") return "In Progress";
  return "Not Started";
};

interface MenuActionProps {
  Icon?: Icon;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

function MenuAction({
  Icon,
  icon,
  label,
  onClick,
  destructive,
}: MenuActionProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[0.78rem] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] ${
        destructive
          ? "text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
          : "text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
      }`}
      onClick={onClick}
    >
      {icon ??
        (Icon ? <Icon size={17} weight="regular" aria-hidden="true" /> : null)}
      <span>{label}</span>
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 h-px bg-[var(--border)]" aria-hidden="true" />;
}

export interface CourseCardProps {
  course: Course;
  role: CourseRole;
  wishlisted: boolean;
  onWishlist: (courseId: string) => void;
  onOpen: (course: Course) => void;
  onExplore: (course: Course) => void;
  onEdit?: (course: Course) => void;
  onManage?: (course: Course) => void;
  onDeleteRequested?: (course: Course) => void;
  onNavigatePage: (destination: string) => void;
  menuOpen: boolean;
  setMenuOpen: (courseId: string | null) => void;
  setNotice: (notice: string) => void;
  imagePriority?: boolean;
}

export function CourseCard({
  course,
  role,
  wishlisted,
  onWishlist,
  onOpen,
  onExplore,
  onEdit,
  onManage,
  onDeleteRequested,
  onNavigatePage,
  menuOpen,
  setMenuOpen,
  setNotice,
  imagePriority = false,
}: CourseCardProps) {
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPointerInteractionRef = useRef(false);
  const [menuHorizontalPlacement, setMenuHorizontalPlacement] =
    useState<CourseMenuHorizontalPlacement>("right");
  const [menuVerticalPlacement, setMenuVerticalPlacement] =
    useState<CourseMenuVerticalPlacement>("below");
  const [menuPressPulse, setMenuPressPulse] = useState(0);
  const [menuKeyboardFocus, setMenuKeyboardFocus] = useState(false);
  const studentStatus = getStudentStatus(course);
  const progress = course.progress ?? 0;
  const overviewPath = courseOverviewPath(course);
  const absoluteCourseUrl =
    typeof window === "undefined"
      ? overviewPath
      : new URL(overviewPath, window.location.origin).toString();

  useBackDismiss({
    open: menuOpen,
    onDismiss: () => setMenuOpen(null),
  });

  const closeThen = (action: () => void) => {
    setMenuOpen(null);
    action();
  };

  useLayoutEffect(() => {
    if (!menuOpen || typeof window === "undefined") return;

    const updateMenuPlacement = () => {
      const button = menuButtonRef.current;
      const menu = menuRef.current;
      if (!button || !menu) return;

      const buttonBounds = button.getBoundingClientRect();
      const menuBounds = menu.getBoundingClientRect();
      const boundary = getCourseMenuBoundary(menu);
      const menuWidth = menu.offsetWidth || menuBounds.width || courseMenuWidth;
      const menuHeight = menu.offsetHeight || menuBounds.height;
      const roomOnRight = boundary.right - buttonBounds.right;
      const roomOnLeft = buttonBounds.left - boundary.left;
      const roomBelow = boundary.bottom - buttonBounds.bottom;
      const roomAbove = buttonBounds.top - boundary.top;

      setMenuHorizontalPlacement(
        roomOnRight >= menuWidth + courseMenuGap
          ? "right"
          : roomOnLeft >= menuWidth + courseMenuGap
            ? "left"
            : "aligned",
      );
      setMenuVerticalPlacement(
        roomBelow >= menuHeight + courseMenuGap
          ? "below"
          : roomAbove >= menuHeight + courseMenuGap || roomAbove > roomBelow
            ? "above"
            : "below",
      );
    };

    updateMenuPlacement();
    window.addEventListener("resize", updateMenuPlacement);
    window.addEventListener("scroll", updateMenuPlacement, true);

    return () => {
      window.removeEventListener("resize", updateMenuPlacement);
      window.removeEventListener("scroll", updateMenuPlacement, true);
    };
  }, [menuOpen, role]);

  const toggleCourseMenu = () => {
    if (menuOpen) {
      setMenuOpen(null);
      return;
    }

    const button = menuButtonRef.current;
    if (!button || typeof window === "undefined") {
      setMenuHorizontalPlacement("aligned");
      setMenuVerticalPlacement("below");
      setMenuOpen(course.id);
      return;
    }

    const buttonBounds = button.getBoundingClientRect();
    const hasRoomOnRight =
      window.innerWidth - buttonBounds.right >= courseMenuWidth + courseMenuGap;
    const hasRoomOnLeft = buttonBounds.left >= courseMenuWidth + courseMenuGap;

    setMenuHorizontalPlacement(
      hasRoomOnRight ? "right" : hasRoomOnLeft ? "left" : "aligned",
    );
    setMenuVerticalPlacement("below");
    setMenuOpen(course.id);
  };

  const copyCourseLink = async () => {
    try {
      await navigator.clipboard.writeText(absoluteCourseUrl);
      setNotice("Course link copied to your clipboard.");
    } catch {
      setNotice("Copying is unavailable on this device.");
    }
  };

  const shareCourse = async () => {
    if (typeof navigator.share !== "function") {
      await copyCourseLink();
      return;
    }
    try {
      await navigator.share({ title: course.title, url: absoluteCourseUrl });
    } catch {
      // Closing the operating-system share sheet is not an application error.
    }
  };

  const openThumbnail = () => {
    onOpen(course);
  };

  const thumbnailActionLabel =
    role === "creator"
      ? `Play ${course.title}`
      : course.enrolled
        ? `${progress > 0 && progress < 100 ? "Resume" : progress >= 100 ? "Review" : "Start"} ${course.title}`
        : `Play free preview for ${course.title}`;
  const thumbnailActionTooltip =
    role === "creator"
      ? "Play Course"
      : course.enrolled
        ? "Continue Learning"
        : "Play Free Preview";

  const lifecycleAction = () => {
    if (course.lifecycleStatus === "published") {
      setNotice(`${course.title} was unpublished.`);
      return;
    }
    if (course.lifecycleStatus === "draft") {
      setNotice(`${course.title} was published.`);
      return;
    }
    setNotice(`${course.title} was restored.`);
  };

  return (
    <article
      className="group relative min-w-0 overflow-visible rounded-xl border border-[var(--border)] bg-[var(--card-surface,var(--surface))] shadow-[var(--card-shadow)] transition-[background-color,box-shadow] duration-200 hover:bg-[var(--card-surface-hover,var(--hover))] hover:shadow-[var(--card-hover-shadow)]"
      aria-label={`${course.title}${role === "creator" ? `, ${course.lifecycleStatus}` : course.enrolled ? `, ${progress}% complete` : ", not enrolled"}`}
      data-course-card
    >
      <div
        className="relative aspect-video overflow-hidden rounded-t-[11px] bg-[var(--track)]"
        data-course-card-media
      >
        <img
          src={course.thumbnail}
          alt=""
          className="h-full w-full object-cover"
          width={960}
          height={540}
          loading={imagePriority ? "eager" : "lazy"}
          fetchPriority={imagePriority ? "high" : "low"}
          decoding={imagePriority ? "sync" : "async"}
        />

        <button
          type="button"
          className="group/media absolute inset-0 z-10 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--accent)]"
          aria-label={thumbnailActionLabel}
          title={thumbnailActionTooltip}
          onClick={openThumbnail}
        >
          <span className="absolute inset-0 bg-slate-950/50 opacity-0 transition-opacity duration-200 group-hover/media:opacity-100 group-focus-visible/media:opacity-100" />
          <span className="relative flex min-h-16 min-w-16 scale-90 items-center justify-center rounded-full border-2 border-white bg-slate-950/55 text-white opacity-0 shadow-[0_10px_28px_rgba(0,0,0,0.32)] transition-[opacity,transform] duration-200 group-hover/media:scale-100 group-hover/media:opacity-100 group-focus-visible/media:scale-100 group-focus-visible/media:opacity-100">
            <Play size={30} weight="fill" className="translate-x-0.5" />
          </span>
        </button>

        {role === "creator" ? (
          <span
            className={`absolute left-3.5 top-3.5 z-20 inline-flex min-h-7 items-center rounded-lg border px-2.5 text-[0.7rem] font-semibold capitalize ${creatorStatusStyles[course.lifecycleStatus]}`}
            data-course-card-tag
          >
            {course.lifecycleStatus}
          </span>
        ) : course.enrolled ? (
          <span
            className={`absolute left-3.5 top-3.5 z-20 inline-flex min-h-7 items-center rounded-lg border px-2.5 text-[0.7rem] font-semibold ${studentStatusStyles[studentStatus]}`}
            data-course-card-tag
          >
            {getStudentStatusLabel(course)}
          </span>
        ) : (
          <>
            <span
              className={`absolute left-3.5 top-3.5 z-20 inline-flex min-h-7 items-center rounded-lg border px-2.5 text-[0.7rem] font-semibold ${studentStatusStyles[studentStatus]}`}
              data-course-card-tag
            >
              {getStudentStatusLabel(course)}
            </span>
            <button
              type="button"
              className={`absolute right-3 top-3 z-20 flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/15 bg-slate-950/70 text-white shadow-lg transition-colors hover:bg-slate-950/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${wishlisted ? "text-rose-400" : ""}`}
              aria-label={
                wishlisted
                  ? `Remove ${course.title} from wishlist`
                  : `Add ${course.title} to wishlist`
              }
              aria-pressed={wishlisted}
              onClick={() => onWishlist(course.id)}
            >
              <Heart size={21} weight={wishlisted ? "fill" : "regular"} />
            </button>
          </>
        )}
      </div>

      <div
        className="relative flex min-h-[184px] flex-col p-4"
        data-course-card-details
      >
        <a
          href={overviewPath}
          className="absolute inset-0 z-10 cursor-pointer rounded-b-[11px] outline-none transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
          aria-label={`View curriculum for ${course.title}`}
          title="View Curriculum"
          data-course-card-curriculum
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            onNavigatePage(overviewPath);
          }}
        />

        <div
          className="-mx-2 flex min-w-0 items-start"
          data-course-card-info-row
        >
          <div className="min-w-0 flex-1 px-2 py-1.5 text-left">
            <h2 className="truncate text-[0.92rem] font-semibold leading-8 tracking-[-0.015em] text-[var(--text)] lg:text-[0.98rem]">
              {course.title}
            </h2>
            <p className="mt-0.5 truncate text-[0.75rem] leading-6 text-[var(--muted)]">
              {course.sections} Sections{" "}
              <span className="mx-px inline-block" aria-hidden="true">
                •
              </span>{" "}
              {course.lectures} Lectures{" "}
              <span className="mx-px inline-block" aria-hidden="true">
                •
              </span>{" "}
              {course.duration}
            </p>
          </div>

          <div className="relative z-30 ml-auto shrink-0" data-course-menu>
            <button
              type="button"
              ref={menuButtonRef}
              className="group/action relative isolate flex size-10 items-center justify-center overflow-visible rounded-full text-[var(--text-secondary)] focus-visible:!outline-none"
              aria-label={`Actions for ${course.title}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onPointerDown={(event) => {
                if (event.button === 0) {
                  menuPointerInteractionRef.current = true;
                  setMenuKeyboardFocus(false);
                  setMenuPressPulse((pulse) => pulse + 1);
                }
              }}
              onPointerUp={() => {
                menuPointerInteractionRef.current = false;
              }}
              onPointerCancel={() => {
                menuPointerInteractionRef.current = false;
                setMenuPressPulse(0);
              }}
              onPointerLeave={() => setMenuPressPulse(0)}
              onFocus={() => {
                if (!menuPointerInteractionRef.current)
                  setMenuKeyboardFocus(true);
              }}
              onBlur={() => {
                menuPointerInteractionRef.current = false;
                setMenuKeyboardFocus(false);
              }}
              onKeyDown={(event) => {
                setMenuKeyboardFocus(true);
                if (
                  !event.repeat &&
                  (event.key === "Enter" || event.key === " ")
                ) {
                  setMenuPressPulse((pulse) => pulse + 1);
                }
              }}
              onClick={toggleCourseMenu}
            >
              <span
                className={`relative z-10 flex size-9 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors duration-150 group-hover/action:text-[var(--text)] ${menuKeyboardFocus ? "text-[var(--text)]" : ""}`}
              >
                <span
                  key={menuPressPulse}
                  className={`pointer-events-none absolute inset-0 z-0 rounded-full transition-colors duration-150 group-hover/action:bg-[color-mix(in_srgb,var(--text)_9%,var(--surface-strong))] group-active/action:bg-[color-mix(in_srgb,var(--text)_24%,var(--surface-strong))] ${menuKeyboardFocus ? "bg-[color-mix(in_srgb,var(--text)_16%,var(--surface-strong))]" : ""} ${menuPressPulse > 0 ? "course-menu-press-feedback motion-reduce:animate-none" : ""}`}
                  aria-hidden="true"
                  onAnimationEnd={() => setMenuPressPulse(0)}
                />
                <DotsThreeVertical
                  className="relative z-10"
                  size={24}
                  weight="bold"
                />
              </span>
            </button>

            {menuOpen && (
              <div
                ref={menuRef}
                className={`absolute z-50 w-[238px] rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-1.5 shadow-[0_20px_48px_rgba(0,0,0,0.38)] ${
                  menuHorizontalPlacement === "right"
                    ? "left-full"
                    : menuHorizontalPlacement === "left"
                      ? "right-full"
                      : "left-0"
                } ${
                  menuVerticalPlacement === "above"
                    ? menuHorizontalPlacement === "aligned"
                      ? "bottom-full mb-2"
                      : "bottom-full"
                    : menuHorizontalPlacement === "aligned"
                      ? "top-full mt-2"
                      : "top-full"
                }`}
                role="menu"
                aria-label={`Actions for ${course.title}`}
                data-placement={`${menuVerticalPlacement}-${menuHorizontalPlacement}`}
                data-control-radius-menu
              >
                {role === "creator" ? (
                  <>
                    <MenuAction
                      Icon={PencilSimple}
                      label="Edit Course"
                      onClick={() => closeThen(() => onEdit?.(course))}
                    />
                    <MenuAction
                      Icon={ListBullets}
                      label="Manage Curriculum"
                      onClick={() => closeThen(() => onManage?.(course))}
                    />
                    <MenuAction
                      Icon={Eye}
                      label="Course Preview"
                      onClick={() => onExplore(course)}
                    />
                    <MenuAction
                      Icon={ChartBar}
                      label="Analytics"
                      onClick={() =>
                        closeThen(() =>
                          onNavigatePage(`/analytics?course=${course.id}`),
                        )
                      }
                    />
                    <MenuAction
                      Icon={UsersThree}
                      label="Manage Students"
                      onClick={() =>
                        closeThen(() =>
                          onNavigatePage(`/students?course=${course.id}`),
                        )
                      }
                    />
                    <MenuDivider />
                    <MenuAction
                      Icon={CopySimple}
                      label="Copy Course Link"
                      onClick={() => closeThen(() => void copyCourseLink())}
                    />
                    <MenuAction
                      Icon={PaperPlaneTilt}
                      label="Duplicate Course"
                      onClick={() =>
                        closeThen(() =>
                          setNotice(
                            `${course.title} was duplicated as a draft.`,
                          ),
                        )
                      }
                    />
                    <MenuDivider />
                    <MenuAction
                      Icon={
                        course.lifecycleStatus === "archived"
                          ? ArrowCounterClockwise
                          : UploadSimple
                      }
                      label={
                        course.lifecycleStatus === "published"
                          ? "Unpublish Course"
                          : course.lifecycleStatus === "draft"
                            ? "Publish Course"
                            : "Restore Course"
                      }
                      onClick={() => closeThen(lifecycleAction)}
                    />
                    {course.lifecycleStatus !== "archived" && (
                      <MenuAction
                        Icon={Archive}
                        label="Archive Course"
                        onClick={() =>
                          closeThen(() =>
                            setNotice(`${course.title} was archived.`),
                          )
                        }
                      />
                    )}
                    <MenuDivider />
                    <MenuAction
                      Icon={Trash}
                      label="Delete Course"
                      destructive
                      onClick={() =>
                        closeThen(() => onDeleteRequested?.(course))
                      }
                    />
                  </>
                ) : course.enrolled ? (
                  <>
                    <MenuAction
                      Icon={Eye}
                      label="Course Preview"
                      onClick={() => onExplore(course)}
                    />
                    <MenuDivider />
                    <MenuAction
                      Icon={PaperPlaneTilt}
                      label="Open Discussions"
                      onClick={() =>
                        closeThen(() =>
                          onNavigatePage(`/discussions?course=${course.id}`),
                        )
                      }
                    />
                    <MenuDivider />
                    <MenuAction
                      Icon={ShareNetwork}
                      label="Share Course"
                      onClick={() => closeThen(() => void shareCourse())}
                    />
                    <MenuAction
                      Icon={LinkSimple}
                      label="Copy Course Link"
                      onClick={() => closeThen(() => void copyCourseLink())}
                    />
                    <MenuDivider />
                    {course.certificateAvailable && progress >= 100 && (
                      <MenuAction
                        Icon={Certificate}
                        label="View Certificate"
                        onClick={() =>
                          closeThen(() =>
                            setNotice(
                              `Opening your ${course.title} certificate.`,
                            ),
                          )
                        }
                      />
                    )}
                    <MenuAction
                      Icon={Flag}
                      label="Report an Issue"
                      onClick={() =>
                        closeThen(() =>
                          setNotice(
                            `Issue reporting opened for ${course.title}.`,
                          ),
                        )
                      }
                    />
                  </>
                ) : (
                  <>
                    <MenuAction
                      Icon={Eye}
                      label="Course Preview"
                      onClick={() => onExplore(course)}
                    />
                    <MenuDivider />
                    <MenuAction
                      icon={
                        <span
                          className="relative inline-flex size-[17px] shrink-0"
                          aria-hidden="true"
                        >
                          <GraduationCap size={17} weight="regular" />
                          <Plus
                            className="absolute -right-1 -bottom-0.5 rounded-full bg-[var(--surface)]"
                            size={8}
                            weight="bold"
                          />
                        </span>
                      }
                      label="Enroll Now"
                      onClick={() =>
                        closeThen(() =>
                          onNavigatePage(`${overviewPath}?enroll=true`),
                        )
                      }
                    />
                    <MenuDivider />
                    <MenuAction
                      Icon={ShareNetwork}
                      label="Share Course"
                      onClick={() => closeThen(() => void shareCourse())}
                    />
                    <MenuAction
                      Icon={LinkSimple}
                      label="Copy Course Link"
                      onClick={() => closeThen(() => void copyCourseLink())}
                    />
                    <MenuDivider />
                    <MenuAction
                      Icon={Flag}
                      label="Report Course"
                      onClick={() =>
                        closeThen(() =>
                          setNotice(
                            `Course report opened for ${course.title}.`,
                          ),
                        )
                      }
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-auto flex flex-col">
          {role === "student" && !course.enrolled && (
            <div
              className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1"
              data-course-card-pricing
              aria-label={`Course price ${course.pricing?.price ?? DEFAULT_NOT_ENROLLED_PRICING.price}`}
            >
              <strong className="text-[1.55rem] font-extrabold leading-none tracking-[-0.035em] text-[var(--text)]">
                {(course.pricing ?? DEFAULT_NOT_ENROLLED_PRICING).price}
              </strong>
              <span className="text-[0.95rem] font-medium leading-none text-[var(--muted)] line-through">
                {(course.pricing ?? DEFAULT_NOT_ENROLLED_PRICING).originalPrice}
              </span>
              <span className="inline-flex items-center rounded-md bg-emerald-500/20 px-2 py-1 text-[0.72rem] font-bold leading-none text-emerald-300">
                {(course.pricing ?? DEFAULT_NOT_ENROLLED_PRICING).discount}
              </span>
            </div>
          )}

          {role === "student" && course.enrolled && (
            <div
              className="mb-4 flex items-center gap-2.5 text-[0.72rem] text-[var(--muted)]"
              aria-label={`${progress}% complete`}
            >
              <span
                className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--track)]"
                data-course-card-progress
              >
                <span
                  className="block h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${progress}%` }}
                  data-course-card-progress-fill
                />
              </span>
              <strong className="min-w-8 text-right font-semibold text-[var(--text-secondary)]">
                {progress}%
              </strong>
            </div>
          )}

          <button
            type="button"
            className={`relative z-20 min-h-11 w-full items-center rounded-[var(--control-radius-action)] border border-[color-mix(in_srgb,var(--accent)_70%,transparent)] bg-[var(--accent)] px-[13px] !text-[14px] !font-[650] text-[var(--on-accent)] shadow-[0_10px_22px_color-mix(in_srgb,var(--accent-shadow)_48%,transparent)] transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
              role === "creator"
                ? "flex justify-center gap-2 hover:bg-[var(--accent-hover)]"
                : "flex justify-center gap-3 hover:bg-[var(--accent)]"
            }`}
            data-control-radius-action
            onClick={() => {
              if (role === "creator") {
                onEdit?.(course);
                return;
              }

              if (course.enrolled) {
                onOpen(course);
                return;
              }

              onNavigatePage(`${overviewPath}#curriculum`);
            }}
          >
            {role === "creator" ? (
              <>
                <PencilSimple
                  className="shrink-0"
                  size={17}
                  weight="bold"
                  aria-hidden="true"
                />
                <span>Edit Course</span>
              </>
            ) : (
              <span className="flex min-w-0 items-center gap-3">
                {course.enrolled ? (
                  <Play
                    className="shrink-0"
                    size={17}
                    weight="fill"
                    aria-hidden="true"
                  />
                ) : (
                  <ListBullets
                    className="shrink-0"
                    size={17}
                    weight="regular"
                    aria-hidden="true"
                  />
                )}
                <span className="truncate">
                  {course.enrolled ? "Continue Learning" : "View Curriculum"}
                </span>
              </span>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}
