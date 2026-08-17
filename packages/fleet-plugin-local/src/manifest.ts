import type { FleetPluginManifest } from "@veolms/fleet-types";

export const localPluginManifest: FleetPluginManifest = {
  name: "Local Infrastructure Plugin",
  packageName: "@veolms/fleet-plugin-local",
  provider: "local",
  description: "Runs media workers locally using Bare-Metal Node.js processes or Podman/Docker containers",
  defaultRunnerMode: "process",
  supportedRunnerModes: ["process", "podman", "docker"],
  envVars: [
    { key: "RUNNER_MODE", description: "Worker runner engine ('process', 'podman', or 'docker')", defaultValue: "process", required: true },
    { key: "STORAGE_BASE_PATH", description: "Local root directory for storing HLS playlists and media segments", defaultValue: "./s3-bucket", required: true },
    { key: "TEMP_STORAGE_PATH", description: "Local scratch directory for temporary intermediate chunk files", defaultValue: "./s3-bucket/temp", required: true },
    { key: "FORCE_SOFTWARE_ENCODER", description: "Set true to disable GPU hardware acceleration and force libx264 software encoding", defaultValue: "false" },
    { key: "CONTAINER_ENGINE", description: "Container CLI binary to use ('podman' or 'docker') when running in container mode", defaultValue: "podman" },
    { key: "CONTAINER_IMAGE", description: "Container image tag for media worker execution", defaultValue: "localhost/veolms-media-worker:latest" },
  ],
  getEnvTemplate: (options) => {
    const runner = options.runnerMode || "process";
    const storagePath = options.storagePath || "./s3-bucket";
    const tempStorage = `${storagePath}/temp`;
    const env: Record<string, string> = {
      RUNNER_MODE: runner,
      STORAGE_BASE_PATH: storagePath,
      TEMP_STORAGE_PATH: tempStorage,
      FORCE_SOFTWARE_ENCODER: options.isHardwareAccelerated === false ? "true" : "false",
    };
    if (runner === "podman" || runner === "docker") {
      env.CONTAINER_ENGINE = runner;
      env.CONTAINER_IMAGE = "localhost/veolms-media-worker:latest";
    }
    return env;
  },
};
