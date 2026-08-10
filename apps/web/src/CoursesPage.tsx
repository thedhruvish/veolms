import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  TouchEvent as ReactTouchEvent,
} from "react";
import {
  CaretDown,
  Check,
  DotsThreeCircle,
  Moon,
  Palette,
  Question,
  SignOut,
  SidebarSimple,
  Student,
  Sun,
  Users,
} from "@phosphor-icons/react";
import logoDarkSvg from "./assets/procodrr-logo-dark.svg?raw";
import openSidebarSvg from "./assets/open-sidebar.svg?raw";
import closeSidebarSvg from "./assets/close-sidebar.svg?raw";
import { CreatorDashboard } from "./CreatorDashboard";
import { MyLearningPage, StudentHome } from "./StudentPages";
import type { LearningCourse } from "./StudentPages";
import { SettingsPage } from "./SettingsPage";
import { courses, getVisibleCourses } from "./courses/catalogue";
import type {
  Course,
  CourseCategory,
  CourseEnrollmentFilter,
  CourseRole,
  CourseSort,
} from "./courses/catalogue";
import { CourseCatalogue } from "./courses/CourseCatalogue";
import { AcademyPaletteMenu } from "./shell/AcademyPaletteMenu";
import { PlaceholderPage } from "./courses/PlaceholderPage";
import { WorkspacePage } from "./workspace/WorkspacePages";
import {
  getInitialNavigationOrder,
  getNavigationDisplayLabel,
  getNavigationIconColor,
  getOrderedNavigation,
} from "./shell/navigation";
import {
  SIDEBAR_MIN_WIDTH,
  clampSidebarMaxWidth,
  clampSidebarWidth,
  getInitialSidebarPreferences,
  getInitialSidebarWidth,
} from "./shell/sidebarPreferences";
import {
  academyThemes,
  getInitialAcademyTheme,
  persistAcademyTheme,
} from "./themes";
import type {
  SidebarMode,
  SidebarPreferences,
} from "./settings/settingsPreferences";
import { getStoredProfilePreferences } from "./settings/profilePreferences";
import type { ProfilePreferences } from "./settings/profilePreferences";

type ThemePreference = "light" | "dark" | "device";
type AppearanceOption = ThemePreference | "theme";
type AppearanceSwipeSource = AppearanceOption | "mode";
type NavigationDropPosition = "before" | "after";

interface CoursesPageProps {
  onOpenCourse: (course: Course | LearningCourse) => void;
  onNavigatePage: (page: string) => void;
  page?: string;
  section?: string | null;
  settingsTab?: string;
  renderMain?: (() => ReactNode) | null;
}

interface NavigationDropTarget {
  label: string;
  position: NavigationDropPosition;
}

interface NavigationDrag {
  pointerId: number;
  label: string;
  startX: number;
  startY: number;
  dragging: boolean;
}

interface AppearanceSwipe {
  pointerId: number;
  source: AppearanceSwipeSource;
  startX: number;
}

interface SidebarResize {
  pointerId: number;
  startX: number;
  startWidth: number;
  collapsedAtStart: boolean;
  collapsedDuringDrag: boolean;
  collapsedAtX: number | null;
  expandedFromRail: boolean;
  expandedAtX: number | null;
  handle: HTMLElement;
}

interface PointerPositionEvent {
  pointerId: number;
  clientX: number;
}

interface MobileDragBase {
  startY: number;
  lastY: number;
  startedAt: number;
  dragging: boolean;
  scrollRegion: HTMLElement | null;
}

interface MobilePointerDrag extends MobileDragBase {
  kind: "pointer";
  pointerId: number;
}

interface MobileTouchDrag extends MobileDragBase {
  kind: "touch";
  touchId: number;
}

type MobileDrag = MobilePointerDrag | MobileTouchDrag;

interface SidebarTooltip {
  label: string;
  active: boolean;
  top: number;
  left: number;
  focusVisible: boolean;
}

const isSidebarMode = (value: string | null): value is SidebarMode =>
  value === "expanded" || value === "collapsed" || value === "hidden";

const getClosestScrollRegion = (target: EventTarget): HTMLElement | null =>
  target instanceof Element
    ? target.closest<HTMLElement>(".mobile-menu-sheet__list")
    : null;

const procodrrLogoSvg = logoDarkSvg.replace(
  /fill="black"/g,
  'fill="currentColor"',
);

const SIDEBAR_COLLAPSED_WIDTH = 76;
const SIDEBAR_COLLAPSE_DRAG_DISTANCE = 80;
const SIDEBAR_EXPAND_DRAG_DISTANCE = 10;

const getProfileInitials = (displayName: string) => {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase())
    .join("");
};

function ShellProfileAvatar({
  avatarUrl,
  displayName,
}: {
  avatarUrl: string | null;
  displayName: string;
}) {
  return (
    <i className="shell-profile-avatar" aria-hidden="true">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" />
      ) : (
        <strong>{getProfileInitials(displayName)}</strong>
      )}
    </i>
  );
}

export function CoursesPage({
  onOpenCourse,
  onNavigatePage,
  page = "courses",
  section: requestedSection = null,
  settingsTab = "appearance",
  renderMain = null,
}: CoursesPageProps) {
  const [role, setRole] = useState<CourseRole>(
    () => (localStorage.getItem("veolms-role") || "student") as CourseRole,
  );
  const [savedShellProfiles, setSavedShellProfiles] = useState<
    Record<CourseRole, ProfilePreferences | null>
  >(() => ({
    student: getStoredProfilePreferences("student"),
    creator: getStoredProfilePreferences("creator"),
  }));
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    const savedMode = localStorage.getItem("veolms-sidebar-mode");
    if (isSidebarMode(savedMode)) return savedMode;
    return localStorage.getItem("veolms-sidebar-collapsed") === "true"
      ? "collapsed"
      : "expanded";
  });
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const [navigationOrders, setNavigationOrders] = useState<
    Record<CourseRole, string[]>
  >(() => ({
    student: getInitialNavigationOrder("student"),
    creator: getInitialNavigationOrder("creator"),
  }));
  const [draggedNavigationLabel, setDraggedNavigationLabel] = useState<
    string | null
  >(null);
  const [navigationDropTarget, setNavigationDropTarget] =
    useState<NavigationDropTarget | null>(null);
  const [compactNavigation, setCompactNavigation] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(
          "(max-width: 820px), (hover: none), (pointer: coarse)",
        ).matches
      : false,
  );
  const [edgeSidebarOpen, setEdgeSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(
    () => (localStorage.getItem("veolms-theme") || "dark") as ThemePreference,
  );
  const [academyTheme, setAcademyTheme] = useState(getInitialAcademyTheme);
  const [palettePreviewTheme, setPalettePreviewTheme] = useState<string | null>(
    null,
  );
  const displayedAcademyTheme = palettePreviewTheme ?? academyTheme;
  const [sidebarPreferences, setSidebarPreferences] = useState(
    getInitialSidebarPreferences,
  );
  const sidebarMaxWidth = clampSidebarMaxWidth(
    sidebarPreferences?.sidebarMaxWidth,
  );
  const showSidebarThemeIcon = sidebarPreferences.showThemeIcon !== false;
  const [activeSection, setActiveSection] = useState(() => {
    if (page === "home") return role === "creator" ? "Dashboard" : "Home";
    if (page === "my-learning") return "My Learning";
    return sessionStorage.getItem("veolms-course-section") || "Courses";
  });
  const [enrollmentFilter, setEnrollmentFilter] =
    useState<CourseEnrollmentFilter>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | CourseCategory>("all");
  const [sort, setSort] = useState<CourseSort>("latest");
  const [wishlisted, setWishlisted] = useState<Set<string>>(() => {
    try {
      const savedWishlist: unknown = JSON.parse(
        localStorage.getItem("veolms-wishlist") || "[]",
      );
      return new Set<string>(savedWishlist as Iterable<string>);
    } catch {
      return new Set();
    }
  });
  const [courseMenu, setCourseMenu] = useState<string | null>(null);
  const [profileMenu, setProfileMenu] = useState(false);
  const [paletteMenu, setPaletteMenu] = useState(false);
  const [sidebarTooltip, setSidebarTooltip] = useState<SidebarTooltip | null>(
    null,
  );
  const [navigationScrollFade, setNavigationScrollFade] = useState({
    top: false,
    bottom: false,
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobilePaletteMenu, setMobilePaletteMenu] = useState(false);
  const [mobileSheetOffset, setMobileSheetOffset] = useState(0);
  const [notice, setNotice] = useState("");
  const savedShellProfile = savedShellProfiles[role];
  const shellProfileDisplayName =
    savedShellProfile?.displayName ??
    (role === "creator" ? "Anurag Singh" : "Ashi Singh");
  const shellProfileAvatarUrl = savedShellProfile
    ? savedShellProfile.avatarDataUrl
    : role === "creator"
      ? "/assets/ethan-avatar.jpg"
      : "/assets/sofia-avatar.jpg";
  const profileRef = useRef<HTMLDivElement>(null);
  const paletteTriggerRef = useRef<HTMLButtonElement>(null);
  const collapsedPaletteTriggerRef = useRef<HTMLButtonElement>(null);
  const mobilePaletteTriggerRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const mobileMoreRef = useRef<HTMLButtonElement>(null);
  const mobileSheetRef = useRef<HTMLElement>(null);
  const mobileDragRef = useRef<MobileDrag | null>(null);
  const mobileDragConsumedRef = useRef(false);
  const mobileMenuWasOpenRef = useRef(false);
  const sidebarResizeRef = useRef<SidebarResize | null>(null);
  const sidebarResizeMoveRef = useRef<
    ((event: PointerPositionEvent) => void) | null
  >(null);
  const sidebarResizeFinishRef = useRef<
    ((event: PointerPositionEvent, cancelled?: boolean) => void) | null
  >(null);
  const navigationDragRef = useRef<NavigationDrag | null>(null);
  const navigationDropRef = useRef<NavigationDropTarget | null>(null);
  const navigationDragConsumedRef = useRef(false);
  const appearanceSwipeRef = useRef<AppearanceSwipe | null>(null);
  const appearanceSwipeConsumedRef = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.dataset.theme =
        theme === "device" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.appearance = theme;
    };
    applyTheme();
    localStorage.setItem("veolms-theme", theme);
    if (theme !== "device") return undefined;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    // Appearance preferences are stored independently from the settings route,
    // so restore this shell-wide preference whenever the app mounts or refreshes.
    document.documentElement.dataset.hideScrollbars = String(
      localStorage.getItem("veolms-hide-scrollbars") === "true",
    );
  }, []);

  useEffect(() => {
    document.documentElement.dataset.palette = displayedAcademyTheme;
  }, [displayedAcademyTheme]);

  useEffect(() => {
    persistAcademyTheme(academyTheme);
  }, [academyTheme]);

  useEffect(() => {
    const next = sidebarPreferences || {};
    document.documentElement.dataset.sidebarIconStyle =
      next.iconStyle || "monochrome";
    document.documentElement.dataset.sidebarMonochromeMode =
      next.monochromeMode || "theme";
    document.documentElement.dataset.contentLayout =
      next.contentLayout || "framed";
    document.documentElement.dataset.collapsedTooltips = String(
      next.showCollapsedLabels !== false,
    );
    document.documentElement.dataset.collapsedSidebarLogo = String(
      next.showCollapsedLogo !== false,
    );
    document.documentElement.dataset.activeFill = String(
      next.highlightActive !== false,
    );
    document.documentElement.style.setProperty(
      "--sidebar-monochrome-color",
      next.monochromeColor || "#6c78ff",
    );
    localStorage.setItem("veolms-sidebar-preferences", JSON.stringify(next));
  }, [sidebarPreferences]);

  useEffect(() => {
    setSidebarWidth((currentWidth) => {
      const nextWidth = clampSidebarWidth(currentWidth, sidebarMaxWidth);
      if (nextWidth === currentWidth) return currentWidth;
      localStorage.setItem(
        "veolms-sidebar-width",
        String(Math.round(nextWidth)),
      );
      return nextWidth;
    });
  }, [sidebarMaxWidth]);

  useEffect(() => {
    Object.entries(navigationOrders).forEach(([roleName, order]) => {
      localStorage.setItem(
        `veolms-navigation-order-${roleName}`,
        JSON.stringify(order),
      );
    });
  }, [navigationOrders]);

  useEffect(() => {
    localStorage.setItem("veolms-role", role);
    setCourseMenu(null);
    setEnrollmentFilter("all");
    if (role === "creator" && page === "my-learning") {
      onNavigatePage?.("home");
      setActiveSection("Dashboard");
      return;
    }
    if (page === "home")
      setActiveSection(role === "creator" ? "Dashboard" : "Home");
    else if (page === "my-learning") setActiveSection("My Learning");
    else if (requestedSection) setActiveSection(requestedSection);
    else {
      const storedSection = sessionStorage.getItem("veolms-course-section");
      setActiveSection(storedSection || "Courses");
      sessionStorage.removeItem("veolms-course-section");
    }
  }, [onNavigatePage, page, requestedSection, role]);

  useEffect(() => {
    localStorage.setItem("veolms-sidebar-mode", sidebarMode);
    localStorage.setItem(
      "veolms-sidebar-collapsed",
      String(sidebarMode === "collapsed"),
    );
    navigationRef.current?.scrollTo({ top: 0 });
    if (sidebarMode !== "hidden") setEdgeSidebarOpen(false);
  }, [sidebarMode]);

  useEffect(() => {
    const media = window.matchMedia(
      "(max-width: 820px), (hover: none), (pointer: coarse)",
    );
    const syncNavigationMode = () => setCompactNavigation(media.matches);
    syncNavigationMode();
    media.addEventListener("change", syncNavigationMode);
    return () => media.removeEventListener("change", syncNavigationMode);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setMobilePaletteMenu(false);
    setMobileSheetOffset(0);

    const focusTimer = window.setTimeout(() => {
      mobileSheetRef.current?.focus({ preventScroll: true });
    }, 0);

    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !mobileSheetRef.current) return;
      const focusable = [
        ...mobileSheetRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === mobileSheetRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", keepFocusInside);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keepFocusInside);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!compactNavigation) {
      setMobileMenuOpen(false);
      setMobilePaletteMenu(false);
    }
  }, [compactNavigation]);

  useEffect(() => {
    if (mobileMenuWasOpenRef.current && !mobileMenuOpen) {
      mobileMoreRef.current?.focus();
    }
    mobileMenuWasOpenRef.current = mobileMenuOpen;
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!paletteMenu && !mobilePaletteMenu) setPalettePreviewTheme(null);
  }, [mobilePaletteMenu, paletteMenu]);

  useEffect(() => {
    if (showSidebarThemeIcon) return;
    setPalettePreviewTheme(null);
    setPaletteMenu(false);
    setMobilePaletteMenu(false);
  }, [showSidebarThemeIcon]);

  useEffect(() => {
    localStorage.setItem("veolms-wishlist", JSON.stringify([...wishlisted]));
  }, [wishlisted]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("[data-course-menu]")
      )
        setCourseMenu(null);
      if (
        !(event.target instanceof Node) ||
        !profileRef.current?.contains(event.target)
      ) {
        setProfileMenu(false);
      }
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("[data-palette-menu], [data-palette-trigger]")
      ) {
        setPalettePreviewTheme(null);
        setPaletteMenu(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      const eventTarget = event.target;
      const isEditingText =
        eventTarget instanceof HTMLElement &&
        (eventTarget.matches("input, textarea, [contenteditable='true']") ||
          eventTarget.closest("[contenteditable='true']"));

      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key === "," &&
        !isEditingText
      ) {
        event.preventDefault();
        onNavigatePage?.("/settings/appearance");
        setActiveSection("Settings");
        setCourseMenu(null);
        setProfileMenu(false);
        setPaletteMenu(false);
        return;
      }

      if (event.key === "Escape") {
        setCourseMenu(null);
        setProfileMenu(false);
        setPalettePreviewTheme(null);
        setPaletteMenu(false);
        setMobileMenuOpen(false);
        setMobilePaletteMenu(false);
        setMobileSheetOffset(0);
        setEdgeSidebarOpen(false);
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.altKey &&
        !event.shiftKey &&
        (event.code === "KeyB" || event.key.toLowerCase() === "b") &&
        !isEditingText
      ) {
        event.preventDefault();
        setSidebarMode((current) =>
          current === "hidden" ? "expanded" : "hidden",
        );
        setPaletteMenu(false);
        setProfileMenu(false);
        setEdgeSidebarOpen(false);
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "b"
      ) {
        event.preventDefault();
        setSidebarMode((current) =>
          current === "expanded" ? "collapsed" : "expanded",
        );
        setPaletteMenu(false);
        setEdgeSidebarOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const navigation = useMemo(
    () => getOrderedNavigation(role, navigationOrders[role]),
    [navigationOrders, role],
  );
  const updateNavigationScrollFade = () => {
    const nav = navigationRef.current;
    if (!nav) return;

    const maxScrollTop = Math.max(0, nav.scrollHeight - nav.clientHeight);
    const hasOverflow = maxScrollTop > 2;
    const hasScrolled = hasOverflow && nav.scrollTop > 2;
    const next = {
      top: hasScrolled,
      bottom: hasScrolled && nav.scrollTop < maxScrollTop - 2,
    };

    setNavigationScrollFade((current) =>
      current.top === next.top && current.bottom === next.bottom
        ? current
        : next,
    );
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateNavigationScrollFade);
    const handleResize = () => updateNavigationScrollFade();
    window.addEventListener("resize", handleResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleResize);
    };
  }, [compactNavigation, navigation, role, sidebarMode]);

  const visibleCourses = useMemo(
    () =>
      getVisibleCourses(courses, {
        activeSection,
        wishlisted,
        role,
        enrollmentFilter,
        category,
        search,
        sort,
      }),
    [activeSection, category, enrollmentFilter, role, search, sort, wishlisted],
  );

  const toggleWishlist = (courseId: string) => {
    setWishlisted((current) => {
      const next = new Set(current);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
  };

  const resetCatalogue = () => {
    setActiveSection("Courses");
    setSearch("");
    setCategory("all");
    setEnrollmentFilter("all");
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    setMobilePaletteMenu(false);
    setMobileSheetOffset(0);
    mobileDragConsumedRef.current = false;
  };

  const selectNavigation = (label: string) => {
    closeMobileMenu();
    if (label === "Home" || label === "Dashboard") {
      onNavigatePage?.(label === "Dashboard" ? "dashboard" : "home");
      return;
    }
    if (label === "My Learning") {
      onNavigatePage?.("my-learning");
      return;
    }
    if (label === "Courses") {
      setSearch("");
      setActiveSection("Courses");
      onNavigatePage?.("courses");
      return;
    }
    if (label === "Wishlist") {
      setSearch("");
      setActiveSection("Wishlist");
      onNavigatePage?.("wishlist");
      return;
    }
    onNavigatePage?.(label);
  };

  const reorderNavigation = (
    sourceLabel: string,
    targetLabel: string,
    position: NavigationDropPosition = "before",
  ) => {
    if (!sourceLabel || !targetLabel || sourceLabel === targetLabel) return;
    setNavigationOrders((current) => {
      const currentOrder = current[role] || getInitialNavigationOrder(role);
      const sourceIndex = currentOrder.indexOf(sourceLabel);
      if (sourceIndex < 0 || !currentOrder.includes(targetLabel))
        return current;
      const nextOrder = [...currentOrder];
      nextOrder.splice(sourceIndex, 1);
      const targetIndex = nextOrder.indexOf(targetLabel);
      nextOrder.splice(
        targetIndex + (position === "after" ? 1 : 0),
        0,
        sourceLabel,
      );
      return { ...current, [role]: nextOrder };
    });
  };

  const moveNavigationWithKeyboard = (label: string, direction: -1 | 1) => {
    const currentOrder =
      navigationOrders[role] || getInitialNavigationOrder(role);
    const currentIndex = currentOrder.indexOf(label);
    const targetLabel = currentOrder[currentIndex + direction];
    if (!targetLabel) return;
    reorderNavigation(label, targetLabel, direction < 0 ? "before" : "after");
    setNotice(`${label} moved ${direction < 0 ? "up" : "down"}.`);
  };

  const startNavigationPointerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    label: string,
  ) => {
    if (compactNavigation) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    navigationDragRef.current = {
      pointerId: event.pointerId,
      label,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    navigationDropRef.current = null;
    navigationDragConsumedRef.current = false;
    setNavigationDropTarget(null);
  };

  const moveNavigationPointerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const drag = navigationDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.dragging) {
      if (
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 7
      )
        return;
      drag.dragging = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDraggedNavigationLabel(drag.label);
      setSidebarTooltip(null);
    }
    event.preventDefault();
    const targetButton = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-navigation-label]");
    const targetLabel = targetButton?.dataset.navigationLabel;
    if (!targetLabel || targetLabel === drag.label) {
      navigationDropRef.current = null;
      setNavigationDropTarget(null);
      return;
    }
    const targetRect = targetButton.getBoundingClientRect();
    const position: NavigationDropPosition =
      event.clientY >= targetRect.top + targetRect.height / 2
        ? "after"
        : "before";
    const dropTarget = { label: targetLabel, position };
    navigationDropRef.current = dropTarget;
    setNavigationDropTarget((current) =>
      current?.label === targetLabel && current.position === position
        ? current
        : dropTarget,
    );
  };

  const finishNavigationPointerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    cancelled = false,
  ) => {
    const drag = navigationDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    navigationDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!drag.dragging) return;
    event.preventDefault();
    navigationDragConsumedRef.current = true;
    if (!cancelled && navigationDropRef.current) {
      reorderNavigation(
        drag.label,
        navigationDropRef.current.label,
        navigationDropRef.current.position,
      );
      setNotice("Navigation order saved.");
    }
    navigationDropRef.current = null;
    setDraggedNavigationLabel(null);
    setNavigationDropTarget(null);
    window.setTimeout(() => {
      navigationDragConsumedRef.current = false;
    }, 150);
  };

  const handleNavigationClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
    label: string,
  ) => {
    if (navigationDragConsumedRef.current) {
      event.preventDefault();
      return;
    }
    selectNavigation(label);
  };

  const sidebarHidden = sidebarMode === "hidden" && !compactNavigation;
  const sidebarCollapsed =
    sidebarMode === "collapsed" ||
    (sidebarMode === "hidden" && compactNavigation);
  const toggleAppearance = () =>
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  const consumeAppearanceSwipeClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (!appearanceSwipeConsumedRef.current) return false;
    appearanceSwipeConsumedRef.current = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  const selectAcademyTheme = (themeId: string) => {
    setAcademyTheme(themeId);
    setPalettePreviewTheme(null);
  };

  const focusPaletteTrigger = (trigger: HTMLButtonElement | null) => {
    window.setTimeout(() => trigger?.focus({ preventScroll: true }), 0);
  };

  const confirmDesktopPaletteTheme = (themeId: string) => {
    selectAcademyTheme(themeId);
    setPaletteMenu(false);
    focusPaletteTrigger(
      sidebarCollapsed
        ? collapsedPaletteTriggerRef.current
        : paletteTriggerRef.current,
    );
  };

  const cancelDesktopPalettePreview = () => {
    setPalettePreviewTheme(null);
    setPaletteMenu(false);
    focusPaletteTrigger(
      sidebarCollapsed
        ? collapsedPaletteTriggerRef.current
        : paletteTriggerRef.current,
    );
  };

  const confirmMobilePaletteTheme = (themeId: string) => {
    selectAcademyTheme(themeId);
    setMobilePaletteMenu(false);
    focusPaletteTrigger(mobilePaletteTriggerRef.current);
  };

  const cancelMobilePalettePreview = () => {
    setPalettePreviewTheme(null);
    setMobilePaletteMenu(false);
    focusPaletteTrigger(mobilePaletteTriggerRef.current);
  };

  const activateAppearanceOption = (
    option: AppearanceOption,
    mobile = false,
  ) => {
    if (option === "theme") {
      if (!showSidebarThemeIcon) return;
      if (mobile) setMobilePaletteMenu(true);
      else setPaletteMenu(true);
      return;
    }
    setTheme(option);
    setPalettePreviewTheme(null);
    if (mobile) setMobilePaletteMenu(false);
    else setPaletteMenu(false);
  };

  const startAppearanceSwipe = (
    event: ReactPointerEvent<HTMLButtonElement>,
    source: AppearanceSwipeSource,
  ) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.stopPropagation();
    appearanceSwipeRef.current = {
      pointerId: event.pointerId,
      source,
      startX: event.clientX,
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is optional; the button still receives the gesture end.
    }
  };

  const finishAppearanceSwipe = (
    event: ReactPointerEvent<HTMLButtonElement>,
    source: AppearanceSwipeSource,
    mobile = false,
  ) => {
    event.stopPropagation();
    const swipe = appearanceSwipeRef.current;
    if (
      !swipe ||
      swipe.pointerId !== event.pointerId ||
      swipe.source !== source
    )
      return;
    appearanceSwipeRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Release can be a no-op when capture was unavailable.
    }

    const delta = event.clientX - swipe.startX;
    if (Math.abs(delta) < 28) return;

    appearanceSwipeConsumedRef.current = true;
    if (source === "mode") {
      // The collapsed rail uses a single mode button. A horizontal swipe on
      // it is reserved for opening the color-theme picker, never for changing
      // light/dark mode.
      activateAppearanceOption("theme", mobile);
      window.setTimeout(() => {
        appearanceSwipeConsumedRef.current = false;
      }, 0);
      return;
    }

    const options: readonly AppearanceOption[] = ["light", "dark", "theme"];
    const sourceIndex = options.indexOf(source);
    const direction = delta > 0 ? 1 : -1;
    const nextOption =
      options[(sourceIndex + direction + options.length) % options.length];
    activateAppearanceOption(nextOption!, mobile);
    window.setTimeout(() => {
      appearanceSwipeConsumedRef.current = false;
    }, 0);
  };

  const cancelAppearanceSwipe = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    const swipe = appearanceSwipeRef.current;
    if (!swipe || swipe.pointerId !== event.pointerId) return;
    appearanceSwipeRef.current = null;
    appearanceSwipeConsumedRef.current = false;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Release can be a no-op when capture was unavailable.
    }
  };
  const sidebarClassName = [
    "courses-app",
    sidebarCollapsed ? "courses-app--collapsed" : "",
    sidebarHidden ? "courses-app--hidden" : "",
    sidebarHidden && edgeSidebarOpen ? "courses-app--edge-open" : "",
    sidebarResizing ? "courses-app--resizing" : "",
    draggedNavigationLabel ? "courses-app--navigation-dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    setSidebarTooltip(null);
  }, [activeSection, compactNavigation, sidebarHidden, sidebarMode]);

  const showCollapsedNavigationTooltip = (
    event:
      ReactMouseEvent<HTMLButtonElement> | ReactFocusEvent<HTMLButtonElement>,
    label: string,
    active: boolean,
  ) => {
    if (
      !sidebarCollapsed ||
      sidebarHidden ||
      compactNavigation ||
      navigationDragRef.current?.dragging
    )
      return;
    const rect = event.currentTarget.getBoundingClientRect();
    setSidebarTooltip({
      label,
      active,
      top: rect.top + rect.height / 2,
      left: rect.right + 11,
      focusVisible:
        event.type === "focus" && event.currentTarget.matches(":focus-visible"),
    });
  };

  const hideCollapsedNavigationTooltip = (
    event:
      ReactMouseEvent<HTMLButtonElement> | ReactFocusEvent<HTMLButtonElement>,
  ) => {
    if (
      event?.type === "mouseleave" &&
      document.activeElement === event.currentTarget
    )
      return;
    if (event?.type === "blur" && event.currentTarget.matches(":hover")) return;
    setSidebarTooltip(null);
  };

  const commitSidebarWidth = (value: number) => {
    const nextWidth = clampSidebarWidth(value, sidebarMaxWidth);
    setSidebarWidth(nextWidth);
    localStorage.setItem("veolms-sidebar-width", String(Math.round(nextWidth)));
  };

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (compactNavigation || sidebarHidden) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    sidebarResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth,
      collapsedAtStart: sidebarCollapsed,
      collapsedDuringDrag: false,
      collapsedAtX: null,
      expandedFromRail: false,
      expandedAtX: null,
      handle: event.currentTarget,
    };
    setSidebarResizing(true);
  };

  const collapseSidebarFromDrag = (resize: SidebarResize, pointerX: number) => {
    // Keep the active resize session and pointer capture alive. The rail is a
    // live resize target, so the same held gesture can move back to the right
    // and expand it again without requiring a second pointer-down.
    resize.collapsedDuringDrag = true;
    resize.collapsedAtX = pointerX;
    resize.expandedFromRail = false;
    resize.expandedAtX = null;
    setSidebarWidth(resize.collapsedAtStart ? sidebarWidth : resize.startWidth);
    setSidebarMode("collapsed");
    setPaletteMenu(false);
    setEdgeSidebarOpen(false);
  };

  const moveSidebarResize = (event: PointerPositionEvent) => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    if (resize.collapsedDuringDrag && !resize.expandedFromRail) {
      const expandDelta = event.clientX - resize.collapsedAtX!;
      if (expandDelta < SIDEBAR_EXPAND_DRAG_DISTANCE) return;
      resize.collapsedDuringDrag = false;
      resize.expandedFromRail = true;
      resize.expandedAtX = event.clientX;
      setSidebarMode("expanded");
      setSidebarWidth(SIDEBAR_MIN_WIDTH);
      return;
    }

    if (resize.collapsedAtStart && !resize.expandedFromRail) {
      const expandDelta = event.clientX - resize.startX;
      if (expandDelta < SIDEBAR_EXPAND_DRAG_DISTANCE) return;
      resize.expandedFromRail = true;
      resize.expandedAtX = event.clientX;
      setSidebarMode("expanded");
      setSidebarWidth(SIDEBAR_MIN_WIDTH);
      return;
    }

    const dragStartX = resize.expandedFromRail
      ? resize.expandedAtX!
      : resize.startX;
    const dragDelta = event.clientX - dragStartX;
    const baseWidth = resize.expandedFromRail
      ? SIDEBAR_MIN_WIDTH
      : resize.startWidth;
    const widthPastMinimum = baseWidth + dragDelta - SIDEBAR_MIN_WIDTH;
    if (widthPastMinimum <= -SIDEBAR_COLLAPSE_DRAG_DISTANCE) {
      collapseSidebarFromDrag(resize, event.clientX);
      return;
    }

    setSidebarWidth(clampSidebarWidth(baseWidth + dragDelta, sidebarMaxWidth));
  };

  const endSidebarResize = (event: PointerPositionEvent, cancelled = false) => {
    const resize = sidebarResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const dragStartX = resize.expandedFromRail
      ? resize.expandedAtX!
      : resize.startX;
    const dragDelta = event.clientX - dragStartX;
    sidebarResizeRef.current = null;
    setSidebarResizing(false);
    resize.handle?.releasePointerCapture?.(resize.pointerId);

    if (cancelled) {
      setSidebarWidth(resize.startWidth);
      setSidebarMode(resize.collapsedAtStart ? "collapsed" : "expanded");
      return;
    }

    if (resize.collapsedDuringDrag) {
      setSidebarMode("collapsed");
      return;
    }

    if (resize.collapsedAtStart && !resize.expandedFromRail) {
      setSidebarMode("collapsed");
      return;
    }

    const baseWidth = resize.expandedFromRail
      ? SIDEBAR_MIN_WIDTH
      : resize.startWidth;
    const widthPastMinimum = baseWidth + dragDelta - SIDEBAR_MIN_WIDTH;
    if (widthPastMinimum <= -SIDEBAR_COLLAPSE_DRAG_DISTANCE) {
      setSidebarMode("collapsed");
      return;
    }

    commitSidebarWidth(baseWidth + dragDelta);
  };

  // Keep the resize alive even when the pointer leaves the narrow handle. The
  // pointer-capture path handles normal interaction; these document listeners
  // make quick drags and releases outside the handle finish predictably too.
  sidebarResizeMoveRef.current = moveSidebarResize;
  sidebarResizeFinishRef.current = endSidebarResize;

  useEffect(() => {
    if (!sidebarResizing) return undefined;
    const continueResize = (event: PointerEvent) =>
      sidebarResizeMoveRef.current?.(event);
    const finishResize = (event: PointerEvent) =>
      sidebarResizeFinishRef.current?.(event);
    const cancelResize = (event: PointerEvent) =>
      sidebarResizeFinishRef.current?.(event, true);
    window.addEventListener("pointermove", continueResize);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", cancelResize);
    return () => {
      window.removeEventListener("pointermove", continueResize);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", cancelResize);
    };
  }, [sidebarResizing]);

  const handleSidebarResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      if (sidebarCollapsed && event.key === "ArrowRight") {
        setSidebarMode("expanded");
        commitSidebarWidth(SIDEBAR_MIN_WIDTH);
      } else if (!sidebarCollapsed) {
        commitSidebarWidth(
          sidebarWidth + (event.key === "ArrowRight" ? 16 : -16),
        );
      }
    } else if (event.key === "Home") {
      event.preventDefault();
      commitSidebarWidth(SIDEBAR_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      commitSidebarWidth(sidebarMaxWidth);
    }
  };

  const toggleSidebarWidth = () => {
    setSidebarMode((current) =>
      current === "expanded" ? "collapsed" : "expanded",
    );
    setPaletteMenu(false);
    setEdgeSidebarOpen(false);
  };

  const mobileNavigation = navigation.slice(0, 4);
  const mobileMoreActive = !mobileNavigation.some(
    ([label]) => label === activeSection,
  );
  const currentAcademyThemeIndex = academyThemes.findIndex(
    (item) => item.id === academyTheme,
  );

  const startMobileSheetDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    mobileDragRef.current = {
      kind: "pointer",
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      startedAt: performance.now(),
      dragging: false,
      scrollRegion: getClosestScrollRegion(event.target),
    };
  };

  const moveMobileSheetDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = mobileDragRef.current;
    if (drag?.kind !== "pointer" || drag.pointerId !== event.pointerId) return;
    if (drag.scrollRegion && drag.scrollRegion.scrollTop > 0) {
      drag.startY = event.clientY;
      drag.lastY = event.clientY;
      drag.startedAt = performance.now();
      return;
    }
    const distance = event.clientY - drag.startY;
    drag.lastY = event.clientY;
    if (distance <= 0) {
      if (drag.dragging) setMobileSheetOffset(0);
      return;
    }
    if (!drag.dragging && distance < 8) return;
    if (!drag.dragging) {
      drag.dragging = true;
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Continuing inside the sheet is sufficient when capture is unavailable.
      }
    }
    event.preventDefault();
    setMobileSheetOffset(distance);
  };

  const finishMobileSheetDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = mobileDragRef.current;
    if (drag?.kind !== "pointer" || drag.pointerId !== event.pointerId) return;
    const distance = Math.max(0, drag.lastY - drag.startY);
    const elapsed = Math.max(1, performance.now() - drag.startedAt);
    const velocity = distance / elapsed;
    mobileDragRef.current = null;
    if (drag.dragging) {
      mobileDragConsumedRef.current = true;
      event.preventDefault();
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        // Release can be a no-op when the pointer finishes outside the sheet.
      }
      if (
        event.type !== "pointercancel" &&
        (distance > 72 || velocity > 0.45)
      ) {
        window.setTimeout(closeMobileMenu, 0);
        return;
      }
      window.setTimeout(() => {
        mobileDragConsumedRef.current = false;
      }, 0);
    }
    setMobileSheetOffset(0);
  };

  const startMobileSheetTouch = (event: ReactTouchEvent<HTMLElement>) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0]!;
    mobileDragRef.current = {
      kind: "touch",
      touchId: touch.identifier,
      startY: touch.clientY,
      lastY: touch.clientY,
      startedAt: performance.now(),
      dragging: false,
      scrollRegion: getClosestScrollRegion(event.target),
    };
  };

  const moveMobileSheetTouch = (event: ReactTouchEvent<HTMLElement>) => {
    const drag = mobileDragRef.current;
    if (drag?.kind !== "touch") return;
    const touch = Array.from(event.touches).find(
      (item) => item.identifier === drag.touchId,
    );
    if (!touch) return;
    if (drag.scrollRegion && drag.scrollRegion.scrollTop > 0) {
      drag.startY = touch.clientY;
      drag.lastY = touch.clientY;
      drag.startedAt = performance.now();
      return;
    }
    const distance = touch.clientY - drag.startY;
    drag.lastY = touch.clientY;
    if (distance <= 0) {
      if (drag.dragging) setMobileSheetOffset(0);
      return;
    }
    if (!drag.dragging && distance < 8) return;
    drag.dragging = true;
    event.preventDefault();
    setMobileSheetOffset(distance);
  };

  const finishMobileSheetTouch = (event: ReactTouchEvent<HTMLElement>) => {
    const drag = mobileDragRef.current;
    if (drag?.kind !== "touch") return;
    const touch = Array.from(event.changedTouches).find(
      (item) => item.identifier === drag.touchId,
    );
    if (touch) drag.lastY = touch.clientY;
    const distance = Math.max(0, drag.lastY - drag.startY);
    const elapsed = Math.max(1, performance.now() - drag.startedAt);
    const velocity = distance / elapsed;
    mobileDragRef.current = null;
    if (drag.dragging) {
      mobileDragConsumedRef.current = true;
      if (event.type !== "touchcancel" && (distance > 72 || velocity > 0.45)) {
        window.setTimeout(closeMobileMenu, 0);
        return;
      }
      window.setTimeout(() => {
        mobileDragConsumedRef.current = false;
      }, 0);
    }
    setMobileSheetOffset(0);
  };

  return (
    <div
      className={sidebarClassName}
      style={
        { "--sidebar-expanded-width": `${sidebarWidth}px` } as CSSProperties
      }
    >
      {sidebarHidden && (
        <div
          className="sidebar-edge-trigger"
          aria-hidden="true"
          onPointerEnter={() => setEdgeSidebarOpen(true)}
        />
      )}
      <aside
        className="courses-sidebar"
        aria-label={`${role === "creator" ? "Creator" : "Student"} navigation`}
        aria-hidden={sidebarHidden && !edgeSidebarOpen ? "true" : undefined}
        inert={sidebarHidden && !edgeSidebarOpen ? true : undefined}
        onPointerEnter={() => sidebarHidden && setEdgeSidebarOpen(true)}
        onPointerLeave={() => sidebarHidden && setEdgeSidebarOpen(false)}
        onFocusCapture={() => sidebarHidden && setEdgeSidebarOpen(true)}
      >
        {!compactNavigation && !sidebarHidden && (
          <div
            className="sidebar-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuemin={SIDEBAR_COLLAPSED_WIDTH}
            aria-valuemax={sidebarMaxWidth}
            aria-valuenow={
              sidebarCollapsed
                ? SIDEBAR_COLLAPSED_WIDTH
                : Math.round(sidebarWidth)
            }
            aria-valuetext={
              sidebarCollapsed
                ? "Collapsed sidebar"
                : `${Math.round(sidebarWidth)} pixels wide`
            }
            tabIndex={0}
            onKeyDown={handleSidebarResizeKeyDown}
            onPointerDown={startSidebarResize}
            onPointerMove={moveSidebarResize}
            onPointerUp={endSidebarResize}
            onPointerCancel={(event) => endSidebarResize(event, true)}
          />
        )}
        <div className="courses-sidebar__brand">
          <span
            className="courses-logo-clip"
            role="img"
            aria-label="ProCodrr"
            dangerouslySetInnerHTML={{ __html: procodrrLogoSvg }}
          />
          <button
            type="button"
            className="sidebar-collapse"
            aria-label={
              sidebarHidden
                ? "Pin navigation"
                : sidebarCollapsed
                  ? "Expand navigation"
                  : "Collapse navigation"
            }
            aria-pressed={sidebarCollapsed}
            aria-keyshortcuts="Control+B Meta+B Control+Alt+B Meta+Alt+B"
            title={
              sidebarHidden
                ? "Pin navigation"
                : `${sidebarCollapsed ? "Expand" : "Collapse"} navigation (Ctrl+B)`
            }
            onClick={toggleSidebarWidth}
          >
            <span
              className="sidebar-collapse__asset"
              aria-hidden="true"
              dangerouslySetInnerHTML={{
                __html:
                  sidebarCollapsed || sidebarHidden
                    ? openSidebarSvg
                    : closeSidebarSvg,
              }}
            />
          </button>
        </div>

        <nav
          className={[
            "courses-nav",
            navigationScrollFade.top ? "has-scroll-top" : "",
            navigationScrollFade.bottom ? "has-scroll-bottom" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          ref={navigationRef}
          onScroll={() => {
            setSidebarTooltip(null);
            updateNavigationScrollFade();
          }}
        >
          {navigation.map(([label, Icon]) => {
            const active = activeSection === label;
            const displayLabel = getNavigationDisplayLabel(label, page);
            const badge = label === "Wishlist" ? wishlisted.size : 0;
            return (
              <button
                type="button"
                key={label}
                className={[
                  active ? "is-active" : "",
                  draggedNavigationLabel === label ? "is-dragging" : "",
                  navigationDropTarget?.label === label ? "is-drop-target" : "",
                  navigationDropTarget?.label === label &&
                  navigationDropTarget.position === "after"
                    ? "is-drop-after"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  {
                    "--nav-icon-color": getNavigationIconColor(
                      label,
                      sidebarPreferences,
                    ),
                  } as CSSProperties
                }
                aria-label={
                  label === "Wishlist" && wishlisted.size > 0
                    ? `${displayLabel} (${wishlisted.size})`
                    : displayLabel
                }
                aria-current={active ? "page" : undefined}
                aria-keyshortcuts={
                  label === "Settings"
                    ? "Control+Comma Meta+Comma"
                    : "Alt+ArrowUp Alt+ArrowDown"
                }
                data-navigation-label={label}
                data-sortable={!compactNavigation ? "true" : undefined}
                onClick={(event) => handleNavigationClick(event, label)}
                onPointerDown={(event) =>
                  startNavigationPointerDrag(event, label)
                }
                onPointerMove={moveNavigationPointerDrag}
                onPointerUp={finishNavigationPointerDrag}
                onPointerCancel={(event) =>
                  finishNavigationPointerDrag(event, true)
                }
                onKeyDown={(event) => {
                  if (
                    !event.altKey ||
                    (event.key !== "ArrowUp" && event.key !== "ArrowDown")
                  )
                    return;
                  event.preventDefault();
                  moveNavigationWithKeyboard(
                    label,
                    event.key === "ArrowUp" ? -1 : 1,
                  );
                }}
                onMouseEnter={(event) =>
                  showCollapsedNavigationTooltip(event, displayLabel, active)
                }
                onMouseLeave={hideCollapsedNavigationTooltip}
                onFocus={(event) =>
                  showCollapsedNavigationTooltip(event, displayLabel, active)
                }
                onBlur={hideCollapsedNavigationTooltip}
              >
                <Icon size={23} weight={active ? "fill" : "regular"} />
                <span className="courses-nav__text">{displayLabel}</span>
                {label === "Wishlist" && wishlisted.size > 0 && (
                  <b>{wishlisted.size}</b>
                )}
              </button>
            );
          })}
        </nav>

        <div className="courses-profile" ref={profileRef}>
          {profileMenu && (
            <div className="profile-menu" role="menu">
              <p>Preview workspace as</p>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={role === "student"}
                onClick={() => {
                  setRole("student");
                  setProfileMenu(false);
                }}
              >
                <Student size={18} />
                <span>Student</span>
                {role === "student" && (
                  <Check
                    className="profile-menu__check"
                    size={16}
                    weight="bold"
                  />
                )}
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={role === "creator"}
                onClick={() => {
                  setRole("creator");
                  setProfileMenu(false);
                }}
              >
                <Users size={18} />
                <span>Creator</span>
                {role === "creator" && (
                  <Check
                    className="profile-menu__check"
                    size={16}
                    weight="bold"
                  />
                )}
              </button>
              {!compactNavigation && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setSidebarMode(sidebarHidden ? "expanded" : "hidden");
                    setProfileMenu(false);
                    setEdgeSidebarOpen(false);
                  }}
                >
                  <SidebarSimple size={18} />
                  <span>
                    {sidebarHidden ? "Keep sidebar visible" : "Hide sidebar"}
                  </span>
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setProfileMenu(false);
                  onNavigatePage?.("Logout");
                }}
              >
                <SignOut size={18} />
                <span>Logout</span>
              </button>
            </div>
          )}
          <button
            type="button"
            className="courses-profile__button"
            aria-label="Open role and appearance menu"
            aria-expanded={profileMenu}
            onClick={() => setProfileMenu((current) => !current)}
          >
            <ShellProfileAvatar
              avatarUrl={shellProfileAvatarUrl}
              displayName={shellProfileDisplayName}
            />
            <span>
              <strong>{shellProfileDisplayName}</strong>
              <small>
                {role === "creator" ? "Instructor" : "Student"} <i />
              </small>
            </span>
            <CaretDown size={16} />
          </button>
          <div className="sidebar-appearance" aria-label="Appearance controls">
            {sidebarCollapsed ? (
              <button
                ref={collapsedPaletteTriggerRef}
                data-palette-trigger
                type="button"
                className="is-active"
                aria-label={
                  paletteMenu
                    ? "Close color theme chooser"
                    : `Switch to ${theme === "dark" ? "light" : "dark"} mode`
                }
                onClick={(event) => {
                  if (consumeAppearanceSwipeClick(event)) return;
                  if (paletteMenu) cancelDesktopPalettePreview();
                  else toggleAppearance();
                }}
                onPointerDown={(event) => startAppearanceSwipe(event, "mode")}
                onPointerUp={(event) => finishAppearanceSwipe(event, "mode")}
                onPointerCancel={cancelAppearanceSwipe}
              >
                {paletteMenu ? (
                  <Palette size={18} />
                ) : theme === "dark" ? (
                  <Moon size={18} />
                ) : (
                  <Sun size={18} />
                )}
                <span>
                  {paletteMenu ? "Theme" : theme === "dark" ? "Dark" : "Light"}
                </span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={theme === "light" ? "is-active" : ""}
                  aria-pressed={theme === "light"}
                  onClick={(event) => {
                    if (consumeAppearanceSwipeClick(event)) return;
                    activateAppearanceOption("light");
                  }}
                  onPointerDown={(event) =>
                    startAppearanceSwipe(event, "light")
                  }
                  onPointerUp={(event) => finishAppearanceSwipe(event, "light")}
                  onPointerCancel={cancelAppearanceSwipe}
                >
                  <Sun size={18} />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  className={theme === "dark" ? "is-active" : ""}
                  aria-pressed={theme === "dark"}
                  onClick={(event) => {
                    if (consumeAppearanceSwipeClick(event)) return;
                    activateAppearanceOption("dark");
                  }}
                  onPointerDown={(event) => startAppearanceSwipe(event, "dark")}
                  onPointerUp={(event) => finishAppearanceSwipe(event, "dark")}
                  onPointerCancel={cancelAppearanceSwipe}
                >
                  <Moon size={18} />
                  <span>Dark</span>
                </button>
              </>
            )}
            {!sidebarCollapsed && showSidebarThemeIcon && (
              <div className="sidebar-palette-wrap">
                <button
                  ref={paletteTriggerRef}
                  data-palette-trigger
                  type="button"
                  className="sidebar-palette-trigger"
                  aria-label="Choose color theme"
                  aria-expanded={paletteMenu}
                  aria-pressed={paletteMenu}
                  onClick={(event) => {
                    if (consumeAppearanceSwipeClick(event)) return;
                    if (paletteMenu) cancelDesktopPalettePreview();
                    else setPaletteMenu(true);
                  }}
                  onPointerDown={(event) =>
                    startAppearanceSwipe(event, "theme")
                  }
                  onPointerUp={(event) => finishAppearanceSwipe(event, "theme")}
                  onPointerCancel={cancelAppearanceSwipe}
                >
                  <Palette size={19} />
                  <i
                    style={{
                      background: academyThemes.find(
                        (item) => item.id === displayedAcademyTheme,
                      )?.preview,
                    }}
                  />
                </button>
                {paletteMenu && (
                  <AcademyPaletteMenu
                    themes={academyThemes}
                    selectedTheme={displayedAcademyTheme}
                    onSelect={selectAcademyTheme}
                    onPreview={setPalettePreviewTheme}
                    onConfirm={confirmDesktopPaletteTheme}
                    onCancel={cancelDesktopPalettePreview}
                  />
                )}
              </div>
            )}
            {sidebarCollapsed && showSidebarThemeIcon && paletteMenu && (
              <AcademyPaletteMenu
                themes={academyThemes}
                selectedTheme={displayedAcademyTheme}
                className="sidebar-palette-menu sidebar-palette-menu--collapsed"
                onSelect={selectAcademyTheme}
                onPreview={setPalettePreviewTheme}
                onConfirm={confirmDesktopPaletteTheme}
                onCancel={cancelDesktopPalettePreview}
              />
            )}
          </div>
        </div>
      </aside>

      {sidebarTooltip && (
        <div
          className={`sidebar-nav-tooltip${sidebarTooltip.active ? " is-active" : ""}${sidebarTooltip.focusVisible ? " is-focus-visible" : ""}`}
          aria-hidden="true"
          style={
            {
              "--sidebar-tooltip-top": `${sidebarTooltip.top}px`,
              "--sidebar-tooltip-left": `${sidebarTooltip.left}px`,
            } as CSSProperties
          }
        >
          <svg
            className="sidebar-nav-tooltip__pointer"
            viewBox="0 0 9 20"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M9 0C9 3.2 7.8 4.7 5.5 6.2L0.9 9.2C0.3 9.6 0.3 10.4 0.9 10.8L5.5 13.8C7.8 15.3 9 16.8 9 20Z" />
          </svg>
          <span className="sidebar-nav-tooltip__label">
            {sidebarTooltip.label}
          </span>
        </div>
      )}

      <main
        className={`courses-main ${renderMain ? "courses-main--learning" : page !== "courses" ? "student-surface-main" : ""}`}
      >
        {renderMain ? (
          renderMain()
        ) : role === "creator" && page === "home" ? (
          <CreatorDashboard
            onNavigatePage={onNavigatePage}
            setNotice={setNotice}
            academyTheme={academyTheme}
          />
        ) : role === "student" && page === "home" ? (
          <StudentHome
            onOpenCourse={onOpenCourse}
            onNavigatePage={onNavigatePage}
            studentName={shellProfileDisplayName}
          />
        ) : role === "student" && page === "my-learning" ? (
          <MyLearningPage
            onOpenCourse={onOpenCourse}
            wishlisted={wishlisted}
            onWishlist={toggleWishlist}
            setNotice={setNotice}
          />
        ) : page === "settings" ? (
          <SettingsPage
            tab={settingsTab}
            role={role}
            onNavigatePage={onNavigatePage}
            onProfileSaved={(profile) => {
              setSavedShellProfiles((current) => ({
                ...current,
                [role]: profile,
              }));
            }}
            theme={theme}
            onThemeChange={setTheme}
            academyTheme={academyTheme}
            onAcademyThemeChange={setAcademyTheme}
            sidebarPreferences={sidebarPreferences}
            onSidebarPreferencesChange={setSidebarPreferences}
            sidebarMode={sidebarMode}
            onSidebarModeChange={setSidebarMode}
          />
        ) : page === "workspace" ? (
          <WorkspacePage
            section={requestedSection || activeSection}
            role={role}
            onNavigatePage={onNavigatePage}
            setNotice={setNotice}
            onSignOut={() => {
              localStorage.removeItem("veolms-role");
              sessionStorage.removeItem("veolms-course-section");
              setRole("student");
            }}
          />
        ) : page === "placeholder" ? (
          <PlaceholderPage
            section={requestedSection || activeSection}
            role={role}
          />
        ) : (
          <CourseCatalogue
            activeSection={activeSection}
            role={role}
            wishlisted={wishlisted}
            enrollmentFilter={enrollmentFilter}
            onEnrollmentFilterChange={setEnrollmentFilter}
            search={search}
            onSearchChange={setSearch}
            sort={sort}
            onSortChange={setSort}
            category={category}
            onCategoryChange={setCategory}
            visibleCourses={visibleCourses}
            onWishlist={toggleWishlist}
            onOpenCourse={onOpenCourse}
            courseMenu={courseMenu}
            setCourseMenu={setCourseMenu}
            setNotice={setNotice}
            onNavigatePage={onNavigatePage}
            onResetCatalogue={resetCatalogue}
          />
        )}
      </main>

      <nav
        className="mobile-bottom-nav"
        aria-label={`${role === "creator" ? "Creator" : "Student"} mobile navigation`}
      >
        {mobileNavigation.map(([label, Icon]) => {
          const active = activeSection === label;
          const displayLabel = getNavigationDisplayLabel(label, page);
          return (
            <button
              type="button"
              key={label}
              className={active ? "is-active" : ""}
              style={
                {
                  "--nav-icon-color": getNavigationIconColor(
                    label,
                    sidebarPreferences,
                  ),
                } as CSSProperties
              }
              aria-current={active ? "page" : undefined}
              aria-label={
                label === "Wishlist" && wishlisted.size > 0
                  ? `${displayLabel} (${wishlisted.size})`
                  : displayLabel
              }
              onClick={() => selectNavigation(label)}
            >
              <span>
                <Icon size={23} weight={active ? "fill" : "regular"} />
                {label === "Wishlist" && wishlisted.size > 0 && (
                  <b>{wishlisted.size}</b>
                )}
              </span>
              <small>{displayLabel}</small>
            </button>
          );
        })}
        <button
          ref={mobileMoreRef}
          type="button"
          className={mobileMoreActive ? "is-active" : ""}
          aria-label="More navigation options"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-sheet"
          onClick={() => {
            setMobilePaletteMenu(false);
            setMobileMenuOpen(true);
          }}
        >
          <span>
            <DotsThreeCircle
              size={24}
              weight={mobileMoreActive ? "fill" : "regular"}
            />
          </span>
          <small>More</small>
        </button>
      </nav>

      {mobileMenuOpen && (
        <div
          className="mobile-menu-layer"
          role="presentation"
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            event.preventDefault();
            event.stopPropagation();
            closeMobileMenu();
          }}
        >
          <section
            ref={mobileSheetRef}
            id="mobile-navigation-sheet"
            className={`mobile-menu-sheet${mobileSheetOffset > 0 ? " is-dragging" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-navigation-title"
            tabIndex={-1}
            style={
              {
                "--mobile-sheet-offset": `${mobileSheetOffset}px`,
              } as CSSProperties
            }
            onPointerDownCapture={(event) => {
              if (
                mobilePaletteMenu &&
                (!(event.target instanceof Element) ||
                  (!event.target.closest("[data-mobile-palette-menu]") &&
                    !event.target.closest("[data-mobile-palette-trigger]")))
              )
                setMobilePaletteMenu(false);
            }}
            onPointerDown={startMobileSheetDrag}
            onPointerMove={moveMobileSheetDrag}
            onPointerUp={finishMobileSheetDrag}
            onPointerCancel={finishMobileSheetDrag}
            onTouchStart={startMobileSheetTouch}
            onTouchMove={moveMobileSheetTouch}
            onTouchEnd={finishMobileSheetTouch}
            onTouchCancel={finishMobileSheetTouch}
            onClickCapture={(event) => {
              if (!mobileDragConsumedRef.current) return;
              event.preventDefault();
              event.stopPropagation();
              mobileDragConsumedRef.current = false;
            }}
          >
            <div className="mobile-menu-sheet__drag-zone">
              <span aria-hidden="true" />
            </div>
            <div className="mobile-menu-sheet__heading">
              <div>
                <h2 id="mobile-navigation-title">More</h2>
                <p>All academy navigation</p>
              </div>
            </div>
            <div className="mobile-menu-sheet__profile">
              <ShellProfileAvatar
                avatarUrl={shellProfileAvatarUrl}
                displayName={shellProfileDisplayName}
              />
              <span>
                <strong>{shellProfileDisplayName}</strong>
                <small>{role === "creator" ? "Instructor" : "Student"}</small>
              </span>
            </div>
            <nav
              className="mobile-menu-sheet__list"
              aria-label="All navigation options"
            >
              {navigation.map(([label, Icon]) => {
                const active = activeSection === label;
                const displayLabel = getNavigationDisplayLabel(label, page);
                return (
                  <button
                    type="button"
                    key={label}
                    className={active ? "is-active" : ""}
                    style={
                      {
                        "--nav-icon-color": getNavigationIconColor(
                          label,
                          sidebarPreferences,
                        ),
                      } as CSSProperties
                    }
                    aria-current={active ? "page" : undefined}
                    onClick={() => selectNavigation(label)}
                  >
                    <Icon size={23} weight={active ? "fill" : "regular"} />
                    <span>{displayLabel}</span>
                    {label === "Wishlist" && wishlisted.size > 0 && (
                      <b>{wishlisted.size}</b>
                    )}
                  </button>
                );
              })}
            </nav>
            <div
              className="mobile-menu-sheet__appearance"
              aria-label="Appearance controls"
            >
              <button
                type="button"
                className={theme === "light" ? "is-active" : ""}
                aria-pressed={theme === "light"}
                onClick={(event) => {
                  if (consumeAppearanceSwipeClick(event)) return;
                  activateAppearanceOption("light", true);
                }}
                onPointerDown={(event) => startAppearanceSwipe(event, "light")}
                onPointerUp={(event) =>
                  finishAppearanceSwipe(event, "light", true)
                }
                onPointerCancel={cancelAppearanceSwipe}
              >
                <Sun size={19} /> Light
              </button>
              <button
                type="button"
                className={theme === "dark" ? "is-active" : ""}
                aria-pressed={theme === "dark"}
                onClick={(event) => {
                  if (consumeAppearanceSwipeClick(event)) return;
                  activateAppearanceOption("dark", true);
                }}
                onPointerDown={(event) => startAppearanceSwipe(event, "dark")}
                onPointerUp={(event) =>
                  finishAppearanceSwipe(event, "dark", true)
                }
                onPointerCancel={cancelAppearanceSwipe}
              >
                <Moon size={19} /> Dark
              </button>
              {showSidebarThemeIcon && (
                <button
                  ref={mobilePaletteTriggerRef}
                  data-palette-trigger
                  data-mobile-palette-trigger
                  type="button"
                  className={mobilePaletteMenu ? "is-active" : ""}
                  aria-haspopup="menu"
                  aria-expanded={mobilePaletteMenu}
                  aria-controls="mobile-theme-menu"
                  aria-label={`Choose color theme. Current theme: ${academyThemes[currentAcademyThemeIndex]?.name}`}
                  onClick={(event) => {
                    if (consumeAppearanceSwipeClick(event)) return;
                    if (mobilePaletteMenu) cancelMobilePalettePreview();
                    else setMobilePaletteMenu(true);
                  }}
                  onPointerDown={(event) =>
                    startAppearanceSwipe(event, "theme")
                  }
                  onPointerUp={(event) =>
                    finishAppearanceSwipe(event, "theme", true)
                  }
                  onPointerCancel={cancelAppearanceSwipe}
                >
                  <Palette size={19} /> Theme
                  <i
                    style={{
                      background: academyThemes.find(
                        (item) => item.id === displayedAcademyTheme,
                      )?.preview,
                    }}
                  />
                </button>
              )}
            </div>
            {showSidebarThemeIcon && mobilePaletteMenu && (
              <AcademyPaletteMenu
                themes={academyThemes}
                selectedTheme={displayedAcademyTheme}
                id="mobile-theme-menu"
                className="sidebar-palette-menu mobile-palette-menu"
                mobile
                onSelect={selectAcademyTheme}
                onPreview={setPalettePreviewTheme}
                onConfirm={confirmMobilePaletteTheme}
                onCancel={cancelMobilePalettePreview}
              />
            )}
          </section>
        </div>
      )}

      {notice && (
        <div className="courses-toast" role="status">
          <Question size={18} /> {notice}
        </div>
      )}
    </div>
  );
}
