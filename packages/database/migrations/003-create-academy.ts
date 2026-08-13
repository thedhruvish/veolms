import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable("academy")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("logo_url", "text")
    .addColumn("custom_domain", "text")
    .addColumn("setup_completed", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("academy").execute();
}
