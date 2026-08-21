import { type Kysely } from "kysely";
import type {
  Database,
  AccessType,
  AccessDurationType,
  PricingType,
} from "@veolms/database";

// --- Access Rules ---

export async function findAccessRuleByCourseId(
  database: Kysely<Database>,
  courseId: string,
) {
  return await database
    .selectFrom("course_access_rules")
    .selectAll()
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

export async function insertAccessRule(
  database: Kysely<Database>,
  values: {
    id: string;
    course_id: string;
    access_type: AccessType;
    duration_type: AccessDurationType;
    duration_days: number | null;
    starts_at: Date | null;
    expires_at: Date | null;
    created_at: Date;
    updated_at: Date;
  },
) {
  await database.insertInto("course_access_rules").values(values).execute();
}

export async function updateAccessRule(
  database: Kysely<Database>,
  accessRuleId: string,
  values: {
    access_type: AccessType;
    duration_type: AccessDurationType;
    duration_days: number | null;
    starts_at: Date | null;
    expires_at: Date | null;
    updated_at: Date;
  },
) {
  await database
    .updateTable("course_access_rules")
    .set(values)
    .where("id", "=", accessRuleId)
    .execute();
}

// --- Pricing ---

export async function findPricingByCourseId(
  database: Kysely<Database>,
  courseId: string,
) {
  return await database
    .selectFrom("course_pricing")
    .selectAll()
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

export async function insertPricing(
  database: Kysely<Database>,
  values: {
    id: string;
    course_id: string;
    pricing_type: PricingType;
    price: number;
    currency: string;
    sale_price: number | null;
    sale_starts_at: Date | null;
    sale_ends_at: Date | null;
    created_at: Date;
    updated_at: Date;
  },
) {
  await database.insertInto("course_pricing").values(values).execute();
}

export async function updatePricing(
  database: Kysely<Database>,
  pricingId: string,
  values: {
    pricing_type: PricingType;
    price: number;
    currency: string;
    sale_price: number | null;
    sale_starts_at: Date | null;
    sale_ends_at: Date | null;
    updated_at: Date;
  },
) {
  await database
    .updateTable("course_pricing")
    .set(values)
    .where("id", "=", pricingId)
    .execute();
}

// --- Settings ---

export async function findSettingsByCourseId(
  database: Kysely<Database>,
  courseId: string,
) {
  return await database
    .selectFrom("course_settings")
    .selectAll()
    .where("course_id", "=", courseId)
    .executeTakeFirst();
}

export async function insertSettings(
  database: Kysely<Database>,
  values: {
    id: string;
    course_id: string;
    allow_qa: boolean;
    allow_comments: boolean;
    allow_reviews: boolean;
    allow_downloads: boolean;
    certificate_enabled: boolean;
    language: string;
    estimated_duration: number | null;
    created_at: Date;
    updated_at: Date;
  },
) {
  await database.insertInto("course_settings").values(values).execute();
}

export async function updateSettings(
  database: Kysely<Database>,
  settingsId: string,
  values: {
    allow_qa?: boolean;
    allow_comments?: boolean;
    allow_reviews?: boolean;
    allow_downloads?: boolean;
    certificate_enabled?: boolean;
    language?: string;
    estimated_duration?: number | null;
    updated_at: Date;
  },
) {
  await database
    .updateTable("course_settings")
    .set(values)
    .where("id", "=", settingsId)
    .execute();
}
