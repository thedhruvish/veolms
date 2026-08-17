import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { StorageAdapter } from "./types.ts";

export interface S3StorageConfig {
  readonly bucket: string;
  readonly region?: string;
  readonly endpoint?: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly forcePathStyle?: boolean;
}

function getContentType(filePath: string): string {
  if (filePath.endsWith(".m3u8")) {
    return "application/vnd.apple.mpegurl";
  }
  if (filePath.endsWith(".ts")) {
    return "video/MP2T";
  }
  if (filePath.endsWith(".mp4")) {
    return "video/mp4";
  }
  if (filePath.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}

/**
 * S3-compatible Object Storage Adapter supporting AWS S3, Cloudflare R2, MinIO, Wasabi, etc.
 */
export class S3StorageAdapter implements StorageAdapter {
  readonly driverType = "s3";
  readonly bucket: string;
  private readonly client: S3Client;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;

    const credentials =
      config.accessKeyId && config.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          }
        : undefined;

    this.client = new S3Client({
      region: config.region || process.env.AWS_REGION || "us-east-1",
      endpoint: config.endpoint || process.env.S3_ENDPOINT,
      credentials,
      forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
    });
  }

  private cleanKey(key: string): string {
    return key.replace(/^\/+/, "");
  }

  async downloadFile(
    remoteKey: string,
    localDestinationPath: string,
  ): Promise<void> {
    const key = this.cleanKey(remoteKey);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`S3 GetObject returned empty body for key: ${key}`);
    }

    const localResolved = resolve(localDestinationPath);
    await mkdir(dirname(localResolved), { recursive: true });

    const writeStream = createWriteStream(localResolved);
    await pipeline(response.Body as NodeJS.ReadableStream, writeStream);
  }

  async uploadFile(
    localSourcePath: string,
    remoteDestinationKey: string,
  ): Promise<void> {
    const key = this.cleanKey(remoteDestinationKey);
    const localResolved = resolve(localSourcePath);
    const fileStats = await stat(localResolved);

    const fileStream = createReadStream(localResolved);
    const contentType = getContentType(localSourcePath);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: fileStream,
      ContentLength: fileStats.size,
      ContentType: contentType,
    });

    await this.client.send(command);
  }

  async uploadDirectory(
    localSourceDir: string,
    remoteDestinationPrefix: string,
  ): Promise<readonly string[]> {
    const uploadedKeys: string[] = [];

    async function walk(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...(await walk(fullPath)));
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
      return files;
    }

    let allFiles: string[] = [];
    try {
      allFiles = await walk(localSourceDir);
    } catch {
      return [];
    }

    const cleanPrefix = remoteDestinationPrefix.replace(/\/+$/, "");

    for (const filePath of allFiles) {
      const relPath = relative(localSourceDir, filePath);
      const remoteKey = `${cleanPrefix}/${relPath}`;
      await this.uploadFile(filePath, remoteKey);
      uploadedKeys.push(remoteKey);
    }

    return uploadedKeys;
  }

  async exists(remoteKey: string): Promise<boolean> {
    const key = this.cleanKey(remoteKey);
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async deleteFile(remoteKey: string): Promise<void> {
    const key = this.cleanKey(remoteKey);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch {
      // Ignore if not present
    }
  }
}
