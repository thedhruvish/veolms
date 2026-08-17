import type { FleetPluginManifest } from "@veolms/fleet-types";

export const localPluginManifest: FleetPluginManifest = {
  name: "Local Infrastructure Plugin",
  packageName: "@veolms/fleet-plugin-local",
  provider: "local",
  description:
    "Runs media workers locally using Bare-Metal Node.js processes or Podman/Docker containers",
  defaultRunnerMode: "process",
  supportedRunnerModes: ["process", "podman", "docker"],
  envVars: [
    {
      key: "RUNNER_MODE",
      description: "Worker runner engine ('process', 'podman', or 'docker')",
      defaultValue: "process",
      required: true,
    },
    {
      key: "STORAGE_BASE_PATH",
      description:
        "Local root directory for storing HLS playlists and media segments",
      defaultValue: "./s3-bucket",
      required: true,
    },
    {
      key: "TEMP_STORAGE_PATH",
      description:
        "Local scratch directory for temporary intermediate chunk files",
      defaultValue: "./s3-bucket/temp",
      required: true,
    },
    {
      key: "FORCE_SOFTWARE_ENCODER",
      description:
        "Set true to disable GPU hardware acceleration and force libx264 software encoding",
      defaultValue: "false",
    },
    {
      key: "CONTAINER_ENGINE",
      description:
        "Container CLI binary to use ('podman' or 'docker') when running in container mode",
      defaultValue: "podman",
    },
    {
      key: "CONTAINER_IMAGE",
      description: "Container image tag for media worker execution",
      defaultValue: "localhost/veolms-media-worker:latest",
    },
  ],
  getEnvTemplate: (options) => {
    const runner = options.runnerMode || "process";
    const storagePath = options.storagePath || "./s3-bucket";
    const tempStorage = `${storagePath}/temp`;
    const env: Record<string, string> = {
      RUNNER_MODE: runner,
      STORAGE_BASE_PATH: storagePath,
      TEMP_STORAGE_PATH: tempStorage,
      FORCE_SOFTWARE_ENCODER:
        options.isHardwareAccelerated === false ? "true" : "false",
    };
    if (runner === "podman" || runner === "docker") {
      env.CONTAINER_ENGINE = runner;
      env.CONTAINER_IMAGE = "localhost/veolms-media-worker:latest";
    }
    return env;
  },
  provisionInfra: async (options) => {
    const action = options.action || "setup";
    const { mkdir, rm, access } = await import("node:fs/promises");
    const { resolve } = await import("node:path");

    const storagePath = resolve(
      process.cwd(),
      options.prodStoragePath || options.tempStoragePath || "./s3-bucket",
    );
    const tempStoragePath = resolve(
      process.cwd(),
      options.tempStoragePath || "./s3-bucket/temp",
    );

    // 1. DESTROY
    if (action === "destroy") {
      await rm(tempStoragePath, { recursive: true, force: true });
      await rm(storagePath, { recursive: true, force: true });
      return {
        provider: "local",
        action: "destroy",
        success: true,
        message: `Local directories removed: ${storagePath} and ${tempStoragePath}`,
      };
    }

    // 2. STATUS
    if (action === "status") {
      let prodOk = false;
      let tempOk = false;
      try {
        await access(storagePath);
        prodOk = true;
      } catch {
        prodOk = false;
      }
      try {
        await access(tempStoragePath);
        tempOk = true;
      } catch {
        tempOk = false;
      }

      return {
        provider: "local",
        action: "status",
        success: prodOk && tempOk,
        message:
          prodOk && tempOk
            ? "Local storage infrastructure is ready."
            : "Local storage folders are missing.",
        details: {
          storagePath: prodOk ? "Exists ✅" : "Missing ❌",
          tempStoragePath: tempOk ? "Exists ✅" : "Missing ❌",
        },
      };
    }

    // 3. REINSTALL
    if (action === "reinstall") {
      await rm(tempStoragePath, { recursive: true, force: true });
      await rm(storagePath, { recursive: true, force: true });
    }

    // 4. SETUP
    await mkdir(storagePath, { recursive: true });
    await mkdir(tempStoragePath, { recursive: true });

    return {
      provider: "local",
      action,
      success: true,
      message: `Local directories created: ${storagePath} and ${tempStoragePath}`,
      details: {
        storagePath,
        tempStoragePath,
      },
    };
  },
};
