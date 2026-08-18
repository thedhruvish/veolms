import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ffmpeg from "fluent-ffmpeg";

import { filterRenditionsForSource } from "./filter.ts";
import { detectHardwareEncoder } from "./hwaccel.ts";
import { probeMedia } from "./probe.ts";
import type {
  NormalizedProgress,
  RenditionSpec,
  TranscodingOptions,
  TranscodingResult,
} from "./types.ts";

function parseTimemark(timemark?: string): number {
  if (!timemark) return 0;
  const parts = timemark.split(":");
  if (parts.length === 3) {
    const hours = parseFloat(parts[0] ?? "0") || 0;
    const minutes = parseFloat(parts[1] ?? "0") || 0;
    const seconds = parseFloat(parts[2] ?? "0") || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }
  return parseFloat(timemark) || 0;
}

/**
 * FluentFfmpegTranscoder: Uses fluent-ffmpeg to execute video transcoding jobs,
 * enforcing CRF 22 encoding standards, No-Upscaling clamping, and multi-rendition HLS segmentation.
 */
export class FluentFfmpegTranscoder {
  private activeCommand: ffmpeg.FfmpegCommand | null = null;

  /**
   * Immediately terminates any active FFmpeg child process to prevent orphan/zombie leaks.
   */
  abort(): void {
    if (this.activeCommand) {
      try {
        this.activeCommand.kill("SIGKILL");
      } catch {
        // Ignore if already terminated
      }
      this.activeCommand = null;
    }
  }

  /**
   * Transcodes source video chunk into multi-rendition HLS streams.
   */
  async transcodeChunk(
    options: TranscodingOptions,
  ): Promise<TranscodingResult> {
    const startTime = Date.now();

    // 1. Probe input source video to get native resolution and duration
    const probe = await probeMedia(options.sourcePath);
    const totalDurationSeconds =
      options.sourceDurationSeconds && options.sourceDurationSeconds > 0
        ? options.sourceDurationSeconds
        : probe.durationSeconds > 0
          ? probe.durationSeconds
          : 60;

    // 2. Filter renditions to enforce the No-Upscaling rule
    const targetRenditions = filterRenditionsForSource(
      options.requestedQualities,
      probe.height,
    );

    const crf = options.crf ?? 22;
    const preset = options.preset ?? "veryfast";
    const segmentDuration = options.hlsSegmentDuration ?? 6;

    // 3. Ensure output directory exists
    await mkdir(options.outputDir, { recursive: true });

    // 4. Transcode each rendition
    const successfulRenditions: RenditionSpec[] = [];
    const hwInfo = await detectHardwareEncoder(
      process.env.FORCE_SOFTWARE_ENCODER === "true",
    );

    for (let i = 0; i < targetRenditions.length; i++) {
      const rendition = targetRenditions[i];
      if (!rendition) continue;

      const renditionPlaylistPath = join(
        options.outputDir,
        `${rendition.quality}.m3u8`,
      );
      const segmentPattern = join(
        options.outputDir,
        `${rendition.quality}_%03d.ts`,
      );

      await new Promise<void>((resolve, reject) => {
        const cmd = ffmpeg(options.sourcePath).videoCodec(hwInfo.encoder);
        this.activeCommand = cmd;

        const videoOptions =
          hwInfo.type === "nvenc"
            ? [
                `-cq ${crf}`,
                "-preset p3",
                "-profile:v main",
                "-g 48",
                "-keyint_min 48",
                `-vf scale=w=${rendition.width}:h=${rendition.height}:force_original_aspect_ratio=decrease,pad=${rendition.width}:${rendition.height}:(ow-iw)/2:(oh-ih)/2`,
                `-maxrate ${rendition.maxBitrateKbps}k`,
                `-bufsize ${rendition.bufSizeKbps}k`,
              ]
            : [
                `-crf ${crf}`,
                `-preset ${preset}`,
                "-profile:v main",
                "-sc_threshold 0",
                "-g 48",
                "-keyint_min 48",
                `-vf scale=w=${rendition.width}:h=${rendition.height}:force_original_aspect_ratio=decrease,pad=${rendition.width}:${rendition.height}:(ow-iw)/2:(oh-ih)/2`,
                `-maxrate ${rendition.maxBitrateKbps}k`,
                `-bufsize ${rendition.bufSizeKbps}k`,
              ];

        cmd.outputOptions(videoOptions);

        if (probe.hasAudio) {
          cmd
            .audioCodec("aac")
            .outputOptions([
              `-b:a ${rendition.audioBitrateKbps}k`,
              "-ar 48000",
              "-ac 2",
            ]);
        } else {
          cmd.noAudio();
        }

        cmd
          .outputOptions([
            "-f hls",
            `-hls_time ${segmentDuration}`,
            "-hls_playlist_type vod",
            `-hls_segment_filename ${segmentPattern}`,
          ])
          .output(renditionPlaylistPath);

        cmd.on(
          "progress",
          (progress: {
            percent?: number;
            currentFps?: number;
            currentKbps?: number;
            frames?: number;
            timemark?: string;
          }) => {
            let calculatedPercent = progress.percent ?? 0;
            if (!calculatedPercent || calculatedPercent <= 0) {
              const currentSeconds = parseTimemark(progress.timemark);
              calculatedPercent =
                totalDurationSeconds > 0
                  ? (currentSeconds / totalDurationSeconds) * 100
                  : 0;
            }

            // Scale progress across multiple renditions
            const overallPercent =
              (i / targetRenditions.length) * 100 +
              calculatedPercent / targetRenditions.length;

            const effectiveFps = probe.fps > 0 ? probe.fps : 30;
            const etaSeconds =
              progress.currentFps && progress.currentFps > 0
                ? Math.max(
                    0,
                    Math.round(
                      (totalDurationSeconds * effectiveFps -
                        (progress.frames ?? 0)) /
                        progress.currentFps,
                    ),
                  )
                : undefined;

            const normalized: NormalizedProgress = {
              percent: Number(Math.min(100, overallPercent).toFixed(1)),
              fps: progress.currentFps ?? 0,
              currentKbps: progress.currentKbps ?? rendition.maxBitrateKbps,
              speed: "1.0x",
              framesProcessed: progress.frames ?? 0,
              etaSeconds,
            };

            options.onProgress?.(normalized);
          },
        );

        cmd.on("end", () => {
          this.activeCommand = null;
          successfulRenditions.push(rendition);
          resolve();
        });

        cmd.on("error", (err: Error) => {
          this.activeCommand = null;
          reject(
            new Error(
              `FFmpeg transcoding failed for rendition ${rendition.quality}: ${err.message}`,
            ),
          );
        });

        cmd.run();
      });
    }

    // 4. Generate master HLS playlist referencing all generated renditions
    const masterPlaylistPath = join(options.outputDir, "master.m3u8");
    let masterContent = "#EXTM3U\n#EXT-X-VERSION:3\n";

    for (const spec of successfulRenditions) {
      const audioBitrate = probe.hasAudio ? spec.audioBitrateKbps : 0;
      const bandwidth = (spec.maxBitrateKbps + audioBitrate) * 1000;
      masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${spec.width}x${spec.height}\n`;
      masterContent += `${spec.quality}.m3u8\n`;
    }

    await writeFile(masterPlaylistPath, masterContent, "utf-8");

    const durationMs = Date.now() - startTime;

    return {
      success: true,
      renditions: successfulRenditions.map((r) => r.quality),
      masterPlaylistPath,
      outputDir: options.outputDir,
      durationMs,
    };
  }
}
