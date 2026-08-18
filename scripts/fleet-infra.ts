import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import type {
  FleetPluginManifest,
  InfraAction,
} from "../packages/fleet-types/src/index.ts";
import { localPluginManifest } from "../packages/fleet-plugin-local/src/index.ts";
import { simulatorPluginManifest } from "../packages/fleet-plugin-simulator/src/index.ts";
import { awsPluginManifest } from "../packages/fleet-plugin-aws/src/index.ts";

const PLUGIN_REGISTRY: Record<string, FleetPluginManifest> = {
  local: localPluginManifest,
  simulator: simulatorPluginManifest,
  aws: awsPluginManifest,
};

// Helper: Auto-load .env.local from apps/fleet-manager/.env.local and apps/media-worker/.env.local
async function loadEnvFiles() {
  const envPaths = [
    resolve(process.cwd(), "apps/fleet-manager/.env.local"),
    resolve(process.cwd(), "apps/media-worker/.env.local"),
  ];

  for (const envPath of envPaths) {
    try {
      const envContent = await readFile(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (val !== "" && !process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch {
      // Ignore if not present
    }
  }
}

await loadEnvFiles();

// Helper: Synchronize newly provisioned outputs back into apps/fleet-manager/.env.local & config files
async function syncEnvFiles(outputs: Record<string, string>) {
  if (!outputs || Object.keys(outputs).length === 0) return;

  const fleetEnvPath = resolve(process.cwd(), "apps/fleet-manager/.env.local");

  let existingContent = "";
  try {
    existingContent = await readFile(fleetEnvPath, "utf-8");
  } catch {
    existingContent = "";
  }

  const lines = existingContent ? existingContent.split("\n") : [];
  const keysUpdated = new Set<string>();

  // Only sync AWS infra provisioning keys into apps/fleet-manager/.env.local
  const allowedKeys = new Set([
    "AWS_IAM_ROLE_ARN",
    "AWS_SECURITY_GROUP_ID",
    "AWS_AMI_ID",
    "AWS_EC2_AMI_ID",
    "AWS_LAMBDA_FUNCTION_ARN",
    "CLOUDWATCH_WORKER_LOGS",
    "CLOUDWATCH_MANAGER_LOGS",
  ]);

  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      if (
        allowedKeys.has(key) &&
        outputs[key] !== undefined &&
        outputs[key] !== ""
      ) {
        keysUpdated.add(key);
        return `${key}=${outputs[key]}`;
      }
    }
    return line;
  });

  for (const [k, v] of Object.entries(outputs)) {
    if (allowedKeys.has(k) && !keysUpdated.has(k) && v) {
      updatedLines.push(`${k}=${v}`);
    }
  }

  await writeFile(fleetEnvPath, updatedLines.join("\n") + "\n", "utf-8");

  // If S3 bucket outputs exist, sync them directly to fleet.config.json & worker.config.json
  if (outputs.S3_TEMP_BUCKET || outputs.S3_PROD_BUCKET) {
    const fleetConfigPath = resolve(
      process.cwd(),
      "apps/fleet-manager/fleet.config.json",
    );
    const workerConfigPath = resolve(
      process.cwd(),
      "apps/media-worker/worker.config.json",
    );

    try {
      const fleetCfg = JSON.parse(await readFile(fleetConfigPath, "utf-8"));
      if (fleetCfg.storage) {
        if (outputs.S3_TEMP_BUCKET)
          fleetCfg.storage.tempBucket = outputs.S3_TEMP_BUCKET;
        if (outputs.S3_PROD_BUCKET)
          fleetCfg.storage.productionBucket = outputs.S3_PROD_BUCKET;
        await writeFile(
          fleetConfigPath,
          JSON.stringify(fleetCfg, null, 2) + "\n",
          "utf-8",
        );
      }
    } catch {
      // ignore
    }

    try {
      const workerCfg = JSON.parse(await readFile(workerConfigPath, "utf-8"));
      if (workerCfg.storage) {
        if (outputs.S3_TEMP_BUCKET)
          workerCfg.storage.tempBucket = outputs.S3_TEMP_BUCKET;
        if (outputs.S3_PROD_BUCKET)
          workerCfg.storage.productionBucket = outputs.S3_PROD_BUCKET;
        await writeFile(
          workerConfigPath,
          JSON.stringify(workerCfg, null, 2) + "\n",
          "utf-8",
        );
      }
    } catch {
      // ignore
    }
  }

  console.log(
    "\n💾 Automatically synchronized newly provisioned infrastructure IDs into apps/fleet-manager/.env.local ✅",
  );
}

async function promptMenu(
  rl: ReturnType<typeof createInterface> | null,
  question: string,
  options: { label: string; value: string }[],
  defaultValue = "1",
): Promise<string> {
  console.log(`\n${question}`);
  options.forEach((opt, idx) => {
    console.log(`  [${idx + 1}] ${opt.label}`);
  });

  if (!rl || !process.stdin.isTTY) {
    const fallback = parseInt(defaultValue, 10) - 1;
    const selected = options[fallback]?.value ?? options[0]!.value;
    console.log(`(Auto-selected: [${selected}])`);
    return selected;
  }

  const answer = await rl.question(`Select option [default ${defaultValue}]: `);
  const selectedIdx = parseInt(answer.trim(), 10) - 1;
  if (!isNaN(selectedIdx) && options[selectedIdx]) {
    return options[selectedIdx]!.value;
  }
  const fallback = parseInt(defaultValue, 10) - 1;
  return options[fallback]?.value ?? options[0]!.value;
}

async function main() {
  console.log(
    "\n=============================================================================",
  );
  console.log(
    "🛠️  VeoLMS Unified Fleet Infrastructure Manager (`fleet:infra`)",
  );
  console.log(
    "=============================================================================\n",
  );

  const isInteractive = Boolean(
    process.stdin.isTTY &&
    !process.env.NON_INTERACTIVE &&
    !process.env.CI &&
    process.argv.includes("--interactive"),
  );

  const rl = isInteractive
    ? createInterface({
        input: process.stdin,
        output: process.stdout,
      })
    : null;

  try {
    const configuredProvider = process.env.PROVIDER || "local";
    const rawActionArg = process.argv[2]?.toLowerCase();
    const rawProviderArg = process.argv[3]?.toLowerCase();

    const providerChoices = Object.values(PLUGIN_REGISTRY).map((p) => ({
      label: `${p.name.padEnd(36)} (${p.packageName})`,
      value: p.provider,
    }));

    const defaultIdx = providerChoices.findIndex(
      (c) => c.value === configuredProvider,
    );

    // 1. Choose Provider (Reads from .env.local if present)
    let selectedProvider = configuredProvider;
    if (rawProviderArg && PLUGIN_REGISTRY[rawProviderArg]) {
      selectedProvider = rawProviderArg;
    } else if (isInteractive && !process.env.PROVIDER) {
      selectedProvider = await promptMenu(
        rl,
        "Which Infrastructure Provider do you want to manage?",
        providerChoices,
        defaultIdx >= 0 ? String(defaultIdx + 1) : "1",
      );
    }

    // 2. Choose Action (setup, destroy, reinstall, status)
    let selectedAction: InfraAction = "setup";
    if (
      ["setup", "destroy", "reinstall", "status"].includes(rawActionArg || "")
    ) {
      selectedAction = rawActionArg as InfraAction;
    } else if (isInteractive) {
      const actionChoice = await promptMenu(
        rl,
        "Select Infrastructure Lifecycle Action:",
        [
          {
            label:
              "Setup / Provision     - Create/verify all storage, IAM, and security resources",
            value: "setup",
          },
          {
            label:
              "Status / Check        - Inspect health and availability of all infrastructure",
            value: "status",
          },
          {
            label:
              "Re-install / Reset    - Clean teardown and fresh re-provisioning",
            value: "reinstall",
          },
          {
            label:
              "Destroy / Teardown    - Permanently remove all infrastructure resources",
            value: "destroy",
          },
        ],
        "1",
      );
      selectedAction = actionChoice as InfraAction;
    }

    // 3. AWS-Specific Settings (Reads from .env.local, only prompts if interactive & not set)
    let selectedRegion = process.env.AWS_REGION || "us-east-1";
    let amiMode = process.env.AMI_MODE || "golden_ami";
    let architecture = process.env.FLEET_ARCHITECTURE || "serverless";

    if (selectedProvider === "aws") {
      if (isInteractive && !process.env.AWS_REGION) {
        const regionChoice = await promptMenu(
          rl,
          "Select AWS Region for Infrastructure Deployment:",
          [
            {
              label:
                "us-east-1   (US East - N. Virginia) [Default / Highest Spot Capacity]",
              value: "us-east-1",
            },
            { label: "us-east-2   (US East - Ohio)", value: "us-east-2" },
            { label: "us-west-2   (US West - Oregon)", value: "us-west-2" },
            { label: "eu-west-1   (Europe - Ireland)", value: "eu-west-1" },
            {
              label: "ap-south-1  (Asia Pacific - Mumbai)",
              value: "ap-south-1",
            },
            {
              label: "custom      (Enter custom region name)",
              value: "custom",
            },
          ],
          "1",
        );

        if (regionChoice === "custom" && rl) {
          const customReg = await rl.question(
            "Enter custom AWS region name (e.g. ap-southeast-1): ",
          );
          selectedRegion = customReg.trim() || "us-east-1";
        } else {
          selectedRegion = regionChoice;
        }
      }

      if (selectedAction === "setup" || selectedAction === "reinstall") {
        if (isInteractive && !process.env.AMI_MODE) {
          amiMode = await promptMenu(
            rl,
            "Select EC2 Worker Bootstrapping Strategy:",
            [
              {
                label:
                  "Pre-baked Golden AMI (Fast boot ~10s, creates custom AMI in your account) [Recommended]",
                value: "golden_ami",
              },
              {
                label:
                  "Dynamic UserData Bootstrapping (Cost-Optimized, $0 idle snapshot fees, official Debian 14 AMI)",
                value: "dynamic",
              },
            ],
            "1",
          );
        }

        if (isInteractive && !process.env.FLEET_ARCHITECTURE) {
          architecture = await promptMenu(
            rl,
            "Select Control Plane Architecture:",
            [
              {
                label:
                  "Serverless AWS Lambda (Auto-deploys VeoLMS-FleetManager Lambda function) [Recommended]",
                value: "serverless",
              },
              {
                label:
                  "Serverful Daemon (Node.js daemon / EC2 process / Local server)",
                value: "serverful",
              },
            ],
            "1",
          );
        }
      }
    }

    const manifest = PLUGIN_REGISTRY[selectedProvider] ?? localPluginManifest;

    console.log(
      `\n⏳ Executing [${selectedAction.toUpperCase()}] for provider [${manifest.name}] in region [${selectedRegion}]...\n`,
    );

    if (typeof manifest.provisionInfra !== "function") {
      console.log(
        `ℹ️ Provider ${manifest.provider} does not require manual infrastructure actions.`,
      );
      return;
    }

    const result = await manifest.provisionInfra({
      action: selectedAction,
      region: selectedRegion,
      tempBucketName: process.env.S3_TEMP_BUCKET,
      prodBucketName: process.env.S3_PROD_BUCKET,
      tempStoragePath: process.env.TEMP_STORAGE_PATH || "./s3-bucket/temp",
      prodStoragePath: process.env.STORAGE_BASE_PATH || "./s3-bucket",
      databaseUrl: process.env.DATABASE_URL,
      runnerMode:
        architecture === "serverless" ? "serverless" : process.env.RUNNER_MODE,
      architecture,
      deployLambda: architecture === "serverless",
      amiMode,
      isInteractive,
    });

    console.log(`✅ ${result.message}`);
    if (result.details) {
      console.log("\n📦 Resource Status / Details:");
      for (const [k, v] of Object.entries(result.details)) {
        console.log(
          `   • ${k.padEnd(26)}: ${typeof v === "object" ? JSON.stringify(v) : v}`,
        );
      }
    }

    // Synchronize outputs back into .env.local files
    if (result.outputs && selectedAction === "setup") {
      await syncEnvFiles({
        ...result.outputs,
        PROVIDER: selectedProvider,
        AWS_REGION: selectedRegion,
        FLEET_ARCHITECTURE: architecture,
        AMI_MODE: amiMode,
      });
    }

    if (result.instructions && result.instructions.length > 0) {
      console.log("\n📋 Next Steps:");
      for (const inst of result.instructions) {
        console.log(`   ${inst}`);
      }
    }

    console.log(
      "\n=============================================================================",
    );
    console.log(
      `🎉 Infrastructure [${selectedAction.toUpperCase()}] Completed!`,
    );
    console.log(
      "=============================================================================\n",
    );
  } finally {
    rl?.close();
  }
}

main().catch((err) => {
  console.error("❌ Infrastructure operation failed:", err);
  process.exit(1);
});
