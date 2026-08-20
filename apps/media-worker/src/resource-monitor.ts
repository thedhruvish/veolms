import * as os from "node:os";

export interface ResourceUsage {
  cpuPercent: number;
  memoryPercent: number;
}

/**
 * Whole-machine CPU + memory utilization — not this Node process's own
 * usage. FFmpeg (the actual CPU-heavy work) runs as a separate child
 * process, so process.cpuUsage() would just show Node's near-idle
 * orchestration overhead and completely miss the load that matters here.
 * os.cpus() gives cumulative per-core tick counts since boot; sampling it
 * twice a short window apart and diffing yields a real utilization %.
 */
export async function sampleResourceUsage(
  sampleWindowMs = 200,
): Promise<ResourceUsage> {
  const start = os.cpus();
  await new Promise((resolve) => setTimeout(resolve, sampleWindowMs));
  const end = os.cpus();

  let idleDelta = 0;
  let totalDelta = 0;
  for (let i = 0; i < start.length; i++) {
    const s = start[i]?.times;
    const e = end[i]?.times;
    if (!s || !e) continue;
    const sTotal = s.user + s.nice + s.sys + s.idle + s.irq;
    const eTotal = e.user + e.nice + e.sys + e.idle + e.irq;
    idleDelta += e.idle - s.idle;
    totalDelta += eTotal - sTotal;
  }

  const cpuPercent = Math.min(
    100,
    Math.max(0, totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0),
  );
  const memoryPercent = Math.min(
    100,
    Math.max(0, (1 - os.freemem() / os.totalmem()) * 100),
  );

  return { cpuPercent, memoryPercent };
}

export interface DefaultUploadConcurrency {
  maxConcurrency: number;
  minConcurrency: number;
}

/**
 * Sizes upload concurrency to the actual worker instance instead of one
 * fixed number that's oversized for a t4g.small and undersized for a
 * c7g.4xlarge. Each in-flight upload buffers its whole file into memory
 * before sending (see uploadFiles in s3.ts), so both CPU count and total
 * memory bound how many can safely run at once — whichever resource is
 * more constrained wins, then clamped to a sane floor/ceiling so neither
 * a single-core nor a huge box produces a degenerate value.
 */
export function resolveDefaultUploadConcurrency(): DefaultUploadConcurrency {
  const cpuCount = os.cpus().length || 1;
  const totalMemGb = os.totalmem() / 1024 ** 3;

  const cpuBasedMax = cpuCount * 4;
  const memoryBasedMax = Math.floor(totalMemGb * 4);

  const maxConcurrency = Math.max(4, Math.min(cpuBasedMax, memoryBasedMax, 32));
  const minConcurrency = Math.max(2, Math.floor(maxConcurrency / 4));

  return { maxConcurrency, minConcurrency };
}
