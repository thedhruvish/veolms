import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // 1. Create jobs table
  await database.schema
    .createTable("jobs")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("status", "text", (column) =>
      column.notNull().defaultTo("QUEUED"),
    )
    .addColumn("video_key", "text", (column) => column.notNull())
    .addColumn("output_prefix", "text", (column) => column.notNull())
    .addColumn("requirements", "jsonb", (column) =>
      column
        .notNull()
        .defaultTo(
          sql`'{"qualities": ["1080p", "720p", "480p", "360p"]}'::jsonb`,
        ),
    )
    .addColumn("worker_id", "uuid")
    .addColumn("attempts", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("max_attempts", "integer", (column) =>
      column.notNull().defaultTo(3),
    )
    .addColumn("error_message", "text")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("started_at", "timestamptz")
    .addColumn("completed_at", "timestamptz")
    .addColumn("failed_at", "timestamptz")
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "jobs_status_valid",
      sql`status in ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')`,
    )
    .execute();

  // Index on jobs status and created_at for fast queue fetching
  await database.schema
    .createIndex("idx_jobs_status_created")
    .on("jobs")
    .columns(["status", "created_at"])
    .execute();

  // 2. Create workers table
  await database.schema
    .createTable("workers")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("provider", "text", (column) => column.notNull())
    .addColumn("provider_worker_id", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) =>
      column.notNull().defaultTo("PENDING"),
    )
    .addColumn("architecture", "text", (column) =>
      column.notNull().defaultTo("arm64"),
    )
    .addColumn("cpu", "integer", (column) => column.notNull())
    .addColumn("memory_mb", "integer", (column) => column.notNull())
    .addColumn("storage_gb", "integer", (column) =>
      column.notNull().defaultTo(30),
    )
    .addColumn("region", "text", (column) =>
      column.notNull().defaultTo("local"),
    )
    .addColumn("job_id", "uuid", (column) =>
      column.references("jobs.id").onDelete("set null"),
    )
    .addColumn("metadata", "jsonb", (column) =>
      column.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn("last_heartbeat_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("started_at", "timestamptz")
    .addColumn("terminated_at", "timestamptz")
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "workers_provider_valid",
      sql`provider in ('local', 'aws')`,
    )
    .addCheckConstraint(
      "workers_status_valid",
      sql`status in ('PENDING', 'PROVISIONING', 'STARTING', 'READY', 'PROCESSING', 'COMPLETED', 'FAILED', 'TERMINATING', 'TERMINATED')`,
    )
    .addCheckConstraint(
      "workers_architecture_valid",
      sql`architecture in ('arm64', 'x86_64')`,
    )
    .execute();

  // Indexes on workers table
  await database.schema
    .createIndex("idx_workers_status")
    .on("workers")
    .column("status")
    .execute();

  await database.schema
    .createIndex("idx_workers_heartbeat")
    .on("workers")
    .columns(["status", "last_heartbeat_at"])
    .execute();

  // 3. Create worker_monitoring table
  await database.schema
    .createTable("worker_monitoring")
    .addColumn("worker_id", "uuid", (column) =>
      column.primaryKey().references("workers.id").onDelete("cascade"),
    )
    .addColumn("next_check_at", "timestamptz", (column) => column.notNull())
    .addColumn("last_check_at", "timestamptz")
    .addColumn("estimated_duration_sec", "integer", (column) =>
      column.notNull(),
    )
    .addColumn("progress_percent", "real", (column) =>
      column.notNull().defaultTo(0.0),
    )
    .addColumn("last_progress_at", "timestamptz")
    .addColumn("monitoring_attempts", "integer", (column) =>
      column.notNull().defaultTo(0),
    )
    .addColumn("check_interval_sec", "integer", (column) =>
      column.notNull().defaultTo(30),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await database.schema
    .createIndex("idx_monitoring_next_check")
    .on("worker_monitoring")
    .column("next_check_at")
    .execute();

  // 4. Create worker_events table
  await database.schema
    .createTable("worker_events")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("worker_id", "uuid", (column) =>
      column.references("workers.id").onDelete("cascade"),
    )
    .addColumn("job_id", "uuid", (column) =>
      column.references("jobs.id").onDelete("cascade"),
    )
    .addColumn("event", "text", (column) => column.notNull())
    .addColumn("metadata", "jsonb", (column) =>
      column.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "worker_events_event_valid",
      sql`event in (
        'WORKER_CREATED',
        'WORKER_PROVISIONING',
        'WORKER_READY',
        'JOB_ASSIGNED',
        'JOB_STARTED',
        'PROGRESS_UPDATED',
        'HEARTBEAT_RECORDED',
        'HEARTBEAT_TIMEOUT',
        'JOB_COMPLETED',
        'JOB_FAILED',
        'WORKER_TERMINATION_REQUESTED',
        'WORKER_TERMINATED',
        'WORKER_ERROR'
      )`,
    )
    .execute();

  await database.schema
    .createIndex("idx_worker_events_worker")
    .on("worker_events")
    .columns(["worker_id", "created_at"])
    .execute();

  await database.schema
    .createIndex("idx_worker_events_job")
    .on("worker_events")
    .columns(["job_id", "created_at"])
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("worker_events").execute();
  await database.schema.dropTable("worker_monitoring").execute();
  await database.schema.dropTable("workers").execute();
  await database.schema.dropTable("jobs").execute();
}
