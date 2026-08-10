import { useCallback, useLayoutEffect, useRef } from "react";
import { Outlet, useLocation, useMatches, useNavigate } from "react-router";
import { CoursesPage } from "../CoursesPage";
import type { Course } from "../courses/catalogue";
import type { LearningCourse } from "../StudentPages";
import type { NavigateTo } from "../routing/navigation";
import {
  getDestinationPath,
  getMatchedRouteDescriptor,
  normalizeNavigationPath,
} from "../routing/routeDescriptors";

export interface AcademyOutletContext {
  navigateTo: NavigateTo;
}

export default function AcademyLayout() {
  const matches = useMatches();
  const location = useLocation();
  const navigate = useNavigate();
  const preservedScrollPositionRef = useRef<{
    left: number;
    top: number;
  } | null>(null);
  const route = getMatchedRouteDescriptor(matches, location.pathname);

  useLayoutEffect(() => {
    const position = preservedScrollPositionRef.current;
    if (!position) return undefined;
    preservedScrollPositionRef.current = null;

    window.scrollTo({ ...position, behavior: "auto" });
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ ...position, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  const navigateTo: NavigateTo = useCallback(
    (destination, options) => {
      const path = getDestinationPath(destination);
      if (
        normalizeNavigationPath(path) !==
        normalizeNavigationPath(location.pathname)
      ) {
        if (options?.preserveScroll) {
          preservedScrollPositionRef.current = {
            left: window.scrollX,
            top: window.scrollY,
          };
        }
        void navigate(path, {
          preventScrollReset: options?.preserveScroll,
        });
      }
      if (!options?.preserveScroll) {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    },
    [location.pathname, navigate],
  );

  const openCourse = useCallback(
    (course: Course | LearningCourse) => {
      localStorage.setItem("veolms-current-course-title", course.title);
      localStorage.setItem("veolms-current-course-id", course.id);
      navigateTo(`/courses/${encodeURIComponent(course.id)}`);
    },
    [navigateTo],
  );

  return (
    <CoursesPage
      page={route.page}
      section={route.section}
      settingsTab={route.settingsTab}
      discussionTab={route.discussionTab}
      onNavigatePage={navigateTo}
      onOpenCourse={openCourse}
      renderMain={
        route.kind === "learning"
          ? () => (
              <Outlet context={{ navigateTo } satisfies AcademyOutletContext} />
            )
          : null
      }
    />
  );
}
