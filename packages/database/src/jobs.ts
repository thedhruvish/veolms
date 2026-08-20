import type { Kysely, Selectable } from "kysely";
import type { Database, JobTable } from "./schema.ts";

/**
 * Atomically claims the oldest QUEUED job and marks it PROCESSING.
 * `FOR UPDATE SKIP LOCKED` lets multiple callers (the fleet-manager Lambda
 * and any number of media-workers polling for their next job) race against
 * this query concurrently without ever double-claiming the same row.
 */
export async function claimNextQueuedJob(
  db: Kysely<Database>,
): Promise<Selectable<JobTable> | null> {
  return await db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom("jobs")
      .selectAll()
      .where("status", "=", "QUEUED")
      .orderBy("created_at", "asc")
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
        started_at: new Date(),
        updated_at: new Date(),
      })
      .where("id", "=", row.id)
      .execute();

    return row;
  });
}
