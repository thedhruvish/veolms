import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createWriteStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { MediaWorkerConfig } from "./config.ts";

export function createS3ClientFromConfig(config: MediaWorkerConfig): S3Client {
  return new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
  });
}

export async function downloadS3File(
  s3: S3Client,
  bucket: string,
  key: string,
  localDestinationPath: string,
): Promise<void> {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error(
      `Empty body received from S3 for bucket: ${bucket}, key: ${key}`,
    );
  }

  const writeStream = createWriteStream(localDestinationPath);
  await pipeline(response.Body as Readable, writeStream);
}

export async function downloadHttpFile(
  url: string,
  localDestinationPath: string,
): Promise<void> {
  const response = await fetch(url);

  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to download video from ${url}: HTTP ${response.status}`,
    );
  }

  // lib.dom's ReadableStream<Uint8Array> and node:stream/web's aren't
  // structurally identical (ArrayBufferView generic constraints diverge),
  // so this cast is required even though both describe the same runtime
  // web stream that fetch() actually returns under Node.
  const webStream = response.body as unknown as NodeReadableStream<Uint8Array>;

  const writeStream = createWriteStream(localDestinationPath);
  await pipeline(Readable.fromWeb(webStream), writeStream);
}

export function getMimeTypeForFile(filename: string): string {
  if (filename.endsWith(".m3u8")) {
    return "application/vnd.apple.mpegurl";
  }
  if (filename.endsWith(".ts")) {
    return "video/mp2t";
  }
  if (filename.endsWith(".mp4")) {
    return "video/mp4";
  }
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (filename.endsWith(".png")) {
    return "image/png";
  }
  if (filename.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}

export interface UploadItem {
  fullPath: string;
  s3Key: string;
  filename: string;
}

/**
 * Uploads a fixed, already-known list of files with a bounded worker pool
 * (each worker pulls the next item off a shared cursor), retrying each
 * file individually up to 3 times with exponential backoff. Shared by
 * uploadDirectoryToS3 (one-shot, whole directory) and
 * startIncrementalHlsUpload (repeated, growing batches as FFmpeg writes
 * new files).
 */
export async function uploadFiles(
  s3: S3Client,
  bucket: string,
  files: readonly UploadItem[],
  concurrency = 16,
): Promise<number> {
  if (files.length === 0) {
    return 0;
  }

  let uploadedCount = 0;
  let cursor = 0;

  async function uploadWorker(): Promise<void> {
    while (cursor < files.length) {
      const itemIndex = cursor++;
      const item = files[itemIndex];
      if (!item) {
        break;
      }

      const fileBuffer = await readFile(item.fullPath);
      const contentType = getMimeTypeForFile(item.filename);

      let attempts = 0;
      const maxRetries = 3;
      while (true) {
        try {
          await s3.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: item.s3Key,
              Body: fileBuffer,
              ContentType: contentType,
              CacheControl: item.filename.endsWith(".m3u8")
                ? "no-cache, no-store, must-revalidate"
                : "public, max-age=31536000, immutable",
            }),
          );
          uploadedCount++;
          break;
        } catch (err) {
          attempts++;
          if (attempts >= maxRetries) {
            throw err;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, 200 * Math.pow(2, attempts)),
          );
        }
      }
    }
  }

  const workerCount = Math.min(concurrency, files.length);
  const workers = Array.from({ length: workerCount }, () => uploadWorker());
  await Promise.all(workers);

  return uploadedCount;
}

export async function uploadDirectoryToS3(
  s3: S3Client,
  bucket: string,
  localDirectory: string,
  s3Prefix: string,
  concurrency = 16,
): Promise<number> {
  const cleanPrefix = s3Prefix.endsWith("/") ? s3Prefix : `${s3Prefix}/`;
  const fileList: UploadItem[] = [];

  async function collectFiles(
    currentDir: string,
    relativePath: string,
  ): Promise<void> {
    const entries = await readdir(currentDir);

    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const entryRelPath = relativePath ? `${relativePath}/${entry}` : entry;
      const fileStat = await stat(fullPath);

      if (fileStat.isDirectory()) {
        await collectFiles(fullPath, entryRelPath);
      } else if (fileStat.isFile()) {
        fileList.push({
          fullPath,
          s3Key: `${cleanPrefix}${entryRelPath}`,
          filename: entry,
        });
      }
    }
  }

  await collectFiles(localDirectory, "");
  return uploadFiles(s3, bucket, fileList, concurrency);
}

export interface IncrementalUploadHandle {
  /**
   * Stops the poll loop and runs one final sweep (no mtime-settle skip,
   * since the caller guarantees no writer is still touching localDir by
   * the time stop() is called) to catch anything the last poll missed —
   * in particular the master playlist, which FFmpeg's own writer doesn't
   * produce until after it exits.
   */
  stop: () => Promise<void>;
}

/**
 * Starts uploading HLS segments/playlists to S3 as FFmpeg generates them,
 * instead of waiting for the whole multi-quality encode to finish first.
 * Polls localDir every pollIntervalMs; a file is only picked up once it
 * hasn't been modified for settleMs, so a segment FFmpeg is still writing
 * is never uploaded half-written. Concurrency for each batch is resolved
 * fresh via getConcurrency() (typically backed by sampleResourceUsage()),
 * so upload parallelism backs off automatically under CPU/memory pressure.
 */
export function startIncrementalHlsUpload(options: {
  s3: S3Client;
  bucket: string;
  localDir: string;
  s3Prefix: string;
  pollIntervalMs: number;
  settleMs: number;
  getConcurrency: () => Promise<number>;
}): IncrementalUploadHandle {
  const {
    s3,
    bucket,
    localDir,
    s3Prefix,
    pollIntervalMs,
    settleMs,
    getConcurrency,
  } = options;
  const cleanPrefix = s3Prefix.endsWith("/") ? s3Prefix : `${s3Prefix}/`;
  const uploaded = new Set<string>();
  let ticking = false;

  async function collectPending(
    skipRecentlyModified: boolean,
  ): Promise<Array<UploadItem & { relPath: string }>> {
    const pending: Array<UploadItem & { relPath: string }> = [];
    const now = Date.now();

    async function walk(dir: string, rel: string): Promise<void> {
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        // localDir (or a quality subdir) may not exist yet on early ticks
        return;
      }

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const relPath = rel ? `${rel}/${entry}` : entry;
        if (uploaded.has(relPath)) {
          continue;
        }

        let fileStat;
        try {
          fileStat = await stat(fullPath);
        } catch {
          continue; // removed/renamed between readdir and stat
        }

        if (fileStat.isDirectory()) {
          await walk(fullPath, relPath);
        } else if (fileStat.isFile()) {
          if (skipRecentlyModified && now - fileStat.mtimeMs < settleMs) {
            continue;
          }
          pending.push({
            fullPath,
            s3Key: `${cleanPrefix}${relPath}`,
            filename: entry,
            relPath,
          });
        }
      }
    }

    await walk(localDir, "");
    return pending;
  }

  async function tick(finalSweep: boolean): Promise<void> {
    const pending = await collectPending(!finalSweep);
    if (pending.length === 0) {
      return;
    }

    const concurrency = await getConcurrency();
    // Only mark files uploaded once the batch actually succeeds — if it
    // throws, none of this batch is marked, so the next tick (or the
    // final sweep) retries the whole batch rather than silently losing a
    // file that failed partway through it.
    await uploadFiles(s3, bucket, pending, concurrency);
    for (const item of pending) {
      uploaded.add(item.relPath);
    }
  }

  const interval = setInterval(() => {
    if (ticking) {
      return;
    }
    ticking = true;
    tick(false)
      .catch((err: unknown) => {
        console.warn(
          "[media-worker] Incremental upload batch failed, will retry next tick:",
          err,
        );
      })
      .finally(() => {
        ticking = false;
      });
  }, pollIntervalMs);
  interval.unref();

  return {
    async stop() {
      clearInterval(interval);
      while (ticking) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await tick(true);
    },
  };
}
