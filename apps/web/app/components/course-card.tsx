import type { CourseSummary } from "@veolms/contracts";
import { Link } from "react-router";

export function CourseCard({ course }: { course: CourseSummary }) {
  return (
    <article className="course-card p-6">
      <h3 className="heading text-xl font-semibold">{course.title}</h3>
      <p className="muted mt-3 leading-7">{course.shortDescription}</p>
      <Link
        className="text-link mt-6 inline-flex"
        to={`/courses/${course.slug}`}
      >
        View course
      </Link>
    </article>
  );
}
