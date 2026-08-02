import type { Config } from "@react-router/dev/config";
import { loadWebConfig } from "@veolms/config";
import { courseListResponseSchema } from "@veolms/contracts";

const config = loadWebConfig(process.env);

export default {
  ssr: false,
  async prerender() {
    const response = await fetch(`${config.STATIC_BUILD_API_URL}/courses`);

    if (!response.ok) {
      throw new Error(
        `Unable to load course paths from the API (${response.status}).`,
      );
    }

    const { courses } = courseListResponseSchema.parse(await response.json());

    return [
      "/",
      "/courses",
      "/login",
      "/register",
      ...courses.map((course) => `/courses/${course.slug}`),
    ];
  },
} satisfies Config;
