import { useCallback } from "react";
import { Outlet, useLocation, useMatches, useNavigate } from "react-router";
import { CoursesPage } from "../CoursesPage";
import type { Course } from "../courses/catalogue";
import type { LearningCourse } from "../StudentPages";
import {
  getDestinationPath,
  getMatchedRouteDescriptor,
  normalizeNavigationPath,
} from "../routing/routeDescriptors";

export type NavigateTo = (destination: string) => void;

export interface AcademyOutletContext {
  navigateTo: NavigateTo;
}

export default function AcademyLayout() {
  const matches = useMatches();
  const location = useLocation();
  const navigate = useNavigate();
  const route = getMatchedRouteDescriptor(matches, location.pathname);

  const navigateTo: NavigateTo = useCallback(
    (destination) => {
      const path = getDestinationPath(destination);
      if (
        normalizeNavigationPath(path) !==
        normalizeNavigationPath(location.pathname)
      ) {
        void navigate(path);
      }
      window.scrollTo({ top: 0, behavior: "auto" });
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
