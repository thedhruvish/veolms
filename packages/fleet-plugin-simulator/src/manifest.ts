import type { FleetPluginManifest } from "@veolms/fleet-types";

export const simulatorPluginManifest: FleetPluginManifest = {
  name: "Simulator Plugin",
  packageName: "@veolms/fleet-plugin-simulator",
  provider: "simulator",
  description:
    "Mock in-memory virtual worker fleet for testing and CI without FFmpeg transcoding",
  defaultRunnerMode: "simulator",
  supportedRunnerModes: ["simulator"],
  envVars: [
    {
      key: "SIMULATOR_TICK_INTERVAL_MS",
      description: "Virtual timer tick frequency in milliseconds",
      defaultValue: "2000",
    },
    {
      key: "SIMULATOR_CHUNK_DURATION_SECONDS",
      description: "Simulated encoding time per chunk in seconds",
      defaultValue: "6",
    },
    {
      key: "SIMULATOR_SIMULATE_FAILURES",
      description: "Simulate transient worker crashes for testing resiliency",
      defaultValue: "false",
    },
  ],
  getEnvTemplate: () => ({
    SIMULATOR_TICK_INTERVAL_MS: "2000",
    SIMULATOR_CHUNK_DURATION_SECONDS: "6",
    SIMULATOR_SIMULATE_FAILURES: "false",
  }),
  provisionInfra: async (options) => {
    const action = options.action || "setup";
    return {
      provider: "simulator",
      action,
      success: true,
      message: `Virtual in-memory simulator infrastructure (${action}) completed.`,
    };
  },
};
