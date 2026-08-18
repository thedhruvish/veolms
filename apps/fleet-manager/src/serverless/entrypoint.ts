import { createDatabase } from "@veolms/database";
import { DEFAULT_FLEET_CONFIG } from "@veolms/fleet-types";

import { FleetCoordinator } from "../core/coordinator/coordinator.ts";
import type { CoordinationContext } from "../core/coordinator/types.ts";
import { InMemoryQueueAdapter } from "../core/queues/in-memory-adapter.ts";
import { createConfiguredDriver } from "../serverful/driver-instance.ts";
import { createLambdaHandler } from "./handler.ts";

let cachedHandler: ReturnType<typeof createLambdaHandler> | null = null;

export function getOrCreateServerlessHandler() {
  if (cachedHandler) {
    return cachedHandler;
  }

  const dbUrl =
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/veolms";

  const database = createDatabase(dbUrl);
  const driver = createConfiguredDriver();
  const queueAdapter = new InMemoryQueueAdapter();

  const context: CoordinationContext = {
    database,
    driver,
    queueAdapter,
    config: {
      ...DEFAULT_FLEET_CONFIG,
    },
    managerApiUrl: process.env.MANAGER_API_URL || "https://api.veolms.local",
    queueConnectionString: dbUrl,
  };

  const coordinator = new FleetCoordinator(context);
  cachedHandler = createLambdaHandler(coordinator);
  return cachedHandler;
}

export async function handler(event: unknown, lambdaContext?: unknown) {
  const serverlessFn = getOrCreateServerlessHandler();
  return serverlessFn(event, lambdaContext as never);
}
