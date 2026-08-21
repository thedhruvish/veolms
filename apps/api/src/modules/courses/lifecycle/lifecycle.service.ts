import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type { CourseValidationIssue } from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import type { AppServices } from "../../../services/index.ts";
import * as courseRepo from "../course/course.repository.ts";
import * as curriculumRepo from "../curriculum/curriculum.repository.ts";
import * as configRepo from "../configuration/configuration.repository.ts";
import * as mediaRepo from "../media/media.repository.ts";
import { createCourseService } from "../course/course.service.ts";

export interface LifecycleServiceOptions {
  database: Kysely<Database>;
  services: AppServices;
}

export function createLifecycleService({
  database,
  services,
}: LifecycleServiceOptions) {
  const courseService = createCourseService({ database, services });

  async function getCourseAndVerifyOwner(courseId: string, creatorId: string) {
    const course = await courseRepo.findCourseById(database, courseId);
    if (!course) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }
    if (course.creator_id !== creatorId) {
      throw new AppError(403, "FORBIDDEN", "Unauthorized course access.");
    }
    return course;
  }

  /**
   * Validates a course to ensure all requirements are satisfied prior to publishing.
   */
  async function validateCourse(
    courseId: string,
    creatorId: string,
  ): Promise<CourseValidationIssue[]> {
    const issues: CourseValidationIssue[] = [];

    const course = await getCourseAndVerifyOwner(courseId, creatorId);

    // 1. Course Basics validation
    if (!course.title || course.title.trim().length === 0) {
      issues.push({
        code: "MISSING_TITLE",
        message: "Course title is required.",
      });
    }

    if (!course.description || course.description.trim().length === 0) {
      issues.push({
        code: "MISSING_DESCRIPTION",
        message: "Course description is required.",
      });
    }

    if (!course.category_id) {
      issues.push({
        code: "MISSING_CATEGORY",
        message: "Course must have a category selected.",
      });
    }

    if (!course.thumbnail_media_id) {
      issues.push({
        code: "MISSING_THUMBNAIL",
        message: "Course thumbnail is required.",
      });
    } else {
      const thumb = await mediaRepo.findMediaAssetById(
        database,
        course.thumbnail_media_id,
        creatorId,
      );
      if (!thumb || thumb.status !== "uploaded") {
        issues.push({
          code: "INVALID_THUMBNAIL",
          message: "Thumbnail media must be fully uploaded.",
        });
      }
    }

    // 2. Curriculum validation
    const sections = await curriculumRepo.findSectionsByCourseId(
      database,
      courseId,
    );
    if (sections.length === 0) {
      issues.push({
        code: "EMPTY_CURRICULUM",
        message: "Course must contain at least one section.",
      });
    }

    const lessons = await curriculumRepo.findLessonsByCourseId(
      database,
      courseId,
    );
    if (lessons.length === 0) {
      issues.push({
        code: "NO_LESSONS",
        message: "Course must contain at least one lesson.",
      });
    }

    for (const section of sections) {
      const sectionLessons = lessons.filter((l) => l.section_id === section.id);
      if (sectionLessons.length === 0) {
        issues.push({
          code: "EMPTY_SECTION",
          message: `Section "${section.title}" has no lessons.`,
        });
      }
    }

    // Validate media status for all lessons
    for (const lesson of lessons) {
      if (!lesson.content_media_id) {
        issues.push({
          code: "LESSON_MISSING_CONTENT",
          message: `Lesson "${lesson.title}" does not have media content attached.`,
        });
      } else {
        const media = await mediaRepo.findMediaAssetById(
          database,
          lesson.content_media_id,
          creatorId,
        );
        if (!media) {
          issues.push({
            code: "LESSON_MEDIA_NOT_FOUND",
            message: `Media for lesson "${lesson.title}" was not found.`,
          });
        } else if (lesson.content_type === "video") {
          if (media.status !== "ready") {
            issues.push({
              code: "VIDEO_PROCESSING_INCOMPLETE",
              message: `Video for lesson "${lesson.title}" is still processing or failed.`,
            });
          }
        } else if (lesson.content_type === "document") {
          if (media.status !== "uploaded") {
            issues.push({
              code: "DOCUMENT_NOT_UPLOADED",
              message: `Document for lesson "${lesson.title}" is not completely uploaded.`,
            });
          }
        }
      }
    }

    // 3. Configuration validation
    const accessRules = await configRepo.findAccessRuleByCourseId(
      database,
      courseId,
    );
    if (!accessRules) {
      issues.push({
        code: "MISSING_ACCESS_RULES",
        message: "Course access rules have not been configured.",
      });
    }

    const pricing = await configRepo.findPricingByCourseId(database, courseId);
    if (!pricing) {
      issues.push({
        code: "MISSING_PRICING",
        message: "Course pricing has not been configured.",
      });
    } else if (pricing.pricing_type === "paid" && pricing.price <= 0) {
      issues.push({
        code: "INVALID_PRICE",
        message: "Paid courses must have a price greater than 0.",
      });
    }

    return issues;
  }

  async function publishCourse(courseId: string, creatorId: string) {
    const course = await getCourseAndVerifyOwner(courseId, creatorId);

    const issues = await validateCourse(courseId, creatorId);
    if (issues.length > 0) {
      throw new AppError(
        400,
        "VALIDATION_FAILED",
        `Cannot publish course due to unresolved issues: ${issues.map((i) => i.message).join("; ")}`,
      );
    }

    const now = new Date();
    await courseRepo.updateCourse(database, courseId, course.version, {
      status: "published",
      published_at: now,
      version: course.version + 1,
      updated_at: now,
    });

    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      shortDescription: course.short_description,
      description: course.description,
      difficulty: course.difficulty as
        | "beginner"
        | "intermediate"
        | "advanced"
        | null,
      status: "published" as const,
      creatorId: course.creator_id as string,
      categoryId: course.category_id,
      thumbnailMediaId: course.thumbnail_media_id,
      trailerMediaId: course.trailer_media_id,
      version: course.version + 1,
      createdAt: course.created_at.toISOString(),
      updatedAt: now.toISOString(),
      publishedAt: now.toISOString(),
    };
  }

  async function unpublishCourse(courseId: string, creatorId: string) {
    const course = await getCourseAndVerifyOwner(courseId, creatorId);

    const now = new Date();
    await courseRepo.updateCourse(database, courseId, course.version, {
      status: "draft",
      version: course.version + 1,
      updated_at: now,
    });

    return {
      id: course.id,
      slug: course.slug,
      title: course.title,
      shortDescription: course.short_description,
      description: course.description,
      difficulty: course.difficulty as
        | "beginner"
        | "intermediate"
        | "advanced"
        | null,
      status: "draft" as const,
      creatorId: course.creator_id as string,
      categoryId: course.category_id,
      thumbnailMediaId: course.thumbnail_media_id,
      trailerMediaId: course.trailer_media_id,
      version: course.version + 1,
      createdAt: course.created_at.toISOString(),
      updatedAt: now.toISOString(),
      publishedAt: course.published_at?.toISOString() ?? null,
    };
  }

  async function previewCourseDraft(courseId: string, creatorId: string) {
    return await courseService.getCourseEditorData(courseId, creatorId);
  }

  return {
    validateCourse,
    publishCourse,
    unpublishCourse,
    previewCourseDraft,
  };
}

export type LifecycleService = ReturnType<typeof createLifecycleService>;
