import { createDatabase } from "@veolms/database";

import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { logger } from "./lib/logger.ts";

const database = createDatabase(config.DATABASE_URL);
const app = await createApp({ database, logger });
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  app.log.info({ signal }, "Initiating graceful shutdown...");

  const timeoutId = setTimeout(() => {
    app.log.error("Shutdown timeout exceeded. Forcefully terminating process.");
    process.exit(1);
  }, 10000);

  try {
    const results = await Promise.allSettled([
      app.close(),
      database.destroy()
    ]);

    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => r.reason);

    if (errors.length > 0) {
      app.log.error({ err: errors }, "Error(s) occurred during graceful shutdown.");
      process.exit(1);
    }

    app.log.info("Graceful shutdown completed successfully.");
    clearTimeout(timeoutId);
  } catch (error) {
    app.log.error({ err: error }, "Unexpected error occurred during graceful shutdown.");
    process.exit(1);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch (error) {
  app.log.error(error);
  await database.destroy();
  process.exitCode = 1;
}
