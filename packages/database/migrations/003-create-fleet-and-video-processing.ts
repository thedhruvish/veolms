import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // 1. Create video_jobs table
  await database.schema
    .createTable("video_jobs")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("status", "text", (column) =>
      column.notNull().defaultTo("PENDING"),
    )
    .addColumn("source_key", "text", (column) => column.notNull())
    .addColumn("duration_seconds", "numeric", (column) => column.notNull())
    .addColumn("source_width", "integer", (column) => column.notNull())
    .addColumn("source_height", "integer", (column) => column.notNull())
    .addColumn("source_fps", "numeric", (column) => column.notNull())
    .addColumn("source_codec", "text", (column) => column.notNull())
    .addColumn("requested_qualities", "text", (column) => column.notNull())
    .addColumn("quality_complexity", "numeric", (column) => column.notNull())
    .addColumn("source_complexity", "numeric", (column) => column.notNull())
    .addColumn("chunk_duration_seconds", "integer", (column) =>
      column.notNull(),
    )
    .addColumn("chunk_count", "integer", (column) => column.notNull())
    .addColumn("required_workers", "integer", (column) => column.notNull())
    .addColumn("active_workers", "integer", (column) =>
      column.notNull().defaultTo(0),
    )
    .addColumn("completed_chunks", "integer", (column) =>
      column.notNull().defaultTo(0),
    )
    .addColumn("output_manifest_key", "text")
    .addColumn("error", "text")
    .addColumn("started_at", "timestamptz")
    .addColumn("completed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "video_jobs_status_valid",
      sql`status in ('PENDING', 'SPLITTING', 'ENCODING', 'FINALIZING', 'COMPLETED', 'FAILED')`,
    )
    .execute();

  // 2. Create workers table
  await database.schema
    .createTable("workers")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("instance_id", "text", (column) => column.notNull().unique())
    .addColumn("provider", "text", (column) => column.notNull())
    .addColumn("instance_type", "text", (column) => column.notNull())
    .addColumn("state", "text", (column) =>
      column.notNull().defaultTo("PROVISIONING"),
    )
    .addColumn("current_job_id", "text")
    .addColumn("current_video_id", "uuid", (column) =>
      column.references("video_jobs.id").onDelete("set null"),
    )
    .addColumn("current_chunk_id", "uuid")
    .addColumn("progress_percent", "numeric", (column) =>
      column.notNull().defaultTo(0),
    )
    .addColumn("estimated_remaining_seconds", "numeric")
    .addColumn("fps", "numeric")
    .addColumn("last_heartbeat_at", "timestamptz")
    .addColumn("idle_since", "timestamptz")
    .addColumn("started_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("terminated_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "workers_state_valid",
      sql`state in ('PROVISIONING', 'BOOTING', 'REGISTERING', 'IDLE', 'PROCESSING', 'UPLOADING', 'STOPPING', 'TERMINATED', 'FAILED')`,
    )
    .execute();

  // 3. Create video_chunks table
  await database.schema
    .createTable("video_chunks")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("video_id", "uuid", (column) =>
      column.notNull().references("video_jobs.id").onDelete("cascade"),
    )
    .addColumn("chunk_index", "integer", (column) => column.notNull())
    .addColumn("start_seconds", "numeric", (column) => column.notNull())
    .addColumn("duration_seconds", "numeric", (column) => column.notNull())
    .addColumn("source_key", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) =>
      column.notNull().defaultTo("PENDING"),
    )
    .addColumn("worker_id", "uuid", (column) =>
      column.references("workers.id").onDelete("set null"),
    )
    .addColumn("output_key", "text")
    .addColumn("retry_count", "integer", (column) =>
      column.notNull().defaultTo(0),
    )
    .addColumn("error", "text")
    .addColumn("started_at", "timestamptz")
    .addColumn("completed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("video_chunks_video_id_chunk_index_unique", [
      "video_id",
      "chunk_index",
    ])
    .addCheckConstraint(
      "video_chunks_status_valid",
      sql`status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')`,
    )
    .execute();

  // 4. Add foreign key from workers.current_chunk_id to video_chunks.id
  await database.schema
    .alterTable("workers")
    .addForeignKeyConstraint(
      "workers_current_chunk_id_fk",
      ["current_chunk_id"],
      "video_chunks",
      ["id"],
      (cb) => cb.onDelete("set null"),
    )
    .execute();

  // 5. Create worker_heartbeats table
  await database.schema
    .createTable("worker_heartbeats")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("worker_id", "uuid", (column) =>
      column.notNull().references("workers.id").onDelete("cascade"),
    )
    .addColumn("job_id", "text")
    .addColumn("video_id", "uuid", (column) =>
      column.references("video_jobs.id").onDelete("set null"),
    )
    .addColumn("chunk_id", "uuid", (column) =>
      column.references("video_chunks.id").onDelete("set null"),
    )
    .addColumn("progress_percent", "numeric", (column) => column.notNull())
    .addColumn("fps", "numeric")
    .addColumn("frames", "integer")
    .addColumn("estimated_remaining_seconds", "numeric")
    .addColumn("cpu_usage", "numeric")
    .addColumn("memory_usage", "numeric")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // 6. Create indexes for performance
  await database.schema
    .createIndex("idx_video_jobs_status")
    .on("video_jobs")
    .column("status")
    .execute();

  await database.schema
    .createIndex("idx_video_chunks_video_id_status")
    .on("video_chunks")
    .columns(["video_id", "status"])
    .execute();

  await database.schema
    .createIndex("idx_workers_state_progress")
    .on("workers")
    .columns(["state", "progress_percent"])
    .execute();

  await database.schema
    .createIndex("idx_worker_heartbeats_worker_id")
    .on("worker_heartbeats")
    .column("worker_id")
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("worker_heartbeats").ifExists().execute();
  await database.schema.dropTable("video_chunks").ifExists().execute();
  await database.schema.dropTable("workers").ifExists().execute();
  await database.schema.dropTable("video_jobs").ifExists().execute();
}
