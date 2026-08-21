import { type Kysely } from "kysely";
import type { Database } from "@veolms/database";

export async function findCategoryBySlug(
  database: Kysely<Database>,
  slug: string,
) {
  return await database
    .selectFrom("categories")
    .select("id")
    .where("slug", "=", slug)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function insertCategory(
  database: Kysely<Database>,
  values: {
    id: string;
    name: string;
    slug: string;
    created_at: Date;
    updated_at: Date;
  },
) {
  await database.insertInto("categories").values(values).execute();
}

export async function softDeleteCategory(
  database: Kysely<Database>,
  categoryId: string,
) {
  await database
    .updateTable("categories")
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where("id", "=", categoryId)
    .execute();
}

export async function findCategoryById(
  database: Kysely<Database>,
  categoryId: string,
) {
  return await database
    .selectFrom("categories")
    .selectAll()
    .where("id", "=", categoryId)
    .where("deleted_at", "is", null)
    .executeTakeFirst();
}

export async function listCategories(database: Kysely<Database>) {
  return await database
    .selectFrom("categories")
    .select(["id", "name", "slug"])
    .where("deleted_at", "is", null)
    .orderBy("name", "asc")
    .execute();
}
