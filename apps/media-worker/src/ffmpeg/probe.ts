import ffmpeg from "fluent-ffmpeg";

import type { ProbeResult } from "./types.ts";

function parseFps(fpsString?: string): number {
  if (!fpsString) return 30;
  if (fpsString.includes("/")) {
    const parts = fpsString.split("/");
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (!Number.isNaN(num) && !Number.isNaN(den) && den > 0) {
      return Number((num / den).toFixed(2));
    }
  }
  const parsed = parseFloat(fpsString);
  return Number.isNaN(parsed) || parsed <= 0 ? 30 : parsed;
}

/**
 * Probes media stream metadata using ffprobe via fluent-ffmpeg.
 */
export async function probeMedia(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        return reject(
          new Error(`FFprobe failed to inspect "${filePath}": ${err.message}`),
        );
      }

      const videoStream = data.streams.find((s) => s.codec_type === "video");
      const audioStream = data.streams.find((s) => s.codec_type === "audio");

      const width = videoStream?.width ?? 1920;
      const height = videoStream?.height ?? 1080;
      const fps = parseFps(
        videoStream?.r_frame_rate || videoStream?.avg_frame_rate,
      );
      const codec = videoStream?.codec_name ?? "h264";

      const durationSeconds =
        data.format.duration !== undefined
          ? Number(data.format.duration)
          : videoStream?.duration !== undefined
            ? Number(videoStream.duration)
            : 0;

      const audioChannels = audioStream?.channels ?? 2;
      const audioBitrateKbps = audioStream?.bit_rate
        ? Math.round(Number(audioStream.bit_rate) / 1000)
        : 128;

      resolve({
        width,
        height,
        fps,
        codec,
        durationSeconds: Math.max(0, durationSeconds),
        audioChannels,
        audioBitrateKbps,
      });
    });
  });
}
