import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  getCompletedChunksCountForVideo,
  listActiveVideoJobs,
  updateVideoJobStatus,
} from "@veolms/database";
import type { VideoQuality } from "@veolms/fleet-types";

import type { CoordinationContext } from "./types.ts";

const QUALITY_HLS_MAP: Record<
  VideoQuality,
  { bandwidth: number; resolution: string }
> = {
  "144p": { bandwidth: 150000, resolution: "256x144" },
  "240p": { bandwidth: 300000, resolution: "426x240" },
  "360p": { bandwidth: 500000, resolution: "640x360" },
  "480p": { bandwidth: 800000, resolution: "854x480" },
  "540p": { bandwidth: 1100000, resolution: "960x540" },
  "720p": { bandwidth: 1500000, resolution: "1280x720" },
  "900p": { bandwidth: 2200000, resolution: "1600x900" },
  "1080p": { bandwidth: 3000000, resolution: "1920x1080" },
  "1440p": { bandwidth: 6000000, resolution: "2560x1440" },
  "2160p": { bandwidth: 13000000, resolution: "3840x2160" },
  "4320p": { bandwidth: 25000000, resolution: "7680x4320" },
};

interface ChunkSegment {
  readonly duration: number;
  readonly uri: string;
}

/**
 * ManifestFinalizerCoordinator: Detects when all chunks for a video are finished,
 * concatenates and stitches HLS segment playlists for each rendition, generates the
 * unified master.m3u8 manifest, and marks the video job as COMPLETED.
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

        // 2. Assemble Master Manifest and Quality Renditions on Disk / Storage
        try {
          await this.assembleHlsPlaylists(job.id, job.requestedQualities);
        } catch (err) {
          console.error(
            `Error assembling master manifest for video ${job.id}:`,
            err,
          );
        }

        // 3. Generate final master manifest key
        const masterManifestKey = `videos/${job.id}/master.m3u8`;

        // 4. Mark video as COMPLETED
        await updateVideoJobStatus(this.context.database, job.id, "COMPLETED", {
          outputManifestKey: masterManifestKey,
        });

        finalizedVideoIds.push(job.id);
      }
    }

    return finalizedVideoIds;
  }

  /**
   * Stitches together chunk-level HLS playlists into unified stream playlists and master.m3u8.
   */
  private async assembleHlsPlaylists(
    videoId: string,
    requestedQualities: readonly VideoQuality[],
  ): Promise<void> {
    const storageBase = resolve(
      process.env.STORAGE_BASE_PATH || process.env.STORAGE_DIR || "s3-bucket",
    );
    const videoRootDir = join(storageBase, `videos/${videoId}`);
    await mkdir(videoRootDir, { recursive: true });

    // Fetch all completed chunks ordered by index
    const chunks = await this.context.database
      .selectFrom("video_chunks")
      .select(["id", "chunk_index", "status"])
      .where("video_id", "=", videoId)
      .where("status", "=", "COMPLETED")
      .orderBy("chunk_index", "asc")
      .execute();

    if (chunks.length === 0) {
      return;
    }

    const availableQualities: VideoQuality[] = [];

    // For each requested quality, build concatenated playlist
    for (const quality of requestedQualities) {
      const allSegments: ChunkSegment[][] = [];
      let maxTargetDuration = 6;

      for (const chunk of chunks) {
        const chunkPlaylistPath = join(
          videoRootDir,
          `chunks/${chunk.id}/${quality}.m3u8`,
        );

        try {
          const content = await readFile(chunkPlaylistPath, "utf-8");
          const lines = content.split("\n");
          const chunkSegments: ChunkSegment[] = [];

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]?.trim();
            if (!line) continue;

            if (line.startsWith("#EXT-X-TARGETDURATION:")) {
              const targetDur = parseInt(
                line.replace("#EXT-X-TARGETDURATION:", ""),
                10,
              );
              if (!isNaN(targetDur) && targetDur > maxTargetDuration) {
                maxTargetDuration = targetDur;
              }
            } else if (line.startsWith("#EXTINF:")) {
              const durationStr = line
                .replace("#EXTINF:", "")
                .replace(/,.*$/, "");
              const duration = parseFloat(durationStr) || 6;
              const nextLine = lines[i + 1]?.trim();
              if (nextLine && !nextLine.startsWith("#")) {
                chunkSegments.push({
                  duration,
                  uri: `chunks/${chunk.id}/${nextLine}`,
                });
                i += 1;
              }
            }
          }

          if (chunkSegments.length > 0) {
            allSegments.push(chunkSegments);
          }
        } catch {
          // If chunk playlist doesn't exist for this quality, skip
        }
      }

      if (allSegments.length > 0) {
        availableQualities.push(quality);

        // Assemble unified quality playlist
        const playlistLines: string[] = [
          "#EXTM3U",
          "#EXT-X-VERSION:3",
          `#EXT-X-TARGETDURATION:${maxTargetDuration}`,
          "#EXT-X-MEDIA-SEQUENCE:0",
          "#EXT-X-PLAYLIST-TYPE:VOD",
        ];

        for (let chunkIdx = 0; chunkIdx < allSegments.length; chunkIdx++) {
          const chunkSegs = allSegments[chunkIdx]!;

          // Insert discontinuity tag between chunk boundaries to signal PTS reset
          if (chunkIdx > 0) {
            playlistLines.push("#EXT-X-DISCONTINUITY");
          }

          for (const seg of chunkSegs) {
            playlistLines.push(`#EXTINF:${seg.duration.toFixed(6)},`);
            playlistLines.push(seg.uri);
          }
        }

        playlistLines.push("#EXT-X-ENDLIST");
        playlistLines.push("");

        const outputQualityPath = join(videoRootDir, `${quality}.m3u8`);
        await writeFile(outputQualityPath, playlistLines.join("\n"), "utf-8");
      }
    }

    // Assemble Master HLS Manifest
    const masterLines: string[] = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-INDEPENDENT-SEGMENTS",
      "",
    ];

    const qualitiesToInclude =
      availableQualities.length > 0 ? availableQualities : requestedQualities;

    for (const quality of qualitiesToInclude) {
      const meta = QUALITY_HLS_MAP[quality] ?? {
        bandwidth: 800000,
        resolution: "854x480",
      };
      masterLines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${meta.bandwidth},RESOLUTION=${meta.resolution},NAME="${quality}"`,
      );
      masterLines.push(`${quality}.m3u8`);
      masterLines.push("");
    }

    const masterManifestPath = join(videoRootDir, "master.m3u8");
    await writeFile(masterManifestPath, masterLines.join("\n"), "utf-8");
    console.log(
      `[ManifestFinalizer] Assembled Master HLS Manifest: ${masterManifestPath} (${qualitiesToInclude.join(", ")})`,
    );
  }
}
