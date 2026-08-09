import { z } from "zod";

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
}

export interface PublicCourse extends CourseSummary {
  description: string;
}

const courseSummaryObjectSchema = z.strictObject({
  id: z.uuid().meta({ description: "Stable identifier of the course." }),
  slug: z
    .string()
    .min(1)
    .meta({ description: "URL-safe identifier used to address the course." }),
  title: z.string().min(1).meta({ description: "Course title." }),
  shortDescription: z
    .string()
    .min(1)
    .meta({ description: "One-line summary shown in catalogue listings." }),
});

export const courseSummarySchema: z.ZodType<CourseSummary> =
  courseSummaryObjectSchema;

export const publicCourseSchema: z.ZodType<PublicCourse> =
  courseSummaryObjectSchema.extend({
    description: z
      .string()
      .min(1)
      .meta({ description: "Full course description." }),
  });

export const courseListResponseSchema = z.strictObject({
  courses: z
    .array(courseSummarySchema)
    .meta({ description: "Published courses, oldest first." }),
});

export const courseSlugSchema = z
  .string()
  .min(1)
  .max(160)
  .meta({ description: "URL-safe identifier used to address the course." });

// Name the shared contracts so the API documents them as reusable OpenAPI
// components instead of inlining a copy at every use site. Registering by
// reference keeps the schema identity these exports already share — `.meta()`
// returns a clone, which would leave the nested uses above pointing at an
// unnamed schema.
z.globalRegistry.add(courseSummarySchema, {
  id: "CourseSummary",
  description: "A course as it appears in catalogue listings.",
});
z.globalRegistry.add(publicCourseSchema, {
  id: "PublicCourse",
  description: "A published course, including its full description.",
});
z.globalRegistry.add(courseListResponseSchema, {
  id: "CourseListResponse",
  description: "The published course catalogue.",
});
