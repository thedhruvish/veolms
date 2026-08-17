import { cpus, loadavg, totalmem, freemem } from "node:os";

export interface SystemMetricsSnapshot {
  readonly cpuPercent: number;
  readonly memoryRssMb: number;
  readonly memoryTotalMb: number;
  readonly uptimeSeconds: number;
}

let previousCpuTime = process.cpuUsage();
let previousHrTime = process.hrtime.bigint();

export function sampleSystemMetrics(): SystemMetricsSnapshot {
  const currentHrTime = process.hrtime.bigint();
  const currentCpuTime = process.cpuUsage(previousCpuTime);

  const elapsedMicroseconds = Number(currentHrTime - previousHrTime) / 1000;
  const numCpus = Math.max(1, cpus().length);

  let cpuPercent = 0;
  if (elapsedMicroseconds > 0) {
    const totalCpuMicroseconds =
      (currentCpuTime.user + currentCpuTime.system) / numCpus;
    cpuPercent = Math.min(
      100,
      Math.max(0, (totalCpuMicroseconds / elapsedMicroseconds) * 100),
    );
  }

  previousCpuTime = process.cpuUsage();
  previousHrTime = currentHrTime;

  const memUsage = process.memoryUsage();
  const memoryRssMb = Math.round(memUsage.rss / (1024 * 1024));
  const memoryTotalMb = Math.round(totalmem() / (1024 * 1024));
  const uptimeSeconds = Math.floor(process.uptime());

  return {
    cpuPercent: Number(cpuPercent.toFixed(1)),
    memoryRssMb,
    memoryTotalMb,
    uptimeSeconds,
  };
}
