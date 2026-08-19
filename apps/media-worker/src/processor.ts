import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { VideoQualityLevel } from "@veolms/fleet-types";
import { buildFfmpegHlsArgs, type VideoMetadata } from "./ffmpeg-builder.ts";
import { FfmpegProgressParser } from "./progress.ts";
import {
  createS3ClientFromConfig,
  downloadS3File,
  uploadDirectoryToS3,
} from "./s3.ts";
import type { MediaWorkerContext } from "./worker.ts";
import { resolve } from "node:url";

const execFileAsync = promisify(execFile);

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

  await recordEvent("JOB_STARTED", jobId, {
    videoKey: job.video_key,
    outputPrefix: job.output_prefix,
    qualities: job.requirements.qualities,
  });

  const s3Client = createS3ClientFromConfig(config);
  const jobScratchDir = join(config.SCRATCH_DIR, jobId);
  const inputVideoPath = join(jobScratchDir, "input.mp4");
  const outputHlsDir = join(jobScratchDir, "hls");

  try {
    await mkdir(jobScratchDir, { recursive: true });
    await mkdir(outputHlsDir, { recursive: true });

    // 3. Obtain source video (local file or S3 download)
    const localCandidates = [
      job.video_key,
      join(process.cwd(), job.video_key),
      join(process.cwd(), "s3-bucket", job.video_key),
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

    // 4. Probe Video Metadata
    const metadata = await probeVideoMetadata(
      inputVideoPath,
      config.FFPROBE_PATH,
    );

    // 5. Build FFmpeg command for requested qualities array
    const targetQualities: readonly VideoQualityLevel[] =
      job.requirements.qualities && job.requirements.qualities.length > 0
        ? job.requirements.qualities
        : ["1080p", "720p", "480p", "360p"];

    // Ensure quality subdirectories exist
    for (const q of targetQualities) {
      await mkdir(join(outputHlsDir, q), { recursive: true });
    }

    const { args, masterPlaylistContent, applicableQualities } =
      buildFfmpegHlsArgs({
        inputPath: inputVideoPath,
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

    // 10. Sync HLS artifacts to S3 if AWS credentials or S3 endpoint configured
    if (
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ||
      process.env.S3_ENDPOINT
    ) {
      try {
        await uploadDirectoryToS3(
          s3Client,
          config.S3_BUCKET,
          outputHlsDir,
          job.output_prefix,
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
