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

const courseSummaryObjectSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  shortDescription: z.string().min(1),
});

export const courseSummarySchema: z.ZodType<CourseSummary> =
  courseSummaryObjectSchema;

export const publicCourseSchema: z.ZodType<PublicCourse> =
  courseSummaryObjectSchema.extend({
    description: z.string().min(1),
  });

export const courseListResponseSchema = z.object({
  courses: z.array(courseSummarySchema),
});

export const courseSlugSchema = z.string().min(1).max(160);
