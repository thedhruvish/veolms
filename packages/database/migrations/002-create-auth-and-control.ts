import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // 1. Create roles table
  await database.schema
    .createTable("roles")
    .addColumn("id", "bigserial", (column) => column.primaryKey())
    .addColumn("roleName", "text", (column) => column.notNull().unique())
    .addColumn("lastPermissionUpdate", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("createdAt", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updatedAt", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // 2. Create menus table
  await database.schema
    .createTable("menus")
    .addColumn("id", "bigserial", (column) => column.primaryKey())
    .addColumn("parentId", "bigint", (column) =>
      column.references("menus.id").onDelete("cascade"),
    )
    .addColumn("label", "text", (column) => column.notNull())
    .addColumn("routeLink", "text", (column) => column.notNull())
    .addColumn("icon", "text")
    .addColumn("expanded", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("checkList", "text")
    .addColumn("isBoth", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("createdAt", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updatedAt", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // 3. Create permissions table
  await database.schema
    .createTable("permissions")
    .addColumn("id", "bigserial", (column) => column.primaryKey())
    .addColumn("roleId", "bigint", (column) =>
      column.notNull().references("roles.id").onDelete("cascade"),
    )
    .addColumn("menuId", "bigint", (column) =>
      column.notNull().references("menus.id").onDelete("cascade"),
    )
    .addColumn("canCreate", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("canRead", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("canUpdate", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("canDelete", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("createdAt", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updatedAt", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("permissions_roleId_menuId_unique", ["roleId", "menuId"])
    .execute();

  // 4. Create users table
  await database.schema
    .createTable("users")
    .addColumn("id", "bigserial", (column) => column.primaryKey())
    .addColumn("userName", "text", (column) => column.notNull().unique())
    .addColumn("firstName", "text", (column) => column.notNull())
    .addColumn("lastName", "text")
    .addColumn("email", "text", (column) => column.notNull().unique())
    .addColumn("password", "text", (column) => column.notNull())
    .addColumn("roleId", "bigint", (column) =>
      column.notNull().references("roles.id").onDelete("restrict"),
    )
    .addColumn("dateOfBirth", "date")
    .addColumn("phone", "text")
    .addColumn("address", "text")
    .addColumn("avatarAssetId", "bigint")
    .addColumn("passwordResetTokenHash", "text")
    .addColumn("passwordResetExpires", "timestamptz")
    .addColumn("createdAt", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updatedAt", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("users").execute();
  await database.schema.dropTable("permissions").execute();
  await database.schema.dropTable("menus").execute();
  await database.schema.dropTable("roles").execute();
}
