import {
  DEFAULT_FLEET_CONFIG,
  type FleetManagerConfig,
} from "@veolms/fleet-types";

export interface ServerfulDaemonConfig {
  readonly port: number;
  readonly host: string;
  readonly databaseUrl: string;
  readonly queueConnectionString: string;
  readonly driverType?:
    "simulator" | "local_process" | "local_podman" | "local_docker" | string;
  readonly coordinationIntervalMs: number;
  readonly managerApiUrl: string;
  readonly fleetConfig: FleetManagerConfig;
}

export function loadDaemonConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerfulDaemonConfig {
  const port = parseInt(env.PORT || env.FLEET_MANAGER_PORT || "4000", 10);
  const host = env.HOST || env.FLEET_MANAGER_HOST || "0.0.0.0";
  const databaseUrl =
    env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/veolms";
  const queueConnectionString =
    env.QUEUE_CONNECTION_STRING || env.DATABASE_URL || databaseUrl;
  const driverType = env.FLEET_DRIVER || "simulator";
  const coordinationIntervalMs = parseInt(
    env.COORDINATION_INTERVAL_MS || "5000",
    10,
  );
  const managerApiUrl =
    env.MANAGER_API_URL ||
    env.FLEET_MANAGER_API_URL ||
    `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`;

  const fleetConfig: FleetManagerConfig = {
    ...DEFAULT_FLEET_CONFIG,
    maxWorkersPerVideo: parseInt(
      env.MAX_WORKERS_PER_VIDEO ||
        String(DEFAULT_FLEET_CONFIG.maxWorkersPerVideo),
      10,
    ),
    maxTotalWorkers: parseInt(
      env.MAX_TOTAL_WORKERS || String(DEFAULT_FLEET_CONFIG.maxTotalWorkers),
      10,
    ),
    reuseProgressThreshold: parseInt(
      env.REUSE_PROGRESS_THRESHOLD ||
        String(DEFAULT_FLEET_CONFIG.reuseProgressThreshold),
      10,
    ),
    idleTimeoutSeconds: parseInt(
      env.IDLE_TIMEOUT_SECONDS ||
        String(DEFAULT_FLEET_CONFIG.idleTimeoutSeconds),
      10,
    ),
    heartbeatTimeoutSeconds: parseInt(
      env.HEARTBEAT_TIMEOUT_SECONDS ||
        String(DEFAULT_FLEET_CONFIG.heartbeatTimeoutSeconds),
      10,
    ),
  };

  return {
    port,
    host,
    databaseUrl,
    queueConnectionString,
    driverType,
    coordinationIntervalMs,
    managerApiUrl,
    fleetConfig,
  };
}
