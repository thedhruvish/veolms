import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // 1. Create users table
  await database.schema
    .createTable("users")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("email", "text", (column) => column.unique())
    .addColumn("phone_no", "text", (column) => column.unique())
    .addColumn("username", "text", (column) => column.notNull().unique())
    .addColumn("display_name", "text", (column) => column.notNull())
    .addColumn("email_verified_at", "timestamptz")
    .addColumn("mfa_mandatory", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Create a unique case-insensitive index on email
  await database.schema
    .createIndex("users_email_lower_idx")
    .on("users")
    .expression(sql`lower(email)`)
    .unique()
    .execute();

  // 2. Create roles table
  await database.schema
    .createTable("roles")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("name", "text", (column) => column.notNull().unique())
    .addColumn("description", "text")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint("roles_name_nonempty", sql`char_length(trim(name)) > 0`)
    .execute();

  // 3. Create permissions table
  await database.schema
    .createTable("permissions")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("name", "text", (column) => column.notNull().unique())
    .addColumn("description", "text")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "permissions_name_nonempty",
      sql`char_length(trim(name)) > 0`,
    )
    .execute();

  // 4. Create user_roles join table
  await database.schema
    .createTable("user_roles")
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("role_id", "uuid", (column) =>
      column.notNull().references("roles.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addPrimaryKeyConstraint("pk_user_roles", ["user_id", "role_id"])
    .execute();
    

  // 5. Create role_permissions join table
  await database.schema
    .createTable("role_permissions")
    .addColumn("role_id", "uuid", (column) =>
      column.notNull().references("roles.id").onDelete("cascade"),
    )
    .addColumn("permission_id", "uuid", (column) =>
      column.notNull().references("permissions.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addPrimaryKeyConstraint("pk_role_permissions", [
      "role_id",
      "permission_id",
    ])
    .execute();

  // 6. Create sessions table
  await database.schema
    .createTable("sessions")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("token_hash", "text", (column) => column.notNull().unique())
    .addColumn("ip_address", "text")
    .addColumn("user_agent", "text")
    .addColumn("mfa_verified", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("revoked_at", "timestamptz")
    .addColumn("expires_at", "timestamptz", (column) => column.notNull())
    .addColumn("last_used_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Indexes on sessions
  await database.schema
    .createIndex("sessions_user_id_idx")
    .on("sessions")
    .column("user_id")
    .execute();

  await database.schema
    .createIndex("sessions_expires_at_idx")
    .on("sessions")
    .column("expires_at")
    .execute();

  // 7. Create oauth_accounts table
  await database.schema
    .createTable("oauth_accounts")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("provider", "text", (column) => column.notNull())
    .addColumn("provider_user_id", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("oauth_accounts_provider_provider_user_id_uniq", [
      "provider",
      "provider_user_id",
    ])
    .addUniqueConstraint("oauth_accounts_user_id_provider_uniq", [
      "user_id",
      "provider",
    ])
    .execute();

  // 8. Create rebuilt generic otp_codes table
  await database.schema
    .createTable("otp_codes")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("identifier", "text", (col) => col.notNull())
    .addColumn("identifier_type", "text", (col) => col.notNull()) // 'email' | 'phone'
    .addColumn("purpose", "text", (col) => col.notNull()) // 'login' | 'email_verification' | 'phone_verification'
    .addColumn("code_hash", "text", (col) => col.notNull())
    .addColumn("attempts", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("consumed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "otp_codes_identifier_type_check",
      sql`identifier_type IN ('email', 'phone')`,
    )
    .addCheckConstraint(
      "otp_codes_purpose_check",
      sql`purpose IN ('login', 'email_verification', 'phone_verification', 'registration')`,
    )
    .execute();

  // Index on otp_codes for lookup efficiency
  await database.schema
    .createIndex("otp_codes_lookup_idx")
    .on("otp_codes")
    .columns([
      "identifier",
      "identifier_type",
      "purpose",
      "expires_at",
      "consumed_at",
    ])
    .execute();

  // 9. Create user_totp_credentials table
  await database.schema
    .createTable("user_totp_credentials")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.references("users.id").onDelete("cascade").unique().notNull(),
    )
    .addColumn("secret_encrypted", "text", (col) => col.notNull())
    .addColumn("enabled", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("last_used_step", "bigint")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("failed_attempts", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("locked_until", "timestamptz")
    .execute();

  // 10. Create mfa_backup_codes table
  await database.schema
    .createTable("mfa_backup_codes")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.references("users.id").onDelete("cascade").notNull(),
    )
    .addColumn("code_hash", "text", (col) => col.unique().notNull())
    .addColumn("used_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Index on mfa_backup_codes for user query lookup
  await database.schema
    .createIndex("mfa_backup_codes_user_id_idx")
    .on("mfa_backup_codes")
    .column("user_id")
    .execute();

  // 11. Create webauthn_challenges table
  await database.schema
    .createTable("webauthn_challenges")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.references("users.id").onDelete("cascade"),
    )
    .addColumn("challenge", "text", (col) => col.notNull())
    .addColumn("type", "text", (col) => col.notNull()) // 'registration' | 'authentication'
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .addColumn("consumed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint("webauthn_challenges_type_check", sql`type IN ('registration', 'authentication')`)
    .execute();

  // 12. Create passkeys table (with timestamptz for created_at)
  await database.schema
    .createTable("passkeys")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) =>
      col.references("users.id").onDelete("cascade").notNull(),
    )
    .addColumn("credential_id", "text", (col) => col.unique().notNull())
    .addColumn("public_key", "text", (col) => col.notNull())
    .addColumn("counter", "bigint", (col) => col.defaultTo(0).notNull())
    .addColumn("transports", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Add index on passkeys
  await database.schema
    .createIndex("passkeys_user_id_idx")
    .on("passkeys")
    .column("user_id")
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("webauthn_challenges").execute();
  await database.schema.dropTable("mfa_backup_codes").execute();
  await database.schema.dropTable("user_totp_credentials").execute();
  await database.schema.dropTable("passkeys").execute();
  await database.schema.dropTable("otp_codes").execute();
  await database.schema.dropTable("oauth_accounts").execute();
  await database.schema.dropTable("sessions").execute();
  await database.schema.dropTable("role_permissions").execute();
  await database.schema.dropTable("user_roles").execute();
  await database.schema.dropTable("permissions").execute();
  await database.schema.dropTable("roles").execute();
  await database.schema.dropTable("users").execute();
}
