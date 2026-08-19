import { z } from "zod";
import {
  audioCodecSchema,
  DEFAULT_QUALITIES,
  videoCodecSchema,
  videoQualityLevelSchema,
  type AudioCodec,
  type VideoCodec,
  type VideoQualityLevel,
} from "./quality.ts";

export const JOB_STATUSES = [
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
export const jobStatusSchema = z.enum(JOB_STATUSES);

export interface JobHardwareRequirements {
  minCpu: number;
  minMemoryMb: number;
  architecture: "arm64" | "x86_64";
  storageGb: number;
  estimatedDurationSeconds: number;
}

export const jobHardwareRequirementsSchema = z.object({
  minCpu: z.number().int().min(1).default(2),
  minMemoryMb: z.number().int().min(512).default(4096),
  architecture: z.enum(["arm64", "x86_64"]).default("arm64"),
  storageGb: z.number().int().min(5).default(30),
  estimatedDurationSeconds: z.number().int().min(10).default(600),
});

export interface JobHlsOptions {
  masterPlaylistName?: string;
  segmentPrefix?: string;
}

export const jobHlsOptionsSchema = z.object({
  masterPlaylistName: z.string().default("master.m3u8"),
  segmentPrefix: z.string().default("segment_"),
});

export interface JobRequirements {
  /** The explicit array of target qualities to generate */
  qualities: readonly VideoQualityLevel[];
  videoCodec?: VideoCodec;
  audioCodec?: AudioCodec;
  segmentDurationSeconds?: number;
  hardware: JobHardwareRequirements;
  hlsOptions?: JobHlsOptions;
}

export const jobRequirementsSchema = z.object({
  qualities: z
    .array(videoQualityLevelSchema)
    .min(1)
    .default([...DEFAULT_QUALITIES]),
  videoCodec: videoCodecSchema.default("h264"),
  audioCodec: audioCodecSchema.default("aac"),
  segmentDurationSeconds: z.number().int().min(1).max(30).default(6),
  hardware: jobHardwareRequirementsSchema.default({
    minCpu: 2,
    minMemoryMb: 4096,
    architecture: "arm64",
    storageGb: 30,
    estimatedDurationSeconds: 600,
  }),
  hlsOptions: jobHlsOptionsSchema.optional(),
});

export interface Job {
  id: string;
  status: JobStatus;
  videoKey: string;
  outputPrefix: string;
  requirements: JobRequirements;
  workerId: string | null;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  updatedAt: Date;
}
