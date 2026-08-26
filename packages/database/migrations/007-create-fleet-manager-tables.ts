import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // 1. Create workers table
  await database.schema
    .createTable("workers")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("provider", "text", (column) => column.notNull())
    .addColumn("provider_worker_id", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) =>
      column.notNull().defaultTo("PENDING"),
    )
    .addColumn("architecture", "text", (column) =>
      column.notNull().defaultTo("ARM64"),
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
      column.references("video_jobs.id").onDelete("set null"),
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
      sql`provider in ('LOCAL', 'AWS')`,
    )
    .addCheckConstraint(
      "workers_status_valid",
      sql`status in ('PENDING', 'PROVISIONING', 'STARTING', 'READY', 'PROCESSING', 'COMPLETED', 'FAILED', 'TERMINATING', 'TERMINATED')`,
    )
    .addCheckConstraint(
      "workers_architecture_valid",
      sql`architecture in ('ARM64', 'X86_64')`,
    )
    .execute();

  // Indexes on workers table
  await database.schema
    .createIndex("idx_workers_status")
    .ifNotExists()
    .on("workers")
    .column("status")
    .execute();

  await database.schema
    .createIndex("idx_workers_heartbeat")
    .ifNotExists()
    .on("workers")
    .columns(["status", "last_heartbeat_at"])
    .execute();

  // 2. Create worker_monitoring table
  await database.schema
    .createTable("worker_monitoring")
    .ifNotExists()
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
    .ifNotExists()
    .on("worker_monitoring")
    .column("next_check_at")
    .execute();

  // 3. Create worker_events table
  await database.schema
    .createTable("worker_events")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("worker_id", "uuid", (column) =>
      column.references("workers.id").onDelete("cascade"),
    )
    .addColumn("job_id", "uuid", (column) =>
      column.references("video_jobs.id").onDelete("cascade"),
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
        'WORKER_ERROR',
        'SPOT_INTERRUPTED',
        'ORPHAN_INSTANCE_TERMINATED',
        'JOB_OUTPUT_VERIFIED',
        'JOB_OUTPUT_VERIFICATION_FAILED',
        'SCHEDULE_UPDATED',
        'SCHEDULE_CLEARED'
      )`,
    )
    .execute();

  await database.schema
    .createIndex("idx_worker_events_worker")
    .ifNotExists()
    .on("worker_events")
    .columns(["worker_id", "created_at"])
    .execute();

  await database.schema
    .createIndex("idx_worker_events_job")
    .ifNotExists()
    .on("worker_events")
    .columns(["job_id", "created_at"])
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("worker_events").ifExists().execute();
  await database.schema.dropTable("worker_monitoring").ifExists().execute();
  await database.schema.dropTable("workers").ifExists().execute();
}
