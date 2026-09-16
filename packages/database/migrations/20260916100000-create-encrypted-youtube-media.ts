import { sql, type Kysely } from "kysely";

/**
 * Durable records published by yt-import-enc. These tables deliberately sit
 * beside the existing FFmpeg/HLS job tables: the YouTube importer is a
 * separate CENC/DASH producer and must not enqueue a second transcode job.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable("encrypted_drm_keys")
    .addColumn("key_id", "text", (column) => column.primaryKey())
    .addColumn("ciphertext", "bytea", (column) => column.notNull())
    .addColumn("nonce", "bytea", (column) => column.notNull())
    .addColumn("auth_tag", "bytea", (column) => column.notNull())
    .addColumn("key_version", "text", (column) => column.notNull())
    .addColumn("algorithm", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "encrypted_drm_keys_algorithm_valid",
      sql`algorithm = 'aes-256-gcm'`,
    )
    .execute();

  await database.schema
    .createTable("encrypted_media_outputs")
    .addColumn("media_id", "uuid", (column) =>
      column.primaryKey().references("media_assets.id").onDelete("cascade"),
    )
    .addColumn("manifest_path", "text", (column) => column.notNull())
    .addColumn("output_prefix", "text", (column) => column.notNull())
    .addColumn("manifest_type", "text", (column) =>
      column.notNull().defaultTo("application/dash+xml"),
    )
    .addColumn("scheme", "text", (column) =>
      column.notNull().defaultTo("cenc-aes-ctr"),
    )
    .addColumn("key_system", "text", (column) =>
      column.notNull().defaultTo("org.w3.clearkey"),
    )
    .addColumn("duration_seconds", "integer")
    .addColumn("qualities", "jsonb", (column) => column.notNull())
    .addColumn("status", "text", (column) =>
      column.notNull().defaultTo("ready"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "encrypted_media_outputs_manifest_type_valid",
      sql`manifest_type = 'application/dash+xml'`,
    )
    .addCheckConstraint(
      "encrypted_media_outputs_scheme_valid",
      sql`scheme = 'cenc-aes-ctr'`,
    )
    .addCheckConstraint(
      "encrypted_media_outputs_key_system_valid",
      sql`key_system = 'org.w3.clearkey'`,
    )
    .addCheckConstraint(
      "encrypted_media_outputs_status_valid",
      sql`status in ('ready', 'failed')`,
    )
    .execute();

  await database.schema
    .createTable("encrypted_media_periods")
    .addColumn("media_id", "uuid", (column) =>
      column
        .notNull()
        .references("encrypted_media_outputs.media_id")
        .onDelete("cascade"),
    )
    .addColumn("period_index", "integer", (column) => column.notNull())
    .addColumn("source_segment_start", "integer", (column) => column.notNull())
    .addColumn("source_segment_count", "integer", (column) => column.notNull())
    .addColumn("start_ms", "bigint", (column) => column.notNull())
    .addColumn("duration_ms", "bigint", (column) => column.notNull())
    .addColumn("key_id", "text", (column) =>
      column.notNull().references("encrypted_drm_keys.key_id"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addPrimaryKeyConstraint("encrypted_media_periods_pk", [
      "media_id",
      "period_index",
    ])
    .addCheckConstraint(
      "encrypted_media_periods_index_valid",
      sql`period_index >= 0 and source_segment_start >= 0 and source_segment_count > 0 and start_ms >= 0 and duration_ms > 0`,
    )
    .execute();

  await database.schema
    .createIndex("idx_encrypted_media_periods_key_id")
    .on("encrypted_media_periods")
    .column("key_id")
    .execute();
  await database.schema
    .createIndex("idx_encrypted_media_outputs_status")
    .on("encrypted_media_outputs")
    .columns(["status", "updated_at"])
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .dropIndex("idx_encrypted_media_outputs_status")
    .ifExists()
    .execute();
  await database.schema
    .dropIndex("idx_encrypted_media_periods_key_id")
    .ifExists()
    .execute();
  await database.schema
    .dropTable("encrypted_media_periods")
    .ifExists()
    .execute();
  await database.schema
    .dropTable("encrypted_media_outputs")
    .ifExists()
    .execute();
  await database.schema.dropTable("encrypted_drm_keys").ifExists().execute();
}
