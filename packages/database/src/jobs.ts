import { sql, type Kysely, type Selectable } from "kysely";
import type { Database, JobTable } from "./schema.ts";

/**
 * Atomically claims the oldest QUEUED job and marks it PROCESSING.
 * `FOR UPDATE SKIP LOCKED` lets multiple callers (the fleet-manager Lambda
 * and any number of media-workers polling for their next job) race against
 * this query concurrently without ever double-claiming the same row. When a
 * worker ID is supplied, the claim and worker assignment happen in the same
 * transaction and only jobs that fit that worker's recorded capabilities are
 * considered.
 */
export async function claimNextQueuedJob(
  db: Kysely<Database>,
  workerId?: string,
): Promise<Selectable<JobTable> | null> {
  return await db.transaction().execute(async (trx) => {
    const worker = workerId
      ? await trx
          .selectFrom("workers")
          .select(["id", "cpu", "memory_mb", "storage_gb", "architecture"])
          .where("id", "=", workerId)
          .where("status", "=", "READY")
          .forUpdate()
          .executeTakeFirst()
      : null;

    // A caller that supplied a worker may only claim work while it remains
    // READY. Locking the row also prevents a monitor from terminating it in
    // the small interval between claim and assignment.
    if (workerId && !worker) {
      return null;
    }

    let query = trx
      .selectFrom("jobs")
      .selectAll()
      .where("status", "=", "QUEUED")
      .orderBy("created_at", "asc");

    if (worker) {
      query = query
        .where(
          sql<boolean>`
            CASE
              WHEN qualities @> ARRAY['2160p'] THEN 8
              WHEN qualities @> ARRAY['1440p'] OR cardinality(qualities) >= 5 THEN 4
              ELSE 2
            END <= ${worker.cpu}
          `,
        )
        .where(
          sql<boolean>`
            CASE
              WHEN qualities @> ARRAY['2160p'] THEN 16384
              WHEN qualities @> ARRAY['1440p'] OR cardinality(qualities) >= 5 THEN 8192
              ELSE 4096
            END <= ${worker.memory_mb}
          `,
        )
        .where(
          sql<boolean>`
            CASE
              WHEN qualities @> ARRAY['2160p'] THEN 80
              WHEN qualities @> ARRAY['1440p'] OR cardinality(qualities) >= 5 THEN 50
              ELSE 30
            END <= ${worker.storage_gb}
          `,
        )
        .where(sql<boolean>`'arm64' = ${worker.architecture}`);
    }

    const row = await query
      .limit(1)
      .forUpdate()
      .skipLocked()
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    await trx
      .updateTable("jobs")
      .set({
        status: "PROCESSING",
        ...(worker ? { worker_id: worker.id } : {}),
        started_at: new Date(),
        updated_at: new Date(),
      })
      .where("id", "=", row.id)
      .execute();

    if (worker) {
      await trx
        .updateTable("workers")
        .set({
          status: "PROCESSING",
          job_id: row.id,
          updated_at: new Date(),
        })
        .where("id", "=", worker.id)
        .execute();
    }

    return row;
  });
}
