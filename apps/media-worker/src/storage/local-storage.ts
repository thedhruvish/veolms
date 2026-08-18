import { copyFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

import type { StorageAdapter } from "./types.ts";

/**
 * Local file-system storage adapter for local development, offline runs, and integration testing.
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly driverType = "local";
  private readonly rootStorageDir: string;

  constructor(rootStorageDir = "/tmp/veolms-storage") {
    this.rootStorageDir = resolve(rootStorageDir);
  }

  private resolveKey(key: string): string {
    const cleanKey = key.replace(/^\/+/, "");
    return join(this.rootStorageDir, cleanKey);
  }

  async downloadFile(
    remoteKey: string,
    localDestinationPath: string,
  ): Promise<void> {
    const sourcePath = this.resolveKey(remoteKey);
    await mkdir(dirname(localDestinationPath), { recursive: true });
    await copyFile(sourcePath, localDestinationPath);
  }

  async uploadFile(
    localSourcePath: string,
    remoteDestinationKey: string,
  ): Promise<void> {
    const destPath = this.resolveKey(remoteDestinationKey);
    await mkdir(dirname(destPath), { recursive: true });
    await copyFile(localSourcePath, destPath);
  }

  async uploadDirectory(
    localSourceDir: string,
    remoteDestinationPrefix: string,
    concurrency = 16,
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
    const tasks = allFiles.map((filePath) => {
      const relPath = relative(localSourceDir, filePath);
      const remoteKey = `${cleanPrefix}/${relPath}`;
      return { filePath, remoteKey };
    });

    let currentIndex = 0;
    const worker = async () => {
      while (currentIndex < tasks.length) {
        const item = tasks[currentIndex++];
        if (!item) break;
        await this.uploadFile(item.filePath, item.remoteKey);
        uploadedKeys.push(item.remoteKey);
      }
    };

    const workerCount = Math.min(concurrency, Math.max(1, tasks.length));
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);

    return uploadedKeys;
  }

  async exists(remoteKey: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(remoteKey));
      return true;
    } catch {
      return false;
    }
  }

  async deleteFile(remoteKey: string): Promise<void> {
    try {
      await unlink(this.resolveKey(remoteKey));
    } catch {
      // Ignore if file doesn't exist
    }
  }
}
