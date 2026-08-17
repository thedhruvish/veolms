// Default Driver Instance. Generated/re-configured by `pnpm run pre:setup`.
import { LocalCloudDriver } from "@veolms/fleet-plugin-local";
import type { CloudDriver } from "@veolms/fleet-types";
import { resolve } from "node:path";

export function createConfiguredDriver(): CloudDriver {
  return new LocalCloudDriver({
    runnerMode: "process",
    cwd: process.cwd(),
    workerScriptPath: resolve(process.cwd(), "apps/media-worker/src/index.ts"),
    storageBasePath:
      process.env.STORAGE_BASE_PATH || resolve(process.cwd(), "s3-bucket"),
  });
}
