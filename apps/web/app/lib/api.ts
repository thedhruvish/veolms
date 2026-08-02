import {
  courseListResponseSchema,
  publicCourseSchema,
  type CourseSummary,
  type PublicCourse,
} from "@veolms/contracts";

function apiUrl(pathname: string, baseUrl?: string): string {
  const base = baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
  return `${base.replace(/\/$/, "")}/${pathname.replace(/^\//, "")}`;
}

export async function getCourses(baseUrl?: string): Promise<CourseSummary[]> {
  const response = await fetch(apiUrl("courses", baseUrl));

  if (!response.ok) {
    throw new Error(`Unable to load courses (${response.status}).`);
  }

  return courseListResponseSchema.parse(await response.json()).courses;
}

export async function getCourse(
  slug: string,
  baseUrl?: string,
): Promise<PublicCourse | undefined> {
  const response = await fetch(
    apiUrl(`courses/${encodeURIComponent(slug)}`, baseUrl),
  );

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(`Unable to load the course (${response.status}).`);
  }

  return publicCourseSchema.parse(await response.json());
}
