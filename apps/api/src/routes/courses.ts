import { courseSlugSchema } from "@veolms/contracts";
import {
  findPublishedCourseBySlug,
  listPublishedCourses,
  type Database,
} from "@veolms/database";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";

export function registerCourseRoutes(
  app: FastifyInstance,
  database: Kysely<Database>,
): void {
  app.get("/api/v1/courses", async () => ({
    courses: await listPublishedCourses(database),
  }));

  app.get<{ Params: { slug: string } }>(
    "/api/v1/courses/:slug",
    async (request, reply) => {
      const parsedSlug = courseSlugSchema.safeParse(request.params.slug);

      if (!parsedSlug.success) {
        return reply.code(404).send({ message: "Course not found" });
      }

      const course = await findPublishedCourseBySlug(database, parsedSlug.data);

      if (!course) {
        return reply.code(404).send({ message: "Course not found" });
      }

      return course;
    },
  );
}
