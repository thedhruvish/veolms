import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Kysely } from "kysely";
import type { Database } from "@veolms/database";
import { createJobManager } from "../src/core/job-manager.ts";
import { loadFleetManagerConfig } from "../src/config/config.ts";

describe("Job Manager — queueJob insert values", () => {
  it("passes qualities as a plain array (jobs.qualities is a native Postgres array, not jsonb)", async () => {
    let insertedValues: Record<string, unknown> | undefined;

    const mockDb = {
      insertInto: () => ({
        values: (v: Record<string, unknown>) => {
          insertedValues = v;
          return { execute: async () => {} };
        },
      }),
    } as unknown as Kysely<Database>;

    const jobManager = createJobManager({
      db: mockDb,
      config: loadFleetManagerConfig(),
    });

    await jobManager.queueJob({
      videoKey: "raw/video.mp4",
      outputPrefix: "out/",
      qualities: ["1080p", "720p"],
    });

    assert.deepEqual(insertedValues?.["qualities"], ["1080p", "720p"]);
  });

  it("does not fail a job if it has already been COMPLETED", async () => {
    let updateExecuted = false;
    const mockDb = {
      selectFrom: () => ({
        select: () => ({
          where: () => ({
            where: () => ({
              where: () => ({
                executeTakeFirst: async () => ({
                  id: "job-1",
                  attempts: 1,
                  max_attempts: 3,
                  status: "COMPLETED",
                  worker_id: "worker-1",
                }),
              }),
              executeTakeFirst: async () => ({
                id: "job-1",
                attempts: 1,
                max_attempts: 3,
                status: "COMPLETED",
                worker_id: "worker-1",
              }),
            }),
            executeTakeFirst: async () => ({
              id: "job-1",
              attempts: 1,
              max_attempts: 3,
              status: "COMPLETED",
              worker_id: "worker-1",
            }),
          }),
        }),
      }),
      updateTable: () => ({
        set: () => ({
          where: () => ({
            where: () => ({
              where: () => ({
                executeTakeFirst: async () => {
                  updateExecuted = true;
                  return { numUpdatedRows: 1n };
                },
              }),
              executeTakeFirst: async () => {
                updateExecuted = true;
                return { numUpdatedRows: 1n };
              },
            }),
            executeTakeFirst: async () => {
              updateExecuted = true;
              return { numUpdatedRows: 1n };
            },
          }),
        }),
      }),
    } as unknown as Kysely<Database>;

    const jobManager = createJobManager({
      db: mockDb,
      config: loadFleetManagerConfig(),
    });

    const result = await jobManager.markJobFailed(
      "job-1",
      "Worker timed out",
      "worker-1",
    );
    assert.equal(result, false);
    assert.equal(updateExecuted, false);
  });
});
