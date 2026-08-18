import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";

import { createDatabase } from "../packages/database/src/index.ts";
import { detectHardwareEncoder } from "../apps/media-worker/src/ffmpeg/hwaccel.ts";
import type { FleetPluginManifest } from "../packages/fleet-types/src/index.ts";
import { localPluginManifest } from "../packages/fleet-plugin-local/src/index.ts";
import { simulatorPluginManifest } from "../packages/fleet-plugin-simulator/src/index.ts";
import {
  awsPluginManifest,
  EC2_VIDEO_INSTANCES,
} from "../packages/fleet-plugin-aws/src/index.ts";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    try {
      process.loadEnvFile(".env");
    } catch {
      // Ignore if env files not present
    }
  }
}

const execFileAsync = promisify(execFile);

const PLUGIN_REGISTRY: Record<string, FleetPluginManifest> = {
  local: localPluginManifest,
  simulator: simulatorPluginManifest,
  aws: awsPluginManifest,
};

interface FleetConfig {
  provider: string;
  executionMode: "serverful" | "serverless";
  runner: {
    type: string;
    containerEngine?: string;
    containerImage?: string;
    allowedInstanceTypes?: string[];
    maxWorkersPerVideo?: number;
    maxTotalWorkers?: number;
    idleTimeoutSeconds?: number;
    reuseProgressThreshold?: number;
  };
  storage: {
    type: "local" | "s3";
    tempBucket?: string;
    productionBucket?: string;
    tempStoragePath?: string;
    productionStoragePath?: string;
    autoPruneIntermediateChunks?: boolean;
  };
  server?: {
    host: string;
    port: number;
  };
}

interface WorkerConfig {
  controlPlane: {
    mode: "serverful" | "serverless";
    fleetManagerUrl?: string;
  };
  storage: {
    type: "local" | "s3";
    tempBucket: string;
    productionBucket: string;
  };
  transcoding: {
    engine: "fluent-ffmpeg";
    preset: string;
    crf: number;
    hlsSegmentDuration: number;
    hardwareAcceleration: string;
  };
}

async function checkSystemBinary(
  cmd: string,
  args: string[],
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cmd, args);
    return stdout.trim().split("\n")[0] ?? "Installed";
  } catch {
    return null;
  }
}

async function promptMenu(
  rl: ReturnType<typeof createInterface>,
  question: string,
  options: readonly { label: string; value: string }[],
  defaultValue = "1",
): Promise<string> {
  console.log(`\n❓ ${question}`);
  options.forEach((opt, idx) => {
    const num = idx + 1;
    const isDefault = String(num) === defaultValue;
    console.log(
      `   ${num}) ${opt.label} ${isDefault ? "\x1b[36m(Default)\x1b[0m" : ""}`,
    );
  });

  const answer = await rl.question(
    `👉 Select an option [1-${options.length}] (Enter for ${defaultValue}): `,
  );
  const choice = answer.trim() || defaultValue;
  const index = parseInt(choice, 10) - 1;

  if (index >= 0 && index < options.length) {
    return options[index]!.value;
  }
  const defaultIdx = parseInt(defaultValue, 10) - 1;
  return options[defaultIdx]?.value ?? options[0]!.value;
}

function parseExistingEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match && match[1]) {
      env[match[1].trim()] = (match[2] ?? "").trim();
    }
  }
  return env;
}

async function syncPluginDependencies(
  cwd: string,
  selectedPackageName: string,
  allProviderPackages: string[],
): Promise<void> {
  const fleetPkgPath = resolve(cwd, "apps/fleet-manager/package.json");
  try {
    const raw = await readFile(fleetPkgPath, "utf-8");
    const pkg = JSON.parse(raw) as { dependencies?: Record<string, string> };
    const deps = pkg.dependencies ?? {};

    const packagesToAdd: string[] = [];
    const packagesToRemove: string[] = [];

    if (!deps[selectedPackageName]) {
      packagesToAdd.push(`${selectedPackageName}@workspace:*`);
    }

    for (const otherPkg of allProviderPackages) {
      if (otherPkg !== selectedPackageName && deps[otherPkg]) {
        packagesToRemove.push(otherPkg);
      }
    }

    if (packagesToRemove.length > 0) {
      console.log(
        `   🧹 Pruning unused plugin dependencies: ${packagesToRemove.join(", ")}...`,
      );
      try {
        await execFileAsync("pnpm", [
          "--filter",
          "@veolms/fleet-manager",
          "remove",
          ...packagesToRemove,
        ]);
      } catch {
        // Ignore if error during remove
      }
    }

    if (packagesToAdd.length > 0) {
      console.log(
        `   📦 Installing selected plugin [${selectedPackageName}] into apps/fleet-manager...`,
      );
      await execFileAsync("pnpm", [
        "--filter",
        "@veolms/fleet-manager",
        "add",
        ...packagesToAdd,
      ]);
      console.log(`   └─ Dependency Installed: ${selectedPackageName} ✅`);
    } else {
      console.log(
        `   ├─ Plugin Dependency [${selectedPackageName}]: Verified in apps/fleet-manager ✅`,
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`   └─ Dependency Sync Notice: ${msg}`);
  }
}

async function runInteractivePreSetup(): Promise<void> {
  console.log("\n" + "=".repeat(78));
  console.log(
    "  🚀 VeoLMS Plugin-Driven Provider & Environment Configuration Wizard",
  );
  console.log("=".repeat(78));

  const cwd = process.cwd();
  const fleetConfigPath = resolve(cwd, "apps/fleet-manager/fleet.config.json");
  const workerConfigPath = resolve(cwd, "apps/media-worker/worker.config.json");
  const fleetEnvPath = resolve(cwd, "apps/fleet-manager/.env.local");
  const workerEnvPath = resolve(cwd, "apps/media-worker/.env.local");

  // Read existing app-scoped .env.local if present to preserve custom user credentials
  let existingEnv: Record<string, string> = {};
  try {
    const rawEnv = await readFile(fleetEnvPath, "utf-8");
    existingEnv = parseExistingEnv(rawEnv);
  } catch {
    try {
      const rawEnv = await readFile(workerEnvPath, "utf-8");
      existingEnv = parseExistingEnv(rawEnv);
    } catch {
      // No prior .env.local
    }
  }

  // Load existing fleet.config.json if available
  let existingConfig: Partial<FleetConfig> = {};
  try {
    const raw = await readFile(fleetConfigPath, "utf-8");
    existingConfig = JSON.parse(raw) as Partial<FleetConfig>;
  } catch {
    // No prior config
  }

  const isInteractive =
    process.stdin.isTTY && !process.argv.includes("--non-interactive");

  let selectedProvider = existingConfig.provider ?? "local";
  let selectedRunner = existingConfig.runner?.type ?? "process";
  let selectedControlPlane: "serverful" | "serverless" =
    existingConfig.executionMode ?? "serverful";
  let selectedEc2Instances = [
    "c6i.large",
    "c6i.xlarge",
    "c6i.2xlarge",
    "g4dn.xlarge",
  ];
  let baselineEc2Instance = "c6i.xlarge";

  // Build provider choices dynamically from available plugin registry
  const providerChoices = Object.values(PLUGIN_REGISTRY).map((manifest) => ({
    label: `${manifest.provider.padEnd(12)} - ${manifest.description}`,
    value: manifest.provider,
  }));

  // =========================================================================
  // STEP 1: Interactive Question Wizard
  // =========================================================================
  if (isInteractive) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      // 1. Choose Provider from registered plugins
      const defaultProviderIdx = providerChoices.findIndex(
        (p) => p.value === selectedProvider,
      );
      selectedProvider = await promptMenu(
        rl,
        "Which Infrastructure Provider Plugin do you want to use for VeoLMS?",
        providerChoices,
        defaultProviderIdx >= 0 ? String(defaultProviderIdx + 1) : "1",
      );

      const activeManifest =
        PLUGIN_REGISTRY[selectedProvider] ?? localPluginManifest;

      // 2. Choose Runner Type (from the plugin's supported modes)
      if (selectedProvider === "aws") {
        const runnerOptions = [
          {
            label:
              "EC2 Spot Instances   (Cost-Optimized, ~70-90% discount, auto-scaled) [Recommended]",
            value: "spot",
          },
          {
            label:
              "EC2 On-Demand In-line (Guaranteed capacity, no spot interruptions)",
            value: "on_demand",
          },
          {
            label: "AWS ECS Fargate      (Serverless container tasks)",
            value: "ecs_fargate",
          },
        ];

        const defaultRunnerIdx = runnerOptions.findIndex(
          (r) => r.value === selectedRunner,
        );
        selectedRunner = await promptMenu(
          rl,
          "Select Worker Execution Runner for AWS Cloud:",
          runnerOptions,
          defaultRunnerIdx >= 0 ? String(defaultRunnerIdx + 1) : "1",
        );
      } else if (activeManifest.supportedRunnerModes.length > 1) {
        const runnerOptions = activeManifest.supportedRunnerModes.map(
          (mode) => {
            if (mode === "process") {
              return {
                label:
                  "Bare-Metal Host Process (Fastest, zero-container overhead, native Node.js)",
                value: "process",
              };
            }
            if (mode === "podman") {
              return {
                label:
                  "Podman Container        (Rootless, isolated container execution)",
                value: "podman",
              };
            }
            if (mode === "docker") {
              return {
                label:
                  "Docker Container        (Standard Docker daemon container execution)",
                value: "docker",
              };
            }
            return { label: mode, value: mode };
          },
        );

        const defaultRunnerIdx = runnerOptions.findIndex(
          (r) => r.value === selectedRunner,
        );
        selectedRunner = await promptMenu(
          rl,
          `Select Worker Execution Runner for [${activeManifest.name}]:`,
          runnerOptions,
          defaultRunnerIdx >= 0 ? String(defaultRunnerIdx + 1) : "1",
        );
      } else {
        selectedRunner = activeManifest.defaultRunnerMode;
      }

      // If AWS provider selected, choose EC2 multi-instance sizing strategy
      selectedEc2Instances = [
        "c6i.large",
        "c6i.xlarge",
        "c6i.2xlarge",
        "g4dn.xlarge",
      ];
      baselineEc2Instance = "c6i.xlarge";

      if (selectedProvider === "aws") {
        console.log("\n💡 Dynamic Workload-Aware EC2 Fleet Sizing:");
        console.log(
          "   You can select multiple instance types. The Fleet Manager will dynamically dispatch",
        );
        console.log(
          "   lightweight chunks to smaller machines and heavy 4K/multibitrate chunks to larger/GPU machines.",
        );

        const fleetPoolChoice = await promptMenu(
          rl,
          "Select EC2 Fleet Auto-Scaling Sizing Strategy:",
          [
            {
              label:
                "Balanced Multi-Tier (c6i.large, c6i.xlarge, c6i.2xlarge, g4dn.xlarge) - [Recommended]",
              value: "c6i.large,c6i.xlarge,c6i.2xlarge,g4dn.xlarge",
            },
            {
              label:
                "Cost-Optimized CPU Only (c6i.large, c6i.xlarge, c6i.2xlarge)",
              value: "c6i.large,c6i.xlarge,c6i.2xlarge",
            },
            {
              label:
                "AWS Graviton3 ARM Fleet (c7g.xlarge, c7g.2xlarge) - Lowest cost per frame",
              value: "c7g.xlarge,c7g.2xlarge",
            },
            {
              label:
                "GPU Accelerated Heavy Fleet (g4dn.xlarge, g5.xlarge, c6i.2xlarge)",
              value: "g4dn.xlarge,g5.xlarge,c6i.2xlarge",
            },
            {
              label: "Single Static Instance Type (c6i.xlarge only)",
              value: "c6i.xlarge",
            },
          ],
          "1",
        );

        selectedEc2Instances = fleetPoolChoice.split(",").map((s) => s.trim());
        baselineEc2Instance = selectedEc2Instances[0] ?? "c6i.xlarge";
      }

      // 3. Choose Control Plane Architecture
      const controlChoice = await promptMenu(
        rl,
        "Select Control Plane Architecture:",
        [
          {
            label:
              "Serverful   - Long-running HTTP API Daemon + Coordination Scheduler (Port 4000)",
            value: "serverful",
          },
          {
            label:
              "Serverless  - Event-driven Lambda / SQS batch worker execution",
            value: "serverless",
          },
        ],
        selectedControlPlane === "serverless" ? "2" : "1",
      );
      selectedControlPlane = controlChoice as "serverful" | "serverless";
    } finally {
      rl.close();
    }
  } else {
    console.log(
      "ℹ️ Running in non-interactive mode. Using configuration from apps/fleet-manager/fleet.config.json.",
    );
  }

  const selectedPlugin =
    PLUGIN_REGISTRY[selectedProvider] ?? localPluginManifest;

  // =========================================================================
  // STEP 2: Plugin Dependency Verification
  // =========================================================================
  console.log("\n1. 📦 Plugin Dependency Audit:");
  const allProviderPackages = Object.values(PLUGIN_REGISTRY).map(
    (p) => p.packageName,
  );
  await syncPluginDependencies(
    cwd,
    selectedPlugin.packageName,
    allProviderPackages,
  );

  // =========================================================================
  // STEP 3: Save updated apps/fleet-manager/fleet.config.json & worker.config.json
  // =========================================================================
  const isAws = selectedProvider === "aws";
  const isServerless = selectedControlPlane === "serverless";

  const prodStorageDir = resolve(
    cwd,
    existingEnv.STORAGE_BASE_PATH || "s3-bucket",
  );
  const tempStorageDir = resolve(
    cwd,
    existingEnv.TEMP_STORAGE_PATH || "s3-bucket/temp",
  );

  const fleetConfig: FleetConfig = {
    provider: selectedProvider,
    executionMode: selectedControlPlane,
    runner: {
      type: selectedRunner,
      ...(selectedRunner === "docker" || selectedRunner === "podman"
        ? {
            containerEngine: selectedRunner,
            containerImage:
              existingEnv.CONTAINER_IMAGE ||
              "localhost/veolms-media-worker:latest",
          }
        : {}),
      ...(isAws
        ? {
            allowedInstanceTypes: selectedEc2Instances,
          }
        : {}),
      maxWorkersPerVideo: 4,
      maxTotalWorkers: 10,
      idleTimeoutSeconds: 10,
      reuseProgressThreshold: 85,
    },
    storage: isAws
      ? {
          type: "s3",
          tempBucket:
            existingEnv.S3_TEMP_BUCKET || "veolms-temp-scratch-bucket",
          productionBucket:
            existingEnv.S3_PROD_BUCKET || "veolms-production-media-bucket",
          autoPruneIntermediateChunks: true,
        }
      : {
          type: "local",
          tempStoragePath: "./s3-bucket/temp",
          productionStoragePath: "./s3-bucket",
          autoPruneIntermediateChunks: true,
        },
    ...(!isServerless
      ? {
          server: {
            host: "127.0.0.1",
            port: 4000,
          },
        }
      : {}),
  };

  const workerConfig: WorkerConfig = {
    controlPlane: {
      mode: selectedControlPlane,
      fleetManagerUrl: !isServerless
        ? existingEnv.FLEET_MANAGER_API_URL || "http://127.0.0.1:4000"
        : "",
    },
    storage: isAws
      ? {
          type: "s3",
          tempBucket:
            existingEnv.S3_TEMP_BUCKET || "veolms-temp-scratch-bucket",
          productionBucket:
            existingEnv.S3_PROD_BUCKET || "veolms-production-media-bucket",
        }
      : {
          type: "local",
          tempBucket: "./s3-bucket/temp",
          productionBucket: "./s3-bucket",
        },
    transcoding: {
      engine: "fluent-ffmpeg",
      preset: "veryfast",
      crf: 22,
      hlsSegmentDuration: 6,
      hardwareAcceleration: "auto",
    },
  };

  await writeFile(
    fleetConfigPath,
    JSON.stringify(fleetConfig, null, 2) + "\n",
    "utf-8",
  );
  await writeFile(
    workerConfigPath,
    JSON.stringify(workerConfig, null, 2) + "\n",
    "utf-8",
  );

  console.log("\n2. 🔍 Selected Architecture Configuration:");
  console.log(
    `   ├─ Plugin:                 \x1b[32m${selectedPlugin.name}\x1b[0m (${selectedPlugin.packageName})`,
  );
  console.log(
    `   ├─ Runner Type:            \x1b[32m${fleetConfig.runner.type}\x1b[0m`,
  );
  console.log(
    `   ├─ Control Plane:          \x1b[32m${fleetConfig.executionMode}\x1b[0m`,
  );
  console.log(
    `   ├─ Fleet Config File:      apps/fleet-manager/fleet.config.json ✅`,
  );
  console.log(
    `   └─ Worker Config File:     apps/media-worker/worker.config.json ✅\n`,
  );

  // =========================================================================
  // STEP 4: System Binaries & Hardware Audit
  // =========================================================================
  console.log("3. 🖥️  System Binaries & Hardware Audit:");
  const nodeVersion = process.version;
  console.log(`   ├─ Node.js Runtime:        ${nodeVersion} ✅`);

  let isHardwareAccelerated = false;

  if (selectedProvider === "local") {
    const ffmpegVersion = await checkSystemBinary("ffmpeg", ["-version"]);
    if (ffmpegVersion) {
      console.log(
        `   ├─ Local FFmpeg Binary:    ${ffmpegVersion.substring(0, 30)} ✅`,
      );
    } else {
      console.log(
        `   ├─ Local FFmpeg Binary:    NOT FOUND ❌ (Please install ffmpeg for local worker)`,
      );
    }

    const hwInfo = await detectHardwareEncoder();
    isHardwareAccelerated = hwInfo.isHardwareAccelerated;
    console.log(
      `   ├─ Hardware Acceleration:  ${hwInfo.isHardwareAccelerated ? `Enabled (${hwInfo.type.toUpperCase()} / ${hwInfo.encoder}) ⚡` : "Software libx264 (CPU) ✅"}`,
    );

    if (fleetConfig.runner.type === "podman") {
      const podmanVer = await checkSystemBinary("podman", ["--version"]);
      console.log(
        `   └─ Podman Engine:          ${podmanVer ?? "NOT FOUND ⚠️"}`,
      );
    } else if (fleetConfig.runner.type === "docker") {
      const dockerVer = await checkSystemBinary("docker", ["--version"]);
      console.log(
        `   └─ Docker Engine:          ${dockerVer ?? "NOT FOUND ⚠️"}`,
      );
    } else {
      console.log(
        `   └─ Runner Engine:          Native Host Child Processes (No container engine required) ✅`,
      );
    }
  } else if (selectedProvider === "aws") {
    console.log(
      `   ├─ Transcoding Engine:     AWS EC2 Spot Workers (Debian 14 + FFmpeg 7.x auto-provisioned) ☁️`,
    );
    console.log(
      `   └─ Cloud Hardware Codecs:  Dynamic NVENC GPU / Graviton / Intel QSV support on EC2 ⚡`,
    );
  } else {
    console.log(
      `   └─ Simulation Engine:      Virtual Transcoding Simulator (Zero local FFmpeg dependency) 🧪`,
    );
  }
  console.log();

  // Storage directories verification
  await mkdir(prodStorageDir, { recursive: true });
  await mkdir(tempStorageDir, { recursive: true });

  // =========================================================================
  // STEP 5: Generate Dynamic Driver Factory (driver-instance.ts)
  // =========================================================================
  console.log(
    "4. ⚙️  Generating Dynamic Driver Factory (driver-instance.ts)...",
  );
  const driverInstancePath = resolve(
    cwd,
    "apps/fleet-manager/src/serverful/driver-instance.ts",
  );

  let driverContent = "";
  if (selectedPlugin.provider === "simulator") {
    driverContent = `// Auto-generated by pnpm run fleet:pre:setup from @veolms/fleet-plugin-simulator.
import { SimulatorCloudDriver } from "@veolms/fleet-plugin-simulator";
import type { CloudDriver } from "@veolms/fleet-types";

export function createConfiguredDriver(): CloudDriver {
  return new SimulatorCloudDriver();
}
`;
  } else if (selectedPlugin.provider === "aws") {
    driverContent = `// Auto-generated by pnpm run fleet:pre:setup from @veolms/fleet-plugin-aws.
import { AwsCloudDriver } from "@veolms/fleet-plugin-aws";
import type { CloudDriver } from "@veolms/fleet-types";

export function createConfiguredDriver(): CloudDriver {
  const allowedPool = (process.env.AWS_EC2_INSTANCE_TYPES || "${selectedEc2Instances.join(",")}")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return new AwsCloudDriver({
    region: process.env.AWS_REGION || "us-east-1",
    instanceType: process.env.AWS_EC2_INSTANCE_TYPE || "${baselineEc2Instance}",
    allowedInstanceTypes: allowedPool,
    useSpotInstances: process.env.RUNNER_MODE !== "on_demand",
    tempS3Bucket: process.env.S3_TEMP_BUCKET || "veolms-temp-scratch-bucket",
    prodS3Bucket: process.env.S3_PROD_BUCKET || "veolms-production-media-bucket",
    fleetManagerApiUrl: process.env.FLEET_MANAGER_API_URL || "http://127.0.0.1:4000",
    databaseUrl: process.env.DATABASE_URL,
    amiId: process.env.AWS_EC2_AMI_ID,
    subnetId: process.env.AWS_SUBNET_ID,
    securityGroupIds: process.env.AWS_SECURITY_GROUP_ID
      ? [process.env.AWS_SECURITY_GROUP_ID]
      : undefined,
    iamInstanceProfileArn: process.env.AWS_IAM_ROLE_ARN,
    spotMaxPrice: process.env.AWS_SPOT_MAX_PRICE,
  });
}
`;
  } else {
    if (fleetConfig.runner.type === "process") {
      driverContent = `// Auto-generated by pnpm run fleet:pre:setup from @veolms/fleet-plugin-local.
import { LocalCloudDriver } from "@veolms/fleet-plugin-local";
import type { CloudDriver } from "@veolms/fleet-types";
import { resolve } from "node:path";

export function createConfiguredDriver(): CloudDriver {
  return new LocalCloudDriver({
    runnerMode: "process",
    cwd: process.cwd(),
    workerScriptPath: resolve(process.cwd(), "apps/media-worker/src/index.ts"),
    storageBasePath: process.env.STORAGE_BASE_PATH || resolve(process.cwd(), "${fleetConfig.storage.productionStoragePath}"),
  });
}
`;
    } else {
      driverContent = `// Auto-generated by pnpm run fleet:pre:setup from @veolms/fleet-plugin-local.
import { LocalCloudDriver } from "@veolms/fleet-plugin-local";
import type { CloudDriver } from "@veolms/fleet-types";
import { resolve } from "node:path";

export function createConfiguredDriver(): CloudDriver {
  const s3BucketDir = process.env.STORAGE_BASE_PATH || resolve(process.cwd(), "${fleetConfig.storage.productionStoragePath}");
  return new LocalCloudDriver({
    runnerMode: "${fleetConfig.runner.type}",
    containerImage: process.env.CONTAINER_IMAGE || "${fleetConfig.runner.containerImage || "localhost/veolms-media-worker:latest"}",
    volumeMounts: [\`\${s3BucketDir}:/app/s3-bucket:rw\`],
    networkMode: "host",
  });
}
`;
    }
  }

  await writeFile(driverInstancePath, driverContent, "utf-8");
  console.log(
    `   └─ Driver Generated:       apps/fleet-manager/src/serverful/driver-instance.ts ✅\n`,
  );

  // =========================================================================
  // STEP 6: Generate Fleet Manager Main Entrypoint (index.ts)
  // =========================================================================
  console.log("5. 🚀 Generating Fleet Manager Main Entrypoint (index.ts)...");
  const mainIndexPath = resolve(cwd, "apps/fleet-manager/src/index.ts");
  let mainIndexContent = "";

  if (fleetConfig.executionMode === "serverless") {
    mainIndexContent = `// Auto-generated by pnpm run fleet:pre:setup for Serverless Execution Mode.
export { handler, getOrCreateServerlessHandler } from "./serverless/entrypoint.ts";
`;
  } else {
    mainIndexContent = `// Auto-generated by pnpm run fleet:pre:setup for Serverful Execution Mode.
import { resolve } from "node:path";
import { FleetDaemon } from "./serverful/daemon.ts";
import { DEFAULT_FLEET_CONFIG } from "@veolms/fleet-types";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(resolve(process.cwd(), "apps/fleet-manager/.env.local"));
  } catch {
    // Fallback if environment variables already provided via process.env
  }
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ Error: DATABASE_URL is not set in environment or .env.local");
    process.exit(1);
  }

  const port = parseInt(process.env.PORT || "${fleetConfig.server?.port || 4000}", 10);
  const host = process.env.HOST || "${fleetConfig.server?.host || "127.0.0.1"}";
  const managerApiUrl = process.env.FLEET_MANAGER_API_URL || \`http://\${host}:\${port}\`;

  const daemon = new FleetDaemon({
    host,
    port,
    databaseUrl: dbUrl,
    queueConnectionString: dbUrl,
    coordinationIntervalMs: 2000,
    managerApiUrl,
    fleetConfig: DEFAULT_FLEET_CONFIG,
  });

  await daemon.start();
  console.log(\`✅ FleetDaemon running & listening at \${managerApiUrl}\`);

  const shutdown = async () => {
    console.log("\\n🛑 Shutting down Fleet Manager Daemon...");
    await daemon.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
`;
  }

  await writeFile(mainIndexPath, mainIndexContent, "utf-8");
  console.log(
    `   └─ Main Entrypoint Generated: apps/fleet-manager/src/index.ts ✅\n`,
  );

  // =========================================================================
  // STEP 7: Generate Component-Tailored .env.local Files
  // =========================================================================
  console.log(
    "6. 📝 Generating Component-Tailored Environment Variables (.env.local)...",
  );

  const rawDbUrl = existingEnv.DATABASE_URL || process.env.DATABASE_URL || "";
  const existingDbUrl =
    rawDbUrl.trim() !== "" && !rawDbUrl.includes("user:password@host")
      ? rawDbUrl.trim()
      : "postgresql://postgres:postgres@localhost:5432/veolms";

  // Build Fleet Manager .env.local
  const fleetEnvLines: string[] = [
    `# ==============================================================================`,
    `# VeoLMS Fleet Manager - Environment Configuration (.env.local)`,
    `# Generated by: pnpm run fleet:pre:setup`,
    `# Provider Plugin: ${selectedPlugin.name.toUpperCase()} (${selectedPlugin.packageName})`,
    `# ==============================================================================`,
    ``,
    `# [1] Database Settings`,
    `DATABASE_URL=${existingDbUrl}`,
    ``,
    `# [2] Control Plane & Architecture Settings`,
    `PROVIDER=${selectedPlugin.provider}`,
    `FLEET_ARCHITECTURE=${selectedControlPlane}`,
  ];

  if (!isServerless) {
    const managerUrl =
      existingEnv.FLEET_MANAGER_API_URL ||
      `http://${fleetConfig.server?.host || "127.0.0.1"}:${fleetConfig.server?.port || 4000}`;
    fleetEnvLines.push(`FLEET_MANAGER_API_URL=${managerUrl}`);
  }

  if (existingEnv.FLEET_API_KEY) {
    fleetEnvLines.push(`FLEET_API_KEY=${existingEnv.FLEET_API_KEY}`);
  }

  const sanitizePlaceholder = (val?: string) => {
    if (!val) return "";
    if (
      val.includes("ami-0c7217cdde317cfec") ||
      val.includes("sg-0123456789abcdef0") ||
      val.includes("arn:aws:iam::123456789012")
    ) {
      return "";
    }
    return val.trim();
  };

  fleetEnvLines.push("");

  if (selectedProvider === "aws") {
    fleetEnvLines.push(
      `# [3] AWS Cloud Worker Fleet Provisioning Settings`,
      `AWS_REGION=${existingEnv.AWS_REGION || "us-east-1"}`,
      `AMI_MODE=${existingEnv.AMI_MODE || "golden_ami"}`,
      `RUNNER_MODE=${selectedRunner}`,
      `AWS_EC2_INSTANCE_TYPE=${baselineEc2Instance}`,
      `AWS_EC2_INSTANCE_TYPES=${selectedEc2Instances.join(",")}`,
    );

    if (existingEnv.DEBUG === "true") {
      fleetEnvLines.push(`DEBUG=true`);
    }

    const amiId = sanitizePlaceholder(
      existingEnv.AWS_EC2_AMI_ID || existingEnv.AWS_AMI_ID,
    );
    if (amiId) {
      fleetEnvLines.push(`AWS_EC2_AMI_ID=${amiId}`);
    }

    const sgId = sanitizePlaceholder(existingEnv.AWS_SECURITY_GROUP_ID);
    if (sgId) {
      fleetEnvLines.push(`AWS_SECURITY_GROUP_ID=${sgId}`);
    }

    const iamRole = sanitizePlaceholder(existingEnv.AWS_IAM_ROLE_ARN);
    if (iamRole) {
      fleetEnvLines.push(`AWS_IAM_ROLE_ARN=${iamRole}`);
    }
  } else if (selectedProvider === "local") {
    fleetEnvLines.push(
      `# [3] Local Runner Engine Settings`,
      `RUNNER_MODE=${selectedRunner}`,
    );

    if (
      existingEnv.FORCE_SOFTWARE_ENCODER === "true" ||
      !isHardwareAccelerated
    ) {
      fleetEnvLines.push(`FORCE_SOFTWARE_ENCODER=true`);
    }

    if (selectedRunner === "podman" || selectedRunner === "docker") {
      fleetEnvLines.push(
        `CONTAINER_ENGINE=${selectedRunner}`,
        `CONTAINER_IMAGE=${existingEnv.CONTAINER_IMAGE || "localhost/veolms-media-worker:latest"}`,
      );
    }
  } else if (selectedProvider === "simulator") {
    fleetEnvLines.push(
      `# [3] Simulator Virtual Fleet Settings`,
      `SIMULATION_MODE=true`,
      `SIMULATOR_TICK_INTERVAL_MS=2000`,
      `SIMULATOR_CHUNK_DURATION_SECONDS=6`,
    );
  }

  // Build Media Worker .env.local
  const workerEnvLines: string[] = [
    `# ==============================================================================`,
    `# VeoLMS Media Worker - Environment Configuration (.env.local)`,
    `# Generated by: pnpm run fleet:pre:setup`,
    `# ==============================================================================`,
    ``,
    `# [1] Database Settings (Queue connection)`,
    `DATABASE_URL=${existingDbUrl}`,
  ];

  if (!isServerless) {
    const managerUrl =
      existingEnv.FLEET_MANAGER_API_URL ||
      `http://${fleetConfig.server?.host || "127.0.0.1"}:${fleetConfig.server?.port || 4000}`;
    workerEnvLines.push(
      ``,
      `# [2] Control Plane Settings`,
      `FLEET_MANAGER_API_URL=${managerUrl}`,
    );
  }

  if (existingEnv.FLEET_API_KEY) {
    workerEnvLines.push(`FLEET_API_KEY=${existingEnv.FLEET_API_KEY}`);
  }

  workerEnvLines.push(``);

  if (selectedProvider === "aws" || fleetConfig.storage.type === "s3") {
    workerEnvLines.push(
      `# [3] Storage & S3 Configuration`,
      `STORAGE_DRIVER=s3`,
      `S3_TEMP_BUCKET=${existingEnv.S3_TEMP_BUCKET || fleetConfig.storage.tempBucket || "veolms-temp-scratch-bucket"}`,
      `S3_PROD_BUCKET=${existingEnv.S3_PROD_BUCKET || fleetConfig.storage.productionBucket || "veolms-production-media-bucket"}`,
      `AWS_REGION=${existingEnv.AWS_REGION || "us-east-1"}`,
    );

    if (existingEnv.S3_ENDPOINT) {
      workerEnvLines.push(`S3_ENDPOINT=${existingEnv.S3_ENDPOINT}`);
    }
    if (existingEnv.AWS_ACCESS_KEY_ID) {
      workerEnvLines.push(`AWS_ACCESS_KEY_ID=${existingEnv.AWS_ACCESS_KEY_ID}`);
    }
    if (existingEnv.AWS_SECRET_ACCESS_KEY) {
      workerEnvLines.push(
        `AWS_SECRET_ACCESS_KEY=${existingEnv.AWS_SECRET_ACCESS_KEY}`,
      );
    }
    if (existingEnv.S3_FORCE_PATH_STYLE) {
      workerEnvLines.push(
        `S3_FORCE_PATH_STYLE=${existingEnv.S3_FORCE_PATH_STYLE}`,
      );
    }
  } else {
    workerEnvLines.push(
      `# [3] Local Storage Paths`,
      `STORAGE_DRIVER=local`,
      `STORAGE_BASE_PATH=${existingEnv.STORAGE_BASE_PATH || "./s3-bucket"}`,
      `TEMP_STORAGE_PATH=${existingEnv.TEMP_STORAGE_PATH || "./s3-bucket/temp"}`,
    );
  }

  await writeFile(fleetEnvPath, fleetEnvLines.join("\n") + "\n", "utf-8");
  await writeFile(workerEnvPath, workerEnvLines.join("\n") + "\n", "utf-8");

  console.log(`   ├─ Written:                apps/fleet-manager/.env.local ✅`);
  console.log(
    `   └─ Written:                apps/media-worker/.env.local ✅\n`,
  );

  // =========================================================================
  // STEP 8: Run Workspace Dependency Sync (pnpm install)
  // =========================================================================
  console.log("7. 📦 Synchronizing Workspace Dependencies (pnpm install)...");
  try {
    await execFileAsync("pnpm", ["install"]);
    console.log(`   └─ Workspace Dependencies Linked ✅\n`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`   └─ pnpm install notice: ${msg}\n`);
  }

  // =========================================================================
  // STEP 9: Pre-Flight Database Validation
  // =========================================================================
  console.log("8. 🧪 Pre-Flight Database Health Check:");
  try {
    const db = createDatabase(existingDbUrl);
    const result = await db
      .selectFrom("video_jobs")
      .select("id")
      .limit(1)
      .execute();
    await db.destroy();
    console.log(
      `   └─ Database Connection:    Active & Verified (${result.length} sample rows read) ✅\n`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(
      `   └─ Database Connection:    Notice/Warning: ${msg} (Check credentials in .env.local) ⚠️\n`,
    );
  }

  console.log("=".repeat(78));
  console.log("🎉 VeoLMS Plugin Environment Pre-Setup Completed Successfully!");
  console.log("=".repeat(78));
  console.log(
    "\n📋 Please review your generated configuration files before deploying:",
  );
  console.log(`   • Fleet Config:     apps/fleet-manager/fleet.config.json`);
  console.log(`   • Worker Config:    apps/media-worker/worker.config.json`);
  console.log(`   • Fleet Manager Env: apps/fleet-manager/.env.local`);
  console.log(`   • Media Worker Env:  apps/media-worker/.env.local`);
  console.log("\n🚀 Next Step - Provision Infrastructure:");
  console.log(
    "   Run: `pnpm run fleet:infra` (or `pnpm run fleet:infra setup`)",
  );
  console.log(
    "   (It will automatically read apps/fleet-manager/.env.local without asking duplicate questions)\n",
  );
  console.log("=".repeat(78) + "\n");
}

void runInteractivePreSetup();
