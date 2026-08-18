import {
  getCompletedChunksCountForVideo,
  listActiveVideoJobs,
  updateVideoJobStatus,
} from "@veolms/database";

import type { CoordinationContext } from "./types.ts";

/**
 * ManifestFinalizerCoordinator: Central control plane watchdog that tracks video completion,
 * audits finalizing video jobs, and marks video jobs COMPLETED.
 *
 * Distributed workers perform atomic manifest stitching and upload master.m3u8 directly
 * upon completing the final chunk, keeping the control plane 100% lightweight.
 */
export class ManifestFinalizerCoordinator {
  private readonly context: CoordinationContext;

  constructor(context: CoordinationContext) {
    this.context = context;
  }

  /**
   * Scans active video jobs and finalizes any that have completed all their chunks.
   */
  async finalizeCompletedVideos(): Promise<readonly string[]> {
    const activeJobs = await listActiveVideoJobs(this.context.database);
    const finalizedVideoIds: string[] = [];

    for (const job of activeJobs) {
      if (job.status === "COMPLETED" || job.status === "FAILED") {
        continue;
      }

      // Check how many chunks have actually completed
      const completedChunks = await getCompletedChunksCountForVideo(
        this.context.database,
        job.id,
      );

      if (completedChunks >= job.chunkCount && job.chunkCount > 0) {
        const masterManifestKey =
          job.outputManifestKey || `videos/${job.id}/master.m3u8`;

        // Mark video as COMPLETED
        await updateVideoJobStatus(this.context.database, job.id, "COMPLETED", {
          outputManifestKey: masterManifestKey,
        });

        finalizedVideoIds.push(job.id);
      }
    }

    return finalizedVideoIds;
  }
}
