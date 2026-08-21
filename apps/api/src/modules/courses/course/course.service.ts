import crypto from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Kysely } from "kysely";
import type {
  Database,
  AccessType,
  AccessDurationType,
  PricingType,
} from "@veolms/database";
import type { UpdateCourseBasicsRequest } from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import type { AppServices } from "../../../services/index.ts";
import { slugify } from "../shared/courses.utils.ts";
import * as courseRepo from "./course.repository.ts";
import * as categoryRepo from "../category/category.repository.ts";
import * as curriculumRepo from "../curriculum/curriculum.repository.ts";
import * as configRepo from "../configuration/configuration.repository.ts";
import * as mediaRepo from "../media/media.repository.ts";
import { createMediaService } from "../media/media.service.ts";

export interface CourseServiceOptions {
  database: Kysely<Database>;
  services: AppServices;
}

export function createCourseService({
  database,
  services,
}: CourseServiceOptions) {
  const mediaService = createMediaService({ database, services });

  /**
   * Verifies course existence and owner permissions.
   */
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

  // --- Course Basics ---

  async function createCourse(title: string, creatorId: string) {
    const id = crypto.randomUUID();
    const slug = `${slugify(title)}-${id.split("-")[0]}`;
    const now = new Date();

    await courseRepo.insertCourse(database, {
      id,
      slug,
      title,
      status: "draft",
      creator_id: creatorId,
      version: 1,
      created_at: now,
      updated_at: now,
    });

    return {
      id,
      slug,
      title,
      status: "draft" as const,
      creatorId,
      version: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  async function listMyCourses(creatorId: string) {
    const rows = await courseRepo.listCoursesByCreator(database, creatorId);
    const courses = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      shortDescription: row.short_description,
      description: row.description,
      difficulty: row.difficulty as
        | "beginner"
        | "intermediate"
        | "advanced"
        | null,
      status: row.status as "draft" | "published" | "archived",
      creatorId: row.creator_id as string,
      categoryId: row.category_id,
      thumbnailMediaId: row.thumbnail_media_id,
      trailerMediaId: row.trailer_media_id,
      version: row.version,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      publishedAt: row.published_at?.toISOString() ?? null,
    }));
    return { courses };
  }

  async function listPublishedCourses(filters?: { creatorId?: string }) {
    return await courseRepo.listPublishedCourses(database, filters);
  }

  async function getPublishedCourseBySlug(slug: string) {
    return await courseRepo.findPublishedCourseBySlug(database, slug);
  }

  async function listAvailableCoursesByCreator(creatorId: string) {
    const rows = await courseRepo.listAvailableCoursesByCreator(
      database,
      creatorId,
    );
    return {
      courses: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        shortDescription: row.short_description,
        description: row.description,
        difficulty: row.difficulty as
          | "beginner"
          | "intermediate"
          | "advanced"
          | null,
        status: row.status as "draft" | "published" | "archived",
        creatorId: row.creator_id as string,
        categoryId: row.category_id,
        thumbnailMediaId: row.thumbnail_media_id,
        trailerMediaId: row.trailer_media_id,
        version: row.version,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        publishedAt: row.published_at?.toISOString() ?? null,
      })),
    };
  }

  async function updateCourseBasics(
    courseId: string,
    creatorId: string,
    payload: UpdateCourseBasicsRequest,
    logger: FastifyBaseLogger,
  ) {
    const { version, ...updates } = payload;
    const course = await getCourseAndVerifyOwner(courseId, creatorId);

    if (course.version !== version) {
      throw new AppError(
        409,
        "OPTIMISTIC_LOCK_CONFLICT",
        "Course has been updated by another action. Please reload.",
      );
    }

    if (updates.categoryId) {
      const category = await categoryRepo.findCategoryById(
        database,
        updates.categoryId,
      );
      if (!category) {
        throw new AppError(400, "INVALID_CATEGORY", "Category not found.");
      }
    }

    if (updates.thumbnailMediaId) {
      const thumb = await mediaRepo.findMediaAssetById(
        database,
        updates.thumbnailMediaId,
        creatorId,
      );
      if (!thumb || thumb.type !== "image") {
        throw new AppError(
          400,
          "INVALID_THUMBNAIL",
          "Thumbnail must be a valid image asset.",
        );
      }
    }

    let transcodeJobInfo: {
      should202: boolean;
      jobId: string | null;
    } | null = null;
    if (updates.trailerMediaId) {
      transcodeJobInfo = await mediaService.queueTranscodeJob(
        updates.trailerMediaId,
        creatorId,
        logger,
      );
    }

    const now = new Date();
    const newVersion = version + 1;

    await courseRepo.updateCourse(database, courseId, version, {
      title: updates.title,
      description: updates.description,
      category_id: updates.categoryId,
      difficulty: updates.difficulty,
      thumbnail_media_id: updates.thumbnailMediaId,
      trailer_media_id: updates.trailerMediaId,
      version: newVersion,
      updated_at: now,
    });

    if (transcodeJobInfo && transcodeJobInfo.should202) {
      return {
        accepted: true as const,
        videoJobId: transcodeJobInfo.jobId!,
        processingStatus: "queued" as const,
      };
    }

    return {
      accepted: false as const,
      course: {
        id: course.id,
        slug: course.slug,
        title: updates.title ?? course.title,
        shortDescription: course.short_description,
        description:
          updates.description !== undefined
            ? updates.description
            : course.description,
        difficulty:
          updates.difficulty !== undefined
            ? updates.difficulty
            : (course.difficulty as
                | "beginner"
                | "intermediate"
                | "advanced"
                | null),
        status: course.status as "draft" | "published" | "archived",
        creatorId: course.creator_id as string,
        categoryId:
          updates.categoryId !== undefined
            ? updates.categoryId
            : course.category_id,
        thumbnailMediaId:
          updates.thumbnailMediaId !== undefined
            ? updates.thumbnailMediaId
            : course.thumbnail_media_id,
        trailerMediaId:
          updates.trailerMediaId !== undefined
            ? updates.trailerMediaId
            : course.trailer_media_id,
        version: newVersion,
        createdAt: course.created_at.toISOString(),
        updatedAt: now.toISOString(),
        publishedAt: course.published_at?.toISOString() ?? null,
      },
    };
  }

  /**
   * Assembles the full editor payload for authoring view.
   */
  async function getCourseEditorData(courseId: string, creatorId: string) {
    const course = await getCourseAndVerifyOwner(courseId, creatorId);

    const sections = await curriculumRepo.findSectionsByCourseId(
      database,
      courseId,
    );
    const lessons = await curriculumRepo.findLessonsByCourseId(
      database,
      courseId,
    );
    const lessonIds = lessons.map((l) => l.id);
    const resources = await curriculumRepo.listResourcesForLessons(
      database,
      lessonIds,
    );

    const accessRules = await configRepo.findAccessRuleByCourseId(
      database,
      courseId,
    );
    const pricing = await configRepo.findPricingByCourseId(database, courseId);
    const settings = await configRepo.findSettingsByCourseId(
      database,
      courseId,
    );

    const fullSections = sections.map((sec) => {
      const secLessons = lessons
        .filter((l) => l.section_id === sec.id)
        .map((les) => {
          const lesResources = resources.filter((r) => r.lesson_id === les.id);
          return {
            id: les.id,
            courseId: les.course_id,
            sectionId: les.section_id,
            title: les.title,
            description: les.description,
            contentType: les.content_type as "video" | "document",
            contentMediaId: les.content_media_id,
            position: les.position,
            isPreview: les.is_preview,
            isPublished: les.is_published,
            resources: lesResources.map((res) => ({
              id: res.id,
              lessonId: res.lesson_id,
              mediaAssetId: res.media_asset_id,
              title: res.title,
              description: res.description,
              position: res.position,
              createdAt: res.created_at.toISOString(),
            })),
          };
        });

      return {
        id: sec.id,
        courseId: sec.course_id,
        title: sec.title,
        description: sec.description,
        position: sec.position,
        lessons: secLessons,
      };
    });

    return {
      course: {
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
        status: course.status as "draft" | "published" | "archived",
        creatorId: course.creator_id as string,
        categoryId: course.category_id,
        thumbnailMediaId: course.thumbnail_media_id,
        trailerMediaId: course.trailer_media_id,
        version: course.version,
        createdAt: course.created_at.toISOString(),
        updatedAt: course.updated_at.toISOString(),
        publishedAt: course.published_at?.toISOString() ?? null,
      },
      sections: fullSections,
      accessRules: accessRules
        ? {
            id: accessRules.id,
            courseId: accessRules.course_id,
            accessType: accessRules.access_type as AccessType,
            durationType: accessRules.duration_type as AccessDurationType,
            durationDays: accessRules.duration_days,
            startsAt: accessRules.starts_at?.toISOString() ?? null,
            expiresAt: accessRules.expires_at?.toISOString() ?? null,
          }
        : null,
      pricing: pricing
        ? {
            id: pricing.id,
            courseId: pricing.course_id,
            pricingType: pricing.pricing_type as PricingType,
            price: pricing.price,
            currency: pricing.currency,
            salePrice: pricing.sale_price,
            saleStartsAt: pricing.sale_starts_at?.toISOString() ?? null,
            saleEndsAt: pricing.sale_ends_at?.toISOString() ?? null,
          }
        : null,
      settings: settings
        ? {
            id: settings.id,
            courseId: settings.course_id,
            allowQa: settings.allow_qa,
            allowComments: settings.allow_comments,
            allowReviews: settings.allow_reviews,
            allowDownloads: settings.allow_downloads,
            certificateEnabled: settings.certificate_enabled,
            language: settings.language,
            estimatedDuration: settings.estimated_duration,
          }
        : null,
    };
  }

  /**
   * Assembles public course overview data for learners.
   */
  async function getCourseOverviewData(
    courseIdOrSlug: string,
    user?: { id: string; roles?: string[] },
  ) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        courseIdOrSlug,
      );

    let course = isUuid
      ? await courseRepo.findCourseById(database, courseIdOrSlug)
      : await courseRepo.findCourseBySlug(database, courseIdOrSlug);

    if (!course && !isUuid) {
      course = await courseRepo.findCourseById(database, courseIdOrSlug);
    }

    if (!course) {
      throw new AppError(404, "COURSE_NOT_FOUND", "Course not found.");
    }

    if (course.status !== "published") {
      const isOwner = user && user.id === course.creator_id;
      const isAdmin = user && user.roles && user.roles.includes("admin");
      if (!isOwner && !isAdmin) {
        throw new AppError(404, "COURSE_NOT_FOUND", "Course not published.");
      }
    }

    const courseId = course.id;

    let category = null;
    if (course.category_id) {
      const cat = await categoryRepo.findCategoryById(
        database,
        course.category_id,
      );
      if (cat) {
        category = {
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
        };
      }
    }

    let creator = null;
    if (course.creator_id) {
      const creatorUser = await courseRepo.findCourseCreator(
        database,
        course.creator_id,
      );
      if (creatorUser) {
        creator = {
          id: creatorUser.id,
          displayName: creatorUser.display_name,
          username: creatorUser.username,
        };
      }
    }

    const sections = await curriculumRepo.findSectionsByCourseId(
      database,
      courseId,
    );
    const lessons = await curriculumRepo.findLessonsByCourseId(
      database,
      courseId,
    );
    const lessonIds = lessons.map((l) => l.id);
    const resources = await curriculumRepo.listResourcesForLessons(
      database,
      lessonIds,
    );

    const mediaIds = lessons
      .map((l) => l.content_media_id)
      .filter((id): id is string => Boolean(id));
    const mediaAssets = await mediaRepo.findMediaAssetsByIds(
      database,
      mediaIds,
    );
    const mediaDurationMap = new Map<string, number>();
    for (const m of mediaAssets) {
      if (m.duration_seconds) {
        mediaDurationMap.set(m.id, m.duration_seconds);
      }
    }

    const accessRules = await configRepo.findAccessRuleByCourseId(
      database,
      courseId,
    );
    const pricing = await configRepo.findPricingByCourseId(database, courseId);
    const settings = await configRepo.findSettingsByCourseId(
      database,
      courseId,
    );

    let totalDurationSeconds = 0;

    const fullSections = sections.map((sec) => {
      const secLessons = lessons
        .filter((l) => l.section_id === sec.id)
        .map((les) => {
          const lesResources = resources.filter((r) => r.lesson_id === les.id);
          if (
            les.content_media_id &&
            mediaDurationMap.has(les.content_media_id)
          ) {
            totalDurationSeconds +=
              mediaDurationMap.get(les.content_media_id) ?? 0;
          }

          return {
            id: les.id,
            courseId: les.course_id,
            sectionId: les.section_id,
            title: les.title,
            description: les.description,
            contentType: les.content_type as "video" | "document",
            contentMediaId: les.content_media_id,
            position: les.position,
            isPreview: les.is_preview,
            isPublished: les.is_published,
            resources: lesResources.map((res) => ({
              id: res.id,
              lessonId: res.lesson_id,
              mediaAssetId: res.media_asset_id,
              title: res.title,
              description: res.description,
              position: res.position,
              createdAt: res.created_at.toISOString(),
            })),
          };
        });

      return {
        id: sec.id,
        courseId: sec.course_id,
        title: sec.title,
        description: sec.description,
        position: sec.position,
        lessons: secLessons,
      };
    });

    if (
      totalDurationSeconds === 0 &&
      settings?.estimated_duration &&
      settings.estimated_duration > 0
    ) {
      totalDurationSeconds = settings.estimated_duration * 60;
    }

    return {
      course: {
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
        status: course.status as "draft" | "published" | "archived",
        creatorId: course.creator_id as string,
        categoryId: course.category_id,
        thumbnailMediaId: course.thumbnail_media_id,
        trailerMediaId: course.trailer_media_id,
        version: course.version,
        createdAt: course.created_at.toISOString(),
        updatedAt: course.updated_at.toISOString(),
        publishedAt: course.published_at?.toISOString() ?? null,
      },
      category,
      creator,
      sections: fullSections,
      accessRules: accessRules
        ? {
            id: accessRules.id,
            courseId: accessRules.course_id,
            accessType: accessRules.access_type as AccessType,
            durationType: accessRules.duration_type as AccessDurationType,
            durationDays: accessRules.duration_days,
            startsAt: accessRules.starts_at?.toISOString() ?? null,
            expiresAt: accessRules.expires_at?.toISOString() ?? null,
          }
        : null,
      pricing: pricing
        ? {
            id: pricing.id,
            courseId: pricing.course_id,
            pricingType: pricing.pricing_type as PricingType,
            price: pricing.price,
            currency: pricing.currency,
            salePrice: pricing.sale_price,
            saleStartsAt: pricing.sale_starts_at?.toISOString() ?? null,
            saleEndsAt: pricing.sale_ends_at?.toISOString() ?? null,
          }
        : null,
      settings: settings
        ? {
            id: settings.id,
            courseId: settings.course_id,
            allowQa: settings.allow_qa,
            allowComments: settings.allow_comments,
            allowReviews: settings.allow_reviews,
            allowDownloads: settings.allow_downloads,
            certificateEnabled: settings.certificate_enabled,
            language: settings.language,
            estimatedDuration: settings.estimated_duration,
          }
        : null,
      stats: {
        totalSections: sections.length,
        totalLessons: lessons.length,
        totalDurationSeconds,
      },
    };
  }

  return {
    getCourseAndVerifyOwner,
    createCourse,
    listMyCourses,
    listPublishedCourses,
    getPublishedCourseBySlug,
    listAvailableCoursesByCreator,
    updateCourseBasics,
    getCourseEditorData,
    getCourseOverviewData,
  };
}

export type CourseService = ReturnType<typeof createCourseService>;
