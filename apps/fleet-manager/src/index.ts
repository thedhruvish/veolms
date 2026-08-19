import { startServerfulFleetManager } from "./entrypoints/serverful.ts";

export * from "./config/config.ts";
export * from "./core/fleet-manager.ts";
export * from "./core/job-manager.ts";
export * from "./core/worker-manager.ts";
export * from "./core/scheduler.ts";
export * from "./core/monitor.ts";

export function main(): void {
  const controller = new AbortController();

  const shutdown = () => {
    console.info("[fleet-manager] Received shutdown signal, stopping...");
    controller.abort();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const { startPromise } = startServerfulFleetManager(
    undefined,
    controller.signal,
  );

  startPromise.catch((err) => {
    console.error("[fleet-manager] Fatal error:", err);
    process.exit(1);
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  main();
}
