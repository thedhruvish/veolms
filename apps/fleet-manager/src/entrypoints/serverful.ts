import { createDatabase } from "@veolms/database";
import { createAwsProvider } from "@veolms/fleet-provider-aws";
import { createLocalProvider } from "@veolms/fleet-provider-local";
import type { FleetProvider } from "@veolms/fleet-types";
import {
  loadFleetManagerConfig,
  type FleetManagerConfig,
} from "../config/config.ts";
import {
  createFleetManager,
  type FleetManager,
} from "../core/fleet-manager.ts";

export function startServerfulFleetManager(
  configOverride?: Partial<FleetManagerConfig>,
  signal?: AbortSignal,
): { fleet: FleetManager; startPromise: Promise<void> } {
  const config = {
    ...loadFleetManagerConfig(),
    ...configOverride,
  };

  const db = createDatabase(config.DATABASE_URL);

  const provider: FleetProvider =
    config.PROVIDER === "aws"
      ? createAwsProvider()
      : createLocalProvider({
          workerScriptPath: config.MEDIA_WORKER_SCRIPT_PATH,
        });

  const fleet = createFleetManager({
    provider,
    db,
    config,
  });

  const startPromise = fleet.startServerfulLoop(signal);

  return { fleet, startPromise };
}
