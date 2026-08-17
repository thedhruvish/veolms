import { readFile } from "node:fs/promises";
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

// Auto-load .env.local from apps/fleet-manager/.env.local
try {
  const envContent = await readFile(
    resolve(process.cwd(), "apps/fleet-manager/.env.local"),
    "utf-8",
  );
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
} catch {
  // Ignore if not present
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
  console.log("🛠️  VeoLMS Unified Fleet Infrastructure Manager (`fleet:infra`)");
  console.log(
    "=============================================================================\n",
  );

  const isInteractive = Boolean(process.stdin.isTTY);
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

    // 1. Choose Provider
    let selectedProvider = configuredProvider;
    if (rawProviderArg && PLUGIN_REGISTRY[rawProviderArg]) {
      selectedProvider = rawProviderArg;
    } else {
      selectedProvider = await promptMenu(
        rl,
        "Which Infrastructure Provider do you want to manage?",
        providerChoices,
        defaultIdx >= 0 ? String(defaultIdx + 1) : "1",
      );
    }

    // 2. Choose Action (setup, destroy, reinstall, status)
    let selectedAction: InfraAction = "setup";
    if (["setup", "destroy", "reinstall", "status"].includes(rawActionArg || "")) {
      selectedAction = rawActionArg as InfraAction;
    } else {
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

    const manifest =
      PLUGIN_REGISTRY[selectedProvider] ?? localPluginManifest;

    console.log(
      `\n⏳ Executing [${selectedAction.toUpperCase()}] for provider [${manifest.name}]...\n`,
    );

    if (typeof manifest.provisionInfra !== "function") {
      console.log(`ℹ️ Provider ${manifest.provider} does not require manual infrastructure actions.`);
      return;
    }

    const result = await manifest.provisionInfra({
      action: selectedAction,
      region: process.env.AWS_REGION || "us-east-1",
      tempBucketName: process.env.S3_TEMP_BUCKET,
      prodBucketName: process.env.S3_PROD_BUCKET,
      tempStoragePath: process.env.TEMP_STORAGE_PATH || "./s3-bucket/temp",
      prodStoragePath: process.env.STORAGE_BASE_PATH || "./s3-bucket",
      databaseUrl: process.env.DATABASE_URL,
      runnerMode: process.env.RUNNER_MODE,
      isInteractive,
    });

    console.log(`✅ ${result.message}`);
    if (result.details) {
      console.log("\n📦 Resource Status / Details:");
      for (const [k, v] of Object.entries(result.details)) {
        console.log(`   • ${k.padEnd(26)}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
      }
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
    console.log(`🎉 Infrastructure [${selectedAction.toUpperCase()}] Completed!`);
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
