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
});
