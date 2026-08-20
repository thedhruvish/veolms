import { existsSync } from "node:fs";
import { join } from "node:path";
import { createDatabase } from "@veolms/database";
import type { FleetProvider } from "@veolms/fleet-types";
import {
  loadFleetManagerConfig,
  type FleetManagerConfig,
} from "../config/config.ts";
import {
  createFleetManager,
  type FleetManager,
} from "../core/fleet-manager.ts";
import { resolveFleetProvider } from "../core/provider-resolver.ts";

export interface StartServerfulOptions {
  configOverride?: Partial<FleetManagerConfig>;
  provider?: FleetProvider;
  signal?: AbortSignal;
}

export async function startServerfulFleetManager(
  options: StartServerfulOptions = {},
): Promise<{ fleet: FleetManager; startPromise: Promise<void> }> {
  const { configOverride, signal } = options;
  const config = {
    ...loadFleetManagerConfig(),
    ...configOverride,
  };

  const db = createDatabase(config.DATABASE_URL);

  const workerScript =
    config.MEDIA_WORKER_SCRIPT_PATH ??
    (existsSync(join(process.cwd(), "apps/media-worker/src/index.ts"))
      ? join(process.cwd(), "apps/media-worker/src/index.ts")
      : undefined);

  const provider: FleetProvider =
    options.provider ??
    (await resolveFleetProvider(config.PROVIDER, {
      workerScriptPath: workerScript,
    }));

  const fleet = createFleetManager({
    provider,
    db,
    config,
  });

  const startPromise = fleet.startServerfulLoop(signal);

  return { fleet, startPromise };
}
