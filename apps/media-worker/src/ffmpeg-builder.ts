import {
  getQualityProfile,
  QUALITY_PROFILES,
  type VideoQualityLevel,
} from "@veolms/fleet-types";

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  fps?: number;
}

export interface GeneratedVariant {
  quality: VideoQualityLevel;
  relativePlaylistPath: string;
  bandwidth: number;
  width: number;
  height: number;
}

export interface FfmpegHlsBuildResult {
  args: readonly string[];
  applicableQualities: readonly VideoQualityLevel[];
  masterPlaylistContent: string;
  variants: readonly GeneratedVariant[];
}

export function filterApplicableQualities(
  requestedQualities: readonly VideoQualityLevel[],
  sourceWidth: number,
  sourceHeight: number,
): VideoQualityLevel[] {
  const sourceMinDim = Math.min(sourceWidth, sourceHeight);
  const sourceMaxDim = Math.max(sourceWidth, sourceHeight);

  const filtered = requestedQualities.filter((quality) => {
    const profile = getQualityProfile(quality);
    const profileMinDim = Math.min(profile.width, profile.height);
    const profileMaxDim = Math.max(profile.width, profile.height);
    // Allow if source dimensions are >= 90% of target resolution in both min and max orientations (supports horizontal and vertical)
    return (
      sourceMinDim >= profileMinDim * 0.9 && sourceMaxDim >= profileMaxDim * 0.9
    );
  });

  // If source is lower than all requested, fallback to the lowest requested quality
  if (filtered.length === 0 && requestedQualities.length > 0) {
    // Find the smallest requested quality
    const sorted = [...requestedQualities].sort(
      (a, b) => QUALITY_PROFILES[a].height - QUALITY_PROFILES[b].height,
    );
    const first = sorted[0];
    if (first) {
      return [first];
    }
  }

  return filtered;
}

export function generateMasterPlaylist(
  variants: readonly GeneratedVariant[],
): string {
  let content = "#EXTM3U\n#EXT-X-VERSION:3\n\n";

  for (const variant of variants) {
    content += `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${variant.width}x${variant.height}\n`;
    content += `${variant.relativePlaylistPath}\n\n`;
  }

  return content.trimEnd() + "\n";
}

export function buildFfmpegHlsArgs(options: {
  inputPath: string;
  outputDir: string;
  qualities: readonly VideoQualityLevel[];
  metadata: VideoMetadata;
  segmentDurationSeconds?: number;
}): FfmpegHlsBuildResult {
  const { inputPath, outputDir, qualities, metadata } = options;
  const segmentDuration = options.segmentDurationSeconds ?? 6;

  const applicableQualities = filterApplicableQualities(
    qualities,
    metadata.width,
    metadata.height,
  );

  const args: string[] = [
    "-y",
    "-hide_banner",
    "-i",
    inputPath,
    "-progress",
    "pipe:1",
    "-nostats",
  ];

  const variants: GeneratedVariant[] = [];

  // Build FFmpeg multi-output HLS transcode command
  for (const quality of applicableQualities) {
    const profile = getQualityProfile(quality);
    const gopSize = Math.round(profile.fps * segmentDuration);

    const qualityOutputDir = `${outputDir}/${quality}`;
    const playlistPath = `${qualityOutputDir}/${quality}.m3u8`;
    const segmentPattern = `${qualityOutputDir}/segment_%03d.ts`;

    // Video options with strict GOP alignment and even dimension scaling for ABR compatibility
    args.push(
      "-map",
      "0:v:0",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-b:v",
      `${profile.videoBitrateKbps}k`,
      "-maxrate",
      `${profile.maxBitrateKbps}k`,
      "-bufsize",
      `${profile.bufferSizeKbps}k`,
      "-g",
      String(gopSize),
      "-keyint_min",
      String(gopSize),
      "-sc_threshold",
      "0",
      "-vf",
      `scale=w=${profile.width}:h=${profile.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2:black`,
    );

    // Audio options
    args.push(
      "-map",
      "0:a:0?",
      "-c:a",
      "aac",
      "-b:a",
      `${profile.audioBitrateKbps}k`,
      "-ar",
      "48000",
    );

    // HLS packaging options
    args.push(
      "-f",
      "hls",
      "-hls_time",
      String(segmentDuration),
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "independent_segments",
      "-hls_segment_filename",
      segmentPattern,
      playlistPath,
    );

    const totalBandwidthBps =
      (profile.videoBitrateKbps + profile.audioBitrateKbps) * 1000;

    variants.push({
      quality,
      relativePlaylistPath: `${quality}/${quality}.m3u8`,
      bandwidth: totalBandwidthBps,
      width: profile.width,
      height: profile.height,
    });
  }

  const masterPlaylistContent = generateMasterPlaylist(variants);

  return {
    args,
    applicableQualities,
    masterPlaylistContent,
    variants,
  };
}
