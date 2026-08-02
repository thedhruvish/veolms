import type { MetaFunction } from "react-router";
import { Link } from "react-router";

import { CourseCard } from "../components/course-card.tsx";
import { academy, pageTitle } from "../config/academy.ts";
import { getCourses } from "../lib/api.ts";

export const meta: MetaFunction = () => [
  { title: pageTitle() },
  {
    name: "description",
    content: academy.description,
  },
];

export async function loader() {
  return {
    courses: await getCourses(import.meta.env.STATIC_BUILD_API_URL),
  };
}

export async function clientLoader() {
  return { courses: await getCourses() };
}

export default function Home({
  loaderData,
}: {
  loaderData: Awaited<ReturnType<typeof loader>>;
}) {
  return (
    <main>
      <section className="page-shell py-20 sm:py-28">
        <p className="eyebrow">{academy.name}</p>
        <h1 className="heading mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
          {academy.home.headline}
        </h1>
        <p className="muted mt-6 max-w-2xl text-lg leading-8">
          {academy.home.introduction}
        </p>
        <Link className="primary-link mt-8" to="/courses">
          Browse courses
        </Link>
      </section>

      <section className="surface-section border-t py-16">
        <div className="page-shell">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Course catalogue</p>
              <h2 className="heading mt-2 text-3xl font-semibold">
                Start learning
              </h2>
            </div>
            <Link className="text-link" to="/courses">
              View all
            </Link>
          </div>
          <div className="course-grid">
            {loaderData.courses.map((course) => (
              <CourseCard course={course} key={course.id} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
