import type { Server } from "node:http";
import { createDatabase } from "@veolms/database";

import { FleetCoordinator } from "../core/coordinator/coordinator.ts";
import type { CoordinationContext } from "../core/coordinator/types.ts";
import { InMemoryQueueAdapter } from "../core/queues/in-memory-adapter.ts";
import type { QueueAdapter } from "../core/queues/types.ts";
import type { ServerfulDaemonConfig } from "./config.ts";
import { createCloudDriver } from "./factory.ts";
import { createWorkerApiServer } from "./server.ts";
import type { CloudDriver } from "@veolms/fleet-types";

/**
 * FleetDaemon: Main long-running service host managing the HTTP API server,
 * database connections, queue lifecycle, and autonomous fleet coordination loop.
 */
export class FleetDaemon {
  readonly config: ServerfulDaemonConfig;
  readonly context: CoordinationContext;
  readonly coordinator: FleetCoordinator;

  private server: Server | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(
    config: ServerfulDaemonConfig,
    customQueueAdapter?: QueueAdapter,
    customDriver?: CloudDriver,
  ) {
    this.config = config;

    const database = createDatabase(config.databaseUrl);
    const driver = customDriver ?? createCloudDriver(config.driverType);
    const queueAdapter = customQueueAdapter ?? new InMemoryQueueAdapter();

    this.context = {
      database,
      driver,
      queueAdapter,
      config: config.fleetConfig,
      managerApiUrl: config.managerApiUrl,
      queueConnectionString: config.queueConnectionString,
    };

    this.coordinator = new FleetCoordinator(this.context);
  }

  /**
   * Boots queue adapters, starts the HTTP worker API server, and launches the
   * autonomous coordination scheduler.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    // 1. Start queue adapter
    await this.context.queueAdapter.start();

    // 2. Start HTTP server
    this.server = createWorkerApiServer(this.coordinator);
    await new Promise<void>((resolve) => {
      this.server?.listen(this.config.port, this.config.host, () => {
        resolve();
      });
    });

    // 3. Start background coordination loop
    this.isRunning = true;
    this.intervalTimer = setInterval(async () => {
      if (!this.isRunning) return;
      try {
        await this.coordinator.runCoordinationCycle();
      } catch (err) {
        if (this.isRunning) {
          console.error("Error in fleet coordination cycle:", err);
        }
      }
    }, this.config.coordinationIntervalMs);
  }

  /**
   * Gracefully shuts down server, coordination timer, and database pool.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    this.isRunning = false;

    // 1. Clear background loop
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }

    // 2. Close HTTP server
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close(() => resolve());
      });
      this.server = null;
    }

    // 3. Stop queue adapter
    await this.context.queueAdapter.stop();

    // 4. Close database pool
    await this.context.database.destroy();

    this.isRunning = false;
  }

  getPort(): number {
    const address = this.server?.address();
    if (address && typeof address === "object") {
      return address.port;
    }
    return this.config.port;
  }
}
