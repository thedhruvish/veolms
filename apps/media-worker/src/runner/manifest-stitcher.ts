import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { VideoQuality } from "@veolms/fleet-types";

import type { StorageAdapter } from "../storage/types.ts";
import type { ScratchWorkspaceManager } from "../storage/workspace.ts";

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

export interface FinalizeManifestOptions {
  readonly videoId: string;
  readonly requestedQualities: readonly VideoQuality[];
  readonly chunks: readonly { id: string; chunk_index: number }[];
}

export interface ManifestStitcherOptions {
  readonly prodStorage: StorageAdapter;
  readonly tempStorage: StorageAdapter;
  readonly workspace: ScratchWorkspaceManager;
}

/**
 * ManifestStitcher: Worker-side coordinator that reads chunk playlists from storage,
 * concatenates them into unified multi-bitrate HLS streams, uploads master.m3u8,
 * and auto-prunes temporary chunk cuts.
 */
export class ManifestStitcher {
  private readonly prodStorage: StorageAdapter;
  private readonly tempStorage: StorageAdapter;
  private readonly workspace: ScratchWorkspaceManager;

  constructor(options: ManifestStitcherOptions) {
    this.prodStorage = options.prodStorage;
    this.tempStorage = options.tempStorage;
    this.workspace = options.workspace;
  }

  /**
   * Stitches together chunk-level HLS playlists into unified quality streams and master.m3u8.
   */
  async stitchAndUpload(options: FinalizeManifestOptions): Promise<string> {
    const { videoId, requestedQualities, chunks } = options;
    const sortedChunks = [...chunks].sort((a, b) => a.chunk_index - b.chunk_index);

    const workspacePaths = await this.workspace.createChunkWorkspace(
      `finalizer-${videoId}`,
    );
    const workDir = workspacePaths.outputDir;
    const availableQualities: VideoQuality[] = [];

    try {
      for (const quality of requestedQualities) {
        const allSegments: ChunkSegment[][] = [];
        let maxTargetDuration = 6;

        for (const chunk of sortedChunks) {
          const remoteChunkPlaylistKey = `videos/${videoId}/chunks/${chunk.id}/${quality}.m3u8`;
          const localChunkPlaylistPath = join(workDir, `${chunk.id}_${quality}.m3u8`);

          try {
            await this.prodStorage.downloadFile(remoteChunkPlaylistKey, localChunkPlaylistPath);
            const content = await readFile(localChunkPlaylistPath, "utf-8");
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
            // If quality not present in this chunk, skip
          }
        }

        if (allSegments.length > 0) {
          availableQualities.push(quality);

          const playlistLines: string[] = [
            "#EXTM3U",
            "#EXT-X-VERSION:3",
            `#EXT-X-TARGETDURATION:${maxTargetDuration}`,
            "#EXT-X-MEDIA-SEQUENCE:0",
            "#EXT-X-PLAYLIST-TYPE:VOD",
          ];

          for (let chunkIdx = 0; chunkIdx < allSegments.length; chunkIdx++) {
            const chunkSegs = allSegments[chunkIdx]!;
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

          const localQualityPath = join(workDir, `${quality}.m3u8`);
          await writeFile(localQualityPath, playlistLines.join("\n"), "utf-8");

          // Upload unified rendition playlist to production storage
          const remoteQualityKey = `videos/${videoId}/${quality}.m3u8`;
          await this.prodStorage.uploadFile(localQualityPath, remoteQualityKey);
        }
      }

      // Assemble and upload Master HLS Manifest
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

      const localMasterPath = join(workDir, "master.m3u8");
      await writeFile(localMasterPath, masterLines.join("\n"), "utf-8");

      const remoteMasterKey = `videos/${videoId}/master.m3u8`;
      await this.prodStorage.uploadFile(localMasterPath, remoteMasterKey);

      // Clean up intermediate raw chunk cuts in temp storage
      for (const chunk of sortedChunks) {
        await this.tempStorage.deleteFile(`chunks/${chunk.id}.mp4`).catch(() => {});
        await this.tempStorage.deleteFile(`videos/${videoId}/chunks/${chunk.id}.mp4`).catch(() => {});
      }

      return remoteMasterKey;
    } finally {
      await this.workspace.cleanupChunkWorkspace(`finalizer-${videoId}`);
    }
  }
}
