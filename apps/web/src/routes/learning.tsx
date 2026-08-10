import { useOutletContext, useParams } from "react-router";
import type { Route } from "./+types/learning";
import { LearningWorkspace } from "../learning/LearningWorkspace";
import { getRouteMeta } from "../routing/routeDescriptors";
import type { AcademyOutletContext } from "./academy-layout";

export function meta({ location, params }: Route.MetaArgs) {
  return Object.entries(
    getRouteMeta("learning", params, location.pathname),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
}

export default function LearningRoute() {
  const { courseSlug } = useParams();
  const { navigateTo } = useOutletContext<AcademyOutletContext>();

  return (
    <LearningWorkspace
      key={courseSlug}
      courseSlug={courseSlug}
      onNavigateCourses={() => navigateTo("/courses")}
    />
  );
}
