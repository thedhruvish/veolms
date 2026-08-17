import type { VideoQuality } from "@veolms/fleet-types";

export interface ChunkExecutionResult {
  readonly chunkId: string;
  readonly videoId: string;
  readonly status: "SUCCESS" | "FAILED";
  readonly durationMs: number;
  readonly renditionsProduced: readonly VideoQuality[];
  readonly uploadedKeys: readonly string[];
  readonly error?: string;
}
