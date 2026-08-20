import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { VideoQualityLevel } from "@veolms/fleet-types";
import {
  buildCompressionArgs,
  buildFfmpegHlsArgs,
  type VideoMetadata,
} from "./ffmpeg-builder.ts";
import { FfmpegProgressParser } from "./progress.ts";
import { sampleResourceUsage } from "./resource-monitor.ts";
import {
  createS3ClientFromConfig,
  downloadHttpFile,
  downloadS3File,
  startIncrementalHlsUpload,
  type IncrementalUploadHandle,
} from "./s3.ts";
import type { MediaWorkerConfig } from "./config.ts";
import type { MediaWorkerContext } from "./worker.ts";

const execFileAsync = promisify(execFile);

export function extractVideoExtension(videoKey: string): string {
  const withoutQuery = videoKey.split(/[?#]/)[0] ?? videoKey;
  const match = /\.([a-zA-Z0-9]{1,5})$/.exec(withoutQuery);
  return match?.[1]?.toLowerCase() ?? "mp4";
}

/**
 * Backs off upload parallelism under real system pressure (FFmpeg, not
 * this Node process, is what actually drives CPU/memory usage here) —
 * UPLOAD_MAX_CONCURRENCY normally, dropping to UPLOAD_MIN_CONCURRENCY once
 * either CPU or memory crosses its configured throttle threshold.
 */
async function resolveUploadConcurrency(
  config: MediaWorkerConfig,
): Promise<number> {
  const { cpuPercent, memoryPercent } = await sampleResourceUsage();
  const throttled =
    cpuPercent >= config.UPLOAD_THROTTLE_CPU_PERCENT ||
    memoryPercent >= config.UPLOAD_THROTTLE_MEMORY_PERCENT;
  return throttled ? config.UPLOAD_MIN_CONCURRENCY : config.UPLOAD_MAX_CONCURRENCY;
}

export async function probeVideoMetadata(
  videoPath: string,
  ffprobePath = "ffprobe",
): Promise<VideoMetadata> {
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=width,height,r_frame_rate",
      "-of",
      "json",
      videoPath,
    ]);

    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{
        width?: number;
        height?: number;
        r_frame_rate?: string;
      }>;
    };

    const durationSeconds = parseFloat(parsed.format?.duration ?? "600") || 600;
    const videoStream = parsed.streams?.find(
      (s) => typeof s.width === "number" && typeof s.height === "number",
    );

    return {
      durationSeconds,
      width: videoStream?.width ?? 1920,
      height: videoStream?.height ?? 1080,
    };
  } catch {
    // Default fallback if ffprobe is unavailable
    return {
      durationSeconds: 600,
      width: 1920,
      height: 1080,
    };
  }
}

export async function executeTranscodeJob(
  ctx: MediaWorkerContext,
  jobId: string,
): Promise<void> {
  const { db, config, workerId, recordEvent } = ctx;

  // 1. Fetch Job from DB
  const job = await db
    .selectFrom("jobs")
    .selectAll()
    .where("id", "=", jobId)
    .executeTakeFirst();

  if (!job) {
    throw new Error(`Job ${jobId} not found in database`);
  }

  // 2. Mark job & worker PROCESSING
  await db
    .updateTable("jobs")
    .set({
      status: "PROCESSING",
      worker_id: workerId,
      started_at: new Date(),
      updated_at: new Date(),
    })
    .where("id", "=", jobId)
    .execute();

  await db
    .updateTable("workers")
    .set({
      status: "PROCESSING",
      job_id: jobId,
      updated_at: new Date(),
    })
    .where("id", "=", workerId)
    .execute();

  // Reset this worker's monitoring row for the new job — it may be a
  // reused worker picking up a second/third job, whose estimated duration
  // and progress differ from the job it just finished. `next_check_at` set
  // to now makes it immediately "due", so the next fleet-manager
  // monitoring cycle recalculates a correct schedule from fresh values
  // rather than working off the previous job's numbers.
  await db
    .updateTable("worker_monitoring")
    .set({
      estimated_duration_sec: job.requirements.hardware.estimatedDurationSeconds,
      progress_percent: 0,
      last_progress_at: null,
      monitoring_attempts: 0,
      next_check_at: new Date(),
      updated_at: new Date(),
    })
    .where("worker_id", "=", workerId)
    .execute();

  await recordEvent("JOB_STARTED", jobId, {
    videoKey: job.video_key,
    outputPrefix: job.output_prefix,
    qualities: job.requirements.qualities,
  });

  const s3Client = createS3ClientFromConfig(config);
  const jobScratchDir = join(config.SCRATCH_DIR, jobId);
  const inputVideoPath = join(
    jobScratchDir,
    `originalvideo.${extractVideoExtension(job.video_key)}`,
  );
  const outputHlsDir = join(jobScratchDir, "hls");
  let uploadHandle: IncrementalUploadHandle | null = null;

  try {
    await mkdir(jobScratchDir, { recursive: true });
    await mkdir(outputHlsDir, { recursive: true });

    // 3. Obtain source video (HTTP(S) URL, local file, or S3 download)
    const isHttpUrl = /^https?:\/\//i.test(job.video_key);

    if (isHttpUrl) {
      await downloadHttpFile(job.video_key, inputVideoPath);
    } else {
      const localCandidates = [
        job.video_key,
        join(process.cwd(), job.video_key),
        join(process.cwd(), "s3-bucket", job.video_key),
        join(process.cwd(), "scratch", job.video_key),
        join(process.cwd(), "scratch/source-video.mp4"),
      ];
      let isLocalFile = false;
      for (const candidate of localCandidates) {
        if (existsSync(candidate)) {
          try {
            const s = await stat(candidate);
            if (s.isFile()) {
              await copyFile(candidate, inputVideoPath);
              isLocalFile = true;
              break;
            }
          } catch {
            // Ignore
          }
        }
      }

      if (!isLocalFile) {
        await downloadS3File(
          s3Client,
          config.S3_BUCKET,
          job.video_key,
          inputVideoPath,
        );
      }
    }

    // 4. Probe Video Metadata
    const sourceMetadata = await probeVideoMetadata(
      inputVideoPath,
      config.FFPROBE_PATH,
    );

    // 5. Build FFmpeg command for requested qualities array
    const targetQualities: readonly VideoQualityLevel[] =
      job.requirements.qualities && job.requirements.qualities.length > 0
        ? job.requirements.qualities
        : ["1080p", "720p", "480p", "360p"];

    // 4b. Compress the source once (CRF re-encode, capped to the largest
    // requested quality tier) before splitting it into renditions — avoids
    // carrying a full-resolution intermediate through the HLS split when
    // the job doesn't need it, and shrinks storage/read cost either way.
    const optimizedVideoPath = join(jobScratchDir, "optimized.mp4");
    const { args: compressionArgs } = buildCompressionArgs({
      inputPath: inputVideoPath,
      outputPath: optimizedVideoPath,
      qualities: targetQualities,
      metadata: sourceMetadata,
      crf: config.VIDEO_COMPRESSION_CRF,
    });

    await new Promise<void>((resolveCompression, rejectCompression) => {
      const compressionProcess = spawn(config.FFMPEG_PATH, compressionArgs, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      // Not parsed for progress (compression runs silently, ahead of the
      // HLS-split phase's progress reporting) — still drained to avoid the
      // OS pipe buffer filling up and stalling ffmpeg.
      compressionProcess.stdout?.on("data", () => {});

      let stderrOutput = "";
      compressionProcess.stderr?.on("data", (data: Buffer) => {
        stderrOutput += data.toString();
      });

      compressionProcess.on("exit", (code) => {
        if (code === 0) {
          resolveCompression();
        } else {
          rejectCompression(
            new Error(
              `FFmpeg compression pass exited with code ${code}: ${stderrOutput.slice(-500)}`,
            ),
          );
        }
      });

      compressionProcess.on("error", (err) => {
        rejectCompression(err);
      });
    });

    const metadata = await probeVideoMetadata(
      optimizedVideoPath,
      config.FFPROBE_PATH,
    );

    // Ensure quality subdirectories exist
    for (const q of targetQualities) {
      await mkdir(join(outputHlsDir, q), { recursive: true });
    }

    const { args, masterPlaylistContent, applicableQualities } =
      buildFfmpegHlsArgs({
        inputPath: optimizedVideoPath,
        outputDir: outputHlsDir,
        qualities: targetQualities,
        metadata,
        segmentDurationSeconds: job.requirements.segmentDurationSeconds ?? 6,
      });

    // 6. Setup progress tracking directly to PostgreSQL
    const progressParser = new FfmpegProgressParser({
      totalDurationSeconds: metadata.durationSeconds,
      throttleIntervalMs: config.PROGRESS_UPDATE_INTERVAL_MS,
      onProgress: async (progress) => {
        try {
          await db
            .updateTable("worker_monitoring")
            .set({
              progress_percent: progress.progressPercent,
              last_progress_at: new Date(),
              last_check_at: new Date(),
              updated_at: new Date(),
            })
            .where("worker_id", "=", workerId)
            .execute();
        } catch (err) {
          console.error("Error persisting progress to DB:", err);
        }
      },
    });

    // 6b. Start uploading segments/playlists as FFmpeg writes them, rather
    // than waiting for the whole multi-quality encode to finish.
    if (config.STORAGE_PROVIDER === "s3") {
      uploadHandle = startIncrementalHlsUpload({
        s3: s3Client,
        bucket: config.S3_BUCKET,
        localDir: outputHlsDir,
        s3Prefix: job.output_prefix,
        pollIntervalMs: config.INCREMENTAL_UPLOAD_POLL_MS,
        settleMs: config.INCREMENTAL_UPLOAD_SETTLE_MS,
        getConcurrency: () => resolveUploadConcurrency(config),
      });
    }

    // 7. Spawn and execute FFmpeg
    await new Promise<void>((resolve, reject) => {
      const ffmpegProcess = spawn(config.FFMPEG_PATH, [...args], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      ffmpegProcess.stdout?.on("data", (data: Buffer) => {
        progressParser.parseChunk(data);
      });

      let stderrOutput = "";
      ffmpegProcess.stderr?.on("data", (data: Buffer) => {
        stderrOutput += data.toString();
      });

      ffmpegProcess.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `FFmpeg exited with code ${code}: ${stderrOutput.slice(-500)}`,
            ),
          );
        }
      });

      ffmpegProcess.on("error", (err) => {
        reject(err);
      });
    });

    // 8. Write master playlist file
    const masterPlaylistPath = join(outputHlsDir, "master.m3u8");
    await writeFile(masterPlaylistPath, masterPlaylistContent, "utf-8");

    // 9. Sync HLS artifacts to local folder
    try {
      const cleanPrefix = job.output_prefix.replace(/^s3-bucket\//, "");
      const targets = [
        join(process.cwd(), "s3-bucket", cleanPrefix),
        join(process.cwd(), "veolms", "s3-bucket", cleanPrefix),
        join(process.cwd(), "..", "s3-bucket", cleanPrefix),
        join(process.cwd(), "..", "veolms", "s3-bucket", cleanPrefix),
      ];
      for (const localTargetDir of targets) {
        try {
          await mkdir(localTargetDir, { recursive: true });
          await cp(outputHlsDir, localTargetDir, {
            recursive: true,
            force: true,
          });
          console.info(
            `[media-worker] HLS artifacts saved locally to ${localTargetDir}`,
          );
        } catch (targetErr) {
          console.warn("[media-worker] Target sync attempt notice:", targetErr);
        }
      }
    } catch (localErr) {
      console.warn("[media-worker] Local sync notice:", localErr);
    }

    // 10. Final sweep of the incremental S3 upload — everything the poll
    // loop already picked up while FFmpeg was running is done; this just
    // catches the master playlist (only written above, after FFmpeg
    // exits) and any last segments from the final poll window.
    if (uploadHandle) {
      try {
        await uploadHandle.stop();
        uploadHandle = null;
        console.info(
          `[media-worker] Finished uploading HLS output to s3://${config.S3_BUCKET}/${job.output_prefix}`,
        );
      } catch (s3Err) {
        console.warn("[media-worker] S3 upload notice:", s3Err);
      }
    }

    // 10. Mark COMPLETED in DB
    await db
      .updateTable("jobs")
      .set({
        status: "COMPLETED",
        completed_at: new Date(),
        updated_at: new Date(),
      })
      .where("id", "=", jobId)
      .execute();

    await db
      .updateTable("workers")
      .set({
        status: "COMPLETED",
        updated_at: new Date(),
      })
      .where("id", "=", workerId)
      .execute();

    await db
      .updateTable("worker_monitoring")
      .set({
        progress_percent: 100.0,
        last_progress_at: new Date(),
        updated_at: new Date(),
      })
      .where("worker_id", "=", workerId)
      .execute();

    await recordEvent("JOB_COMPLETED", jobId, {
      applicableQualities,
      outputPrefix: job.output_prefix,
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Transcode job ${jobId} failed:`, errorMsg);

    // Job failed partway through FFmpeg — whatever segments the
    // incremental uploader already picked up (or is mid-batch on) are
    // left in S3 rather than cleaned up (a retry reuses the same
    // output_prefix and overwrites what it regenerates), but flush one
    // more sweep so anything still sitting locally, unsynced, isn't lost
    // outright once the scratch dir gets wiped in `finally` below.
    if (uploadHandle) {
      try {
        await uploadHandle.stop();
      } catch (s3Err) {
        console.warn(
          "[media-worker] S3 flush-on-failure notice:",
          s3Err,
        );
      }
      uploadHandle = null;
    }

    await db
      .updateTable("jobs")
      .set({
        status: "FAILED",
        failed_at: new Date(),
        error_message: errorMsg,
        updated_at: new Date(),
      })
      .where("id", "=", jobId)
      .execute();

    await db
      .updateTable("workers")
      .set({
        status: "FAILED",
        updated_at: new Date(),
      })
      .where("id", "=", workerId)
      .execute();

    await recordEvent("JOB_FAILED", jobId, {
      error: errorMsg,
    });

    throw error;
  } finally {
    // Clean up scratch files
    try {
      await rm(jobScratchDir, { recursive: true, force: true });
    } catch {
      // Ignored
    }
  }
}
