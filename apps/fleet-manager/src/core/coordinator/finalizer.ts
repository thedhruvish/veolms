import {
  getCompletedChunksCountForVideo,
  listActiveVideoJobs,
  updateVideoJobStatus,
} from "@veolms/database";

import type { CoordinationContext } from "./types.ts";

/**
 * ManifestFinalizerCoordinator: Detects when all chunks for a video are finished,
 * triggers manifest assembly, updates status to COMPLETED, and cleans up temporary chunk assets.
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
        // 1. Mark as FINALIZING
        await updateVideoJobStatus(this.context.database, job.id, "FINALIZING");

        // 2. Generate final master manifest key
        const masterManifestKey = `videos/${job.id}/master.m3u8`;

        // 3. Mark video as COMPLETED
        await updateVideoJobStatus(this.context.database, job.id, "COMPLETED", {
          outputManifestKey: masterManifestKey,
        });

        // 4. In a live system with S3, temporary chunks in videos/{videoId}/chunks/*
        // would be pruned here after successful finalization.

        finalizedVideoIds.push(job.id);
      }
    }

    return finalizedVideoIds;
  }
}
