import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkerSpec } from "@veolms/fleet-types";

export interface BootstrapperOptions {
  workerId: string;
  spec: WorkerSpec;
  repoUrl?: string;
  workerBundleS3Url?: string;
  extraEnv?: Readonly<Record<string, string>>;
}

// bootstrap-script.sh is read as a sibling file, not bundled via an
// esbuild text-loader import, so it works both for direct `node`
// execution and the esbuild-bundled Lambda zip (buildLambdaBundleZip()
// copies it next to the bundled index.js).
//
// __dirname is preferred over import.meta.url because esbuild's CJS
// output (used for the Lambda build) leaves import.meta.url undefined.
function resolveModuleDir(): string {
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }
  return dirname(fileURLToPath(import.meta.url));
}

const BOOTSTRAP_SCRIPT_TEMPLATE = readFileSync(
  join(resolveModuleDir(), "bootstrap-script.sh"),
  "utf-8",
);

function escapeEnvValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$")
    .replace(/\r?\n/g, "\\n");
}

export function generateUserDataScript(options: BootstrapperOptions): string {
  const { workerId, spec, extraEnv } = options;

  const mergedEnv: Record<string, string> = {
    WORKER_ID: workerId,
    PROVIDER: "aws",
    ...spec.environmentVariables,
    ...extraEnv,
  };

  const envFileLines = Object.entries(mergedEnv)
    .map(([k, v]) => `${k}="${escapeEnvValue(v)}"`)
    .join("\n");

  return BOOTSTRAP_SCRIPT_TEMPLATE.replaceAll(
    "__WORKER_ID__",
    workerId,
  ).replaceAll("__ENV_FILE_LINES__", envFileLines);
}

export function encodeUserDataBase64(script: string): string {
  return Buffer.from(script, "utf-8").toString("base64");
}
