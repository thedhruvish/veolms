import { z } from "zod";
import {
  createCourseSectionRequestSchema,
  updateCourseSectionRequestSchema,
  reorderSectionsRequestSchema,
  createCourseLessonRequestSchema,
  updateCourseLessonRequestSchema,
  reorderLessonsRequestSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";

import { createCoursesContext } from "../shared/courses.context.ts";
import { createCurriculumController } from "./curriculum.controller.ts";
import { createCurriculumService } from "./curriculum.service.ts";

const curriculumRoutes: RoutePlugin = async (app, options) => {
  const ctx = createCoursesContext(options);
  const service = createCurriculumService({
    database: options.database,
    services: options.services,
  });
  const controller = createCurriculumController({ service });

  app.post(
    "/courses/:id/sections",
    {
      schema: {
        operationId: "createCourseSection",
        tags: ["Course Curriculum"],
        summary: "Create a new curriculum section",
        params: z.object({ id: z.string().uuid() }),
        body: createCourseSectionRequestSchema,
        response: {
          201: jsonResponse(
            "Section created",
            z.object({
              id: z.string().uuid(),
              courseId: z.string().uuid(),
              title: z.string(),
              position: z.number(),
            }),
          ),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.createCourseSection,
  );

  app.patch(
    "/courses/:id/sections/:sectionId",
    {
      schema: {
        operationId: "updateCourseSection",
        tags: ["Course Curriculum"],
        summary: "Update curriculum section fields",
        params: z.object({ id: z.string().uuid(), sectionId: z.string().uuid() }),
        body: updateCourseSectionRequestSchema,
        response: {
          200: jsonResponse("Section updated", z.object({ success: z.boolean() })),
          404: errorResponse("Section not found"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.updateCourseSection,
  );

  app.delete(
    "/courses/:id/sections/:sectionId",
    {
      schema: {
        operationId: "deleteCourseSection",
        tags: ["Course Curriculum"],
        summary: "Soft delete a section and all its lessons/resources",
        params: z.object({ id: z.string().uuid(), sectionId: z.string().uuid() }),
        response: {
          200: jsonResponse("Section deleted", z.object({ success: z.boolean() })),
          404: errorResponse("Section not found"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.deleteCourseSection,
  );

  app.post(
    "/courses/:id/sections/reorder",
    {
      schema: {
        operationId: "reorderCourseSections",
        tags: ["Course Curriculum"],
        summary: "Update order of sections",
        params: z.object({ id: z.string().uuid() }),
        body: reorderSectionsRequestSchema,
        response: {
          200: jsonResponse(
            "Sections reordered",
            z.object({ success: z.boolean() }),
          ),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.reorderCourseSections,
  );

  app.post(
    "/courses/:id/sections/:sectionId/lessons",
    {
      schema: {
        operationId: "createCourseLesson",
        tags: ["Course Curriculum"],
        summary: "Create a new curriculum lesson",
        params: z.object({ id: z.string().uuid(), sectionId: z.string().uuid() }),
        body: createCourseLessonRequestSchema,
        response: {
          201: jsonResponse(
            "Lesson created",
            z.object({ id: z.string().uuid(), position: z.number() }),
          ),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.createCourseLesson,
  );

  app.patch(
    "/courses/:id/lessons/:lessonId",
    {
      schema: {
        operationId: "updateCourseLesson",
        tags: ["Course Curriculum"],
        summary: "Update curriculum lesson fields",
        params: z.object({ id: z.string().uuid(), lessonId: z.string().uuid() }),
        body: updateCourseLessonRequestSchema,
        response: {
          200: jsonResponse(
            "Lesson details updated",
            z.object({ success: z.boolean() }),
          ),
          202: jsonResponse(
            "Video processing accepted",
            z.object({
              videoJobId: z.string().uuid(),
              processingStatus: z.enum([
                "queued",
                "processing",
                "completed",
                "failed",
              ]),
            }),
          ),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.updateCourseLesson,
  );

  app.delete(
    "/courses/:id/lessons/:lessonId",
    {
      schema: {
        operationId: "deleteCourseLesson",
        tags: ["Course Curriculum"],
        summary: "Soft delete a lesson",
        params: z.object({ id: z.string().uuid(), lessonId: z.string().uuid() }),
        response: {
          200: jsonResponse("Lesson deleted", z.object({ success: z.boolean() })),
          404: errorResponse("Lesson not found"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.deleteCourseLesson,
  );

  app.post(
    "/courses/:id/sections/:sectionId/lessons/reorder",
    {
      schema: {
        operationId: "reorderSectionLessons",
        tags: ["Course Curriculum"],
        summary: "Update position of lessons inside a section",
        params: z.object({ id: z.string().uuid(), sectionId: z.string().uuid() }),
        body: reorderLessonsRequestSchema,
        response: {
          200: jsonResponse("Lessons reordered", z.object({ success: z.boolean() })),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.reorderSectionLessons,
  );

  app.post(
    "/courses/:id/lessons/:lessonId/resources",
    {
      schema: {
        operationId: "addLessonResource",
        tags: ["Course Curriculum"],
        summary: "Attach resource to lesson",
        params: z.object({ id: z.string().uuid(), lessonId: z.string().uuid() }),
        body: z.object({
          mediaAssetId: z.string().uuid(),
          title: z.string().min(1).max(100),
          description: z.string().max(255).optional(),
        }),
        response: {
          201: jsonResponse(
            "Resource added",
            z.object({ id: z.string().uuid(), position: z.number() }),
          ),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.addLessonResource,
  );

  app.delete(
    "/courses/:id/resources/:resourceId",
    {
      schema: {
        operationId: "removeLessonResource",
        tags: ["Course Curriculum"],
        summary: "Remove resource from lesson",
        params: z.object({ id: z.string().uuid(), resourceId: z.string().uuid() }),
        response: {
          200: jsonResponse("Resource removed", z.object({ success: z.boolean() })),
          404: errorResponse("Resource not found"),
        },
      },
      preHandler: ctx.requireCourseAuthor,
    },
    controller.removeLessonResource,
  );
};

export default curriculumRoutes;
