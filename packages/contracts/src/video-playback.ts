import { z } from "zod";

export const videoPlaybackTrackSchema = z.strictObject({
  src: z.string().min(1),
  language: z.string().min(1),
  label: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
});

export const videoPlaybackDrmSchema = z.strictObject({
  scheme: z.literal("cenc-aes-ctr"),
  keySystem: z.literal("org.w3.clearkey"),
  licenseUrl: z.string().min(1),
});

export const videoPlaybackClearKeyLicenseRequestSchema = z.strictObject({
  kids: z.array(z.string().min(1).max(64)).min(1).max(32),
  type: z.literal("temporary").optional(),
});

export const videoPlaybackClearKeyLicenseResponseSchema = z.strictObject({
  keys: z.array(
    z.strictObject({
      kty: z.literal("oct"),
      kid: z.string().min(1),
      k: z.string().min(1),
    }),
  ),
  type: z.literal("temporary"),
});

/**
 * Minimal runtime data needed to start a lesson video. Keep this separate
 * from course and lesson responses so it can be embedded or fetched without
 * pulling unrelated application state into the startup path.
 */
export const videoPlaybackBootstrapSchema = z.strictObject({
  version: z.literal(1),
  courseSlug: z.string().min(1),
  lessonId: z.union([z.string().min(1), z.number().int().positive()]),
  mediaKey: z.string().min(1),
  manifestUrl: z.string().min(1),
  manifestType: z.enum(["hls", "dash"]).optional(),
  drm: videoPlaybackDrmSchema.optional(),
  segmentToken: z.string().min(1).optional(),
  segmentTokenExpiresAt: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
  title: z.string().min(1).optional(),
  posterUrl: z.string().min(1).optional(),
  resumeAt: z.number().nonnegative().optional(),
  tracks: z.array(videoPlaybackTrackSchema).optional(),
  source: z.enum(["ssg", "public-cdn", "paid-bootstrap-api"]),
});

/** The minimal response used to renew a protected HLS segment token. */
export const videoPlaybackTokenSchema = z.strictObject({
  token: z.string().min(1),
  expiresAt: z.number().int().positive(),
});

export type VideoPlaybackBootstrap = z.infer<
  typeof videoPlaybackBootstrapSchema
>;

export type VideoPlaybackToken = z.infer<typeof videoPlaybackTokenSchema>;

export type VideoPlaybackTrack = z.infer<typeof videoPlaybackTrackSchema>;

export type VideoPlaybackDrm = z.infer<typeof videoPlaybackDrmSchema>;

export type VideoPlaybackClearKeyLicenseRequest = z.infer<
  typeof videoPlaybackClearKeyLicenseRequestSchema
>;

export type VideoPlaybackClearKeyLicenseResponse = z.infer<
  typeof videoPlaybackClearKeyLicenseResponseSchema
>;
