import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface ChunkWorkspacePaths {
  readonly rootDir: string;
  readonly inputDir: string;
  readonly outputDir: string;
  readonly sourceFilePath: string;
  readonly masterPlaylistPath: string;
}

/**
 * Manages ephemeral scratch directories and file lifecycle for active transcoding jobs.
 */
export class ScratchWorkspaceManager {
  readonly rootScratchDir: string;
  readonly workerId: string;

  private sanitizeId(id: string): string {
    const clean = id.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!clean) {
      throw new Error(
        `Security Violation: Invalid or empty identifier: "${id}"`,
      );
    }
    return clean;
  }

  constructor(rootScratchDir = "/tmp/veolms-media-worker", workerId: string) {
    this.workerId = this.sanitizeId(workerId);
    this.rootScratchDir = resolve(rootScratchDir, this.workerId);
  }

  /**
   * Derives standardized filesystem paths for a specific chunk execution.
   */
  getChunkPaths(chunkId: string): ChunkWorkspacePaths {
    const safeChunkId = this.sanitizeId(chunkId);
    const chunkRootDir = resolve(this.rootScratchDir, "chunks", safeChunkId);

    if (!chunkRootDir.startsWith(this.rootScratchDir)) {
      throw new Error(
        `Security Violation: Chunk path traversal detected for chunkId: "${chunkId}"`,
      );
    }

    const inputDir = join(chunkRootDir, "input");
    const outputDir = join(chunkRootDir, "output");
    const sourceFilePath = join(inputDir, "source.mp4");
    const masterPlaylistPath = join(outputDir, "chunk.m3u8");

    return {
      rootDir: chunkRootDir,
      inputDir,
      outputDir,
      sourceFilePath,
      masterPlaylistPath,
    };
  }

  /**
   * Initializes clean input and output directories for a chunk.
   */
  async createChunkWorkspace(chunkId: string): Promise<ChunkWorkspacePaths> {
    const paths = this.getChunkPaths(chunkId);
    await mkdir(paths.inputDir, { recursive: true });
    await mkdir(paths.outputDir, { recursive: true });
    return paths;
  }

  /**
   * Safely purges temporary files and directories for a completed/failed chunk.
   */
  async cleanupChunkWorkspace(chunkId: string): Promise<void> {
    const paths = this.getChunkPaths(chunkId);
    try {
      await rm(paths.rootDir, { recursive: true, force: true });
    } catch {
      // Ignore if directory already removed
    }
  }

  /**
   * Purges the entire worker scratch root on process shutdown.
   */
  async purgeWorkerWorkspace(): Promise<void> {
    try {
      await rm(this.rootScratchDir, { recursive: true, force: true });
    } catch {
      // Ignore if directory already removed
    }
  }
}
