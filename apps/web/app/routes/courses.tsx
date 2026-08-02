import type { MetaFunction } from "react-router";

import { CourseCard } from "../components/course-card.tsx";
import { academy, pageTitle } from "../config/academy.ts";
import { getCourses } from "../lib/api.ts";

export const meta: MetaFunction = () => [{ title: pageTitle("Courses") }];

export async function loader() {
  return {
    courses: await getCourses(import.meta.env.STATIC_BUILD_API_URL),
  };
}

export async function clientLoader() {
  return { courses: await getCourses() };
}

export default function Courses({
  loaderData,
}: {
  loaderData: Awaited<ReturnType<typeof loader>>;
}) {
  return (
    <main className="page-shell py-16">
      <p className="eyebrow">Course catalogue</p>
      <h1 className="heading mt-3 text-4xl font-semibold">Courses</h1>
      <p className="muted mt-4 max-w-2xl text-lg">
        {academy.catalogue.introduction}
      </p>
      <div className="course-grid mt-10">
        {loaderData.courses.map((course) => (
          <CourseCard course={course} key={course.id} />
        ))}
      </div>
    </main>
  );
}
