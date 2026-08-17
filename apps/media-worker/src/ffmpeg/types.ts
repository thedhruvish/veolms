import type { VideoQuality } from "@veolms/fleet-types";

export interface ProbeResult {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly codec: string;
  readonly durationSeconds: number;
  readonly audioChannels: number;
  readonly audioBitrateKbps: number;
}

export interface RenditionSpec {
  readonly quality: VideoQuality;
  readonly width: number;
  readonly height: number;
  readonly maxBitrateKbps: number;
  readonly bufSizeKbps: number;
  readonly audioBitrateKbps: number;
}

export interface NormalizedProgress {
  readonly percent: number;
  readonly fps: number;
  readonly currentKbps: number;
  readonly speed: string;
  readonly framesProcessed: number;
  readonly etaSeconds?: number;
}

export interface TranscodingOptions {
  readonly sourcePath: string;
  readonly outputDir: string;
  readonly requestedQualities: readonly VideoQuality[];
  readonly sourceDurationSeconds?: number;
  readonly crf?: number;
  readonly preset?: string;
  readonly hlsSegmentDuration?: number;
  readonly onProgress?: (progress: NormalizedProgress) => void;
}

export interface TranscodingResult {
  readonly success: boolean;
  readonly renditions: readonly VideoQuality[];
  readonly masterPlaylistPath: string;
  readonly outputDir: string;
  readonly durationMs: number;
  readonly error?: string;
}
