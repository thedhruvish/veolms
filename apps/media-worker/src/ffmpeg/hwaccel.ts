import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type HardwareAccelerationType = "nvenc" | "qsv" | "vaapi" | "software";

export interface HardwareEncoderInfo {
  readonly encoder: string;
  readonly type: HardwareAccelerationType;
  readonly isHardwareAccelerated: boolean;
}

let cachedEncoderInfo: HardwareEncoderInfo | null = null;

async function testEncoder(encoderName: string): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", [
      "-f",
      "lavfi",
      "-i",
      "nullsrc=s=64x64:d=0.1",
      "-frames:v",
      "1",
      "-c:v",
      encoderName,
      "-f",
      "null",
      "-",
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Probes the local FFmpeg installation and tests actual 1-frame encoding capability
 * to detect available GPU hardware encoders.
 */
export async function detectHardwareEncoder(
  forceSoftware = false,
): Promise<HardwareEncoderInfo> {
  if (forceSoftware) {
    return {
      encoder: "libx264",
      type: "software",
      isHardwareAccelerated: false,
    };
  }

  if (cachedEncoderInfo) {
    return cachedEncoderInfo;
  }

  // 1. Test NVIDIA NVENC
  if (await testEncoder("h264_nvenc")) {
    cachedEncoderInfo = {
      encoder: "h264_nvenc",
      type: "nvenc",
      isHardwareAccelerated: true,
    };
    return cachedEncoderInfo;
  }

  // 2. Test Intel QuickSync (QSV)
  if (await testEncoder("h264_qsv")) {
    cachedEncoderInfo = {
      encoder: "h264_qsv",
      type: "qsv",
      isHardwareAccelerated: true,
    };
    return cachedEncoderInfo;
  }

  // 3. Test Linux VAAPI
  if (await testEncoder("h264_vaapi")) {
    cachedEncoderInfo = {
      encoder: "h264_vaapi",
      type: "vaapi",
      isHardwareAccelerated: true,
    };
    return cachedEncoderInfo;
  }

  // Default: Highly optimized software libx264
  cachedEncoderInfo = {
    encoder: "libx264",
    type: "software",
    isHardwareAccelerated: false,
  };
  return cachedEncoderInfo;
}
