import { useOutletContext, useParams } from "react-router";
import type { Route } from "./+types/learning";
import { CourseOverviewPage } from "../courses/CourseOverviewPage";
import { getRouteMeta } from "../routing/routeDescriptors";
import type { AcademyOutletContext } from "./academy-layout";

export function meta({ location, params }: Route.MetaArgs) {
  return Object.entries(
    getRouteMeta("course-overview", params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function CourseOverviewRoute() {
  const { courseSlug } = useParams();
  const { navigateTo } = useOutletContext<AcademyOutletContext>();

  return (
    <CourseOverviewPage
      key={courseSlug}
      courseSlug={courseSlug}
      onNavigateCourses={() => navigateTo("/courses")}
      onNavigatePage={navigateTo}
    />
  );
}
