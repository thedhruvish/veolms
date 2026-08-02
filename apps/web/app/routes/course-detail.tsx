import type { LoaderFunctionArgs, MetaFunction } from "react-router";

import { academy, pageTitle } from "../config/academy.ts";
import { getCourse } from "../lib/api.ts";

async function loadCourse(slug: string | undefined, baseUrl?: string) {
  if (!slug) {
    throw new Response("Course not found", { status: 404 });
  }

  const course = await getCourse(slug, baseUrl);

  if (!course) {
    throw new Response("Course not found", { status: 404 });
  }

  return { course };
}

export async function loader({ params }: LoaderFunctionArgs) {
  return loadCourse(params.slug, import.meta.env.STATIC_BUILD_API_URL);
}

export async function clientLoader({ params }: LoaderFunctionArgs) {
  return loadCourse(params.slug);
}

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => [
  {
    title: pageTitle(loaderData?.course.title ?? "Course"),
  },
];

export default function CourseDetail({
  loaderData,
}: {
  loaderData: Awaited<ReturnType<typeof loader>>;
}) {
  const { course } = loaderData;

  return (
    <main className="page-shell py-16">
      <p className="eyebrow">{academy.name}</p>
      <h1 className="heading mt-3 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">
        {course.title}
      </h1>
      <p className="muted mt-6 max-w-3xl text-lg leading-8">
        {course.description}
      </p>

      <section className="content-card mt-12 max-w-3xl p-6">
        <h2 className="heading text-xl font-semibold">Curriculum</h2>
        <p className="muted mt-2">Curriculum will be added later.</p>
        <button className="disabled-button mt-6" disabled type="button">
          Enrolment will be added later
        </button>
      </section>
    </main>
  );
}
