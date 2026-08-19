import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createWriteStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
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

export async function uploadDirectoryToS3(
  s3: S3Client,
  bucket: string,
  localDirectory: string,
  s3Prefix: string,
  concurrency = 16,
): Promise<number> {
  const cleanPrefix = s3Prefix.endsWith("/") ? s3Prefix : `${s3Prefix}/`;
  const fileList: Array<{ fullPath: string; s3Key: string; filename: string }> =
    [];

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

  if (fileList.length === 0) {
    return 0;
  }

  let uploadedCount = 0;
  let cursor = 0;

  async function uploadWorker(): Promise<void> {
    while (cursor < fileList.length) {
      const itemIndex = cursor++;
      const item = fileList[itemIndex];
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

  const workerCount = Math.min(concurrency, fileList.length);
  const workers = Array.from({ length: workerCount }, () => uploadWorker());
  await Promise.all(workers);

  return uploadedCount;
}
