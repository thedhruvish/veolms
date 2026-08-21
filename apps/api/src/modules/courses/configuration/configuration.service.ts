import crypto from "node:crypto";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import type {
  UpdateCourseAccessRuleRequest,
  UpdateCoursePricingRequest,
  UpdateCourseSettingsRequest,
} from "@veolms/contracts";
import { AppError } from "../../../lib/errors.ts";
import * as configRepo from "./configuration.repository.ts";
import * as courseRepo from "../course/course.repository.ts";

export interface ConfigurationServiceOptions {
  database: Kysely<Database>;
}

export function createConfigurationService({
  database,
}: ConfigurationServiceOptions) {
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

  async function upsertCourseAccessRules(
    courseId: string,
    creatorId: string,
    updates: UpdateCourseAccessRuleRequest,
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId);

    const existing = await configRepo.findAccessRuleByCourseId(
      database,
      courseId,
    );
    const now = new Date();

    const durationDays =
      updates.accessType === "everyone" ? null : updates.durationDays ?? null;
    const startsAt =
      updates.accessType === "everyone" || !updates.startsAt
        ? null
        : new Date(updates.startsAt);
    const expiresAt =
      updates.accessType === "everyone" || !updates.expiresAt
        ? null
        : new Date(updates.expiresAt);

    if (existing) {
      await configRepo.updateAccessRule(database, existing.id, {
        access_type: updates.accessType,
        duration_type: updates.durationType,
        duration_days: durationDays,
        starts_at: startsAt,
        expires_at: expiresAt,
        updated_at: now,
      });

      return {
        id: existing.id,
        courseId,
        accessType: updates.accessType,
        durationType: updates.durationType,
        durationDays,
        startsAt: startsAt ? startsAt.toISOString() : null,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
      };
    } else {
      const ruleId = crypto.randomUUID();
      await configRepo.insertAccessRule(database, {
        id: ruleId,
        course_id: courseId,
        access_type: updates.accessType,
        duration_type: updates.durationType,
        duration_days: durationDays,
        starts_at: startsAt,
        expires_at: expiresAt,
        created_at: now,
        updated_at: now,
      });

      return {
        id: ruleId,
        courseId,
        accessType: updates.accessType,
        durationType: updates.durationType,
        durationDays,
        startsAt: startsAt ? startsAt.toISOString() : null,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
      };
    }
  }

  async function upsertCoursePricing(
    courseId: string,
    creatorId: string,
    updates: UpdateCoursePricingRequest,
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId);

    const existing = await configRepo.findPricingByCourseId(
      database,
      courseId,
    );
    const now = new Date();

    const price = updates.pricingType === "free" ? 0 : updates.price;
    const salePrice =
      updates.pricingType === "free" ? null : updates.salePrice ?? null;
    const saleStartsAt =
      updates.pricingType === "free" || !updates.saleStartsAt
        ? null
        : new Date(updates.saleStartsAt);
    const saleEndsAt =
      updates.pricingType === "free" || !updates.saleEndsAt
        ? null
        : new Date(updates.saleEndsAt);

    if (existing) {
      await configRepo.updatePricing(database, existing.id, {
        pricing_type: updates.pricingType,
        price,
        currency: updates.currency,
        sale_price: salePrice,
        sale_starts_at: saleStartsAt,
        sale_ends_at: saleEndsAt,
        updated_at: now,
      });

      return {
        id: existing.id,
        courseId,
        pricingType: updates.pricingType,
        price,
        currency: updates.currency,
        salePrice,
        saleStartsAt: saleStartsAt ? saleStartsAt.toISOString() : null,
        saleEndsAt: saleEndsAt ? saleEndsAt.toISOString() : null,
      };
    } else {
      const pricingId = crypto.randomUUID();
      await configRepo.insertPricing(database, {
        id: pricingId,
        course_id: courseId,
        pricing_type: updates.pricingType,
        price,
        currency: updates.currency,
        sale_price: salePrice,
        sale_starts_at: saleStartsAt,
        sale_ends_at: saleEndsAt,
        created_at: now,
        updated_at: now,
      });

      return {
        id: pricingId,
        courseId,
        pricingType: updates.pricingType,
        price,
        currency: updates.currency,
        salePrice,
        saleStartsAt: saleStartsAt ? saleStartsAt.toISOString() : null,
        saleEndsAt: saleEndsAt ? saleEndsAt.toISOString() : null,
      };
    }
  }

  async function upsertCourseSettings(
    courseId: string,
    creatorId: string,
    updates: UpdateCourseSettingsRequest,
  ) {
    await getCourseAndVerifyOwner(courseId, creatorId);

    const existing = await configRepo.findSettingsByCourseId(
      database,
      courseId,
    );
    const now = new Date();

    if (existing) {
      await configRepo.updateSettings(database, existing.id, {
        allow_qa: updates.allowQa,
        allow_comments: updates.allowComments,
        allow_reviews: updates.allowReviews,
        allow_downloads: updates.allowDownloads,
        certificate_enabled: updates.certificateEnabled,
        language: updates.language,
        estimated_duration: updates.estimatedDuration,
        updated_at: now,
      });

      return {
        id: existing.id,
        courseId,
        allowQa: updates.allowQa ?? existing.allow_qa,
        allowComments: updates.allowComments ?? existing.allow_comments,
        allowReviews: updates.allowReviews ?? existing.allow_reviews,
        allowDownloads: updates.allowDownloads ?? existing.allow_downloads,
        certificateEnabled:
          updates.certificateEnabled ?? existing.certificate_enabled,
        language: updates.language ?? existing.language,
        estimatedDuration:
          updates.estimatedDuration !== undefined
            ? updates.estimatedDuration
            : existing.estimated_duration,
      };
    } else {
      const settingsId = crypto.randomUUID();
      await configRepo.insertSettings(database, {
        id: settingsId,
        course_id: courseId,
        allow_qa: updates.allowQa ?? true,
        allow_comments: updates.allowComments ?? true,
        allow_reviews: updates.allowReviews ?? true,
        allow_downloads: updates.allowDownloads ?? false,
        certificate_enabled: updates.certificateEnabled ?? false,
        language: updates.language ?? "en",
        estimated_duration: updates.estimatedDuration ?? null,
        created_at: now,
        updated_at: now,
      });

      return {
        id: settingsId,
        courseId,
        allowQa: updates.allowQa ?? true,
        allowComments: updates.allowComments ?? true,
        allowReviews: updates.allowReviews ?? true,
        allowDownloads: updates.allowDownloads ?? false,
        certificateEnabled: updates.certificateEnabled ?? false,
        language: updates.language ?? "en",
        estimatedDuration: updates.estimatedDuration ?? null,
      };
    }
  }

  return {
    upsertCourseAccessRules,
    upsertCoursePricing,
    upsertCourseSettings,
  };
}

export type ConfigurationService = ReturnType<typeof createConfigurationService>;
