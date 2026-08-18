import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";

export interface DeployLambdaOptions {
  readonly region: string;
  readonly functionName?: string;
  readonly roleArn: string;
  readonly zipCodeBuffer?: Uint8Array;
  readonly databaseUrl?: string;
  readonly tempBucket?: string;
  readonly prodBucket?: string;
  readonly memorySizeMb?: number;
  readonly timeoutSeconds?: number;
  readonly workspaceRoot?: string;
}

export interface DeployLambdaResult {
  readonly functionName: string;
  readonly functionArn: string;
  readonly isNew: boolean;
}

// Pre-computed CRC32 table for pure-JS zip generation
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c;
}

function calculateCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]!) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a valid, standalone ZIP buffer in pure Node.js containing a single file.
 */
export function createSingleFileZip(
  filename: string,
  content: string,
): Uint8Array {
  const contentBuf = Buffer.from(content, "utf-8");
  const filenameBuf = Buffer.from(filename, "utf-8");
  const crc = calculateCrc32(contentBuf);
  const size = contentBuf.length;
  const nameLen = filenameBuf.length;

  // 1. Local File Header (30 bytes + nameLen + size)
  const localHeader = Buffer.alloc(30);
  localHeader.write("PK\x03\x04", 0); // Signature
  localHeader.writeUInt16LE(20, 4); // Version needed (2.0)
  localHeader.writeUInt16LE(0, 6); // Flags
  localHeader.writeUInt16LE(0, 8); // Compression method (0 = Stored)
  localHeader.writeUInt16LE(0x56a0, 10); // Time (10:53:00)
  localHeader.writeUInt16LE(0x5ca0, 12); // Date (2026-05-00)
  localHeader.writeUInt32LE(crc, 14); // CRC-32
  localHeader.writeUInt32LE(size, 18); // Compressed size
  localHeader.writeUInt32LE(size, 22); // Uncompressed size
  localHeader.writeUInt16LE(nameLen, 26); // Filename length
  localHeader.writeUInt16LE(0, 28); // Extra field length

  // 2. Central Directory Header (46 bytes + nameLen)
  const centralHeader = Buffer.alloc(46);
  centralHeader.write("PK\x01\x02", 0); // Signature
  centralHeader.writeUInt16LE(20, 4); // Version made by
  centralHeader.writeUInt16LE(20, 6); // Version needed
  centralHeader.writeUInt16LE(0, 8); // Flags
  centralHeader.writeUInt16LE(0, 10); // Compression method
  centralHeader.writeUInt16LE(0x56a0, 12); // Time
  centralHeader.writeUInt16LE(0x5ca0, 14); // Date
  centralHeader.writeUInt32LE(crc, 16); // CRC-32
  centralHeader.writeUInt32LE(size, 20); // Compressed size
  centralHeader.writeUInt32LE(size, 24); // Uncompressed size
  centralHeader.writeUInt16LE(nameLen, 28); // Filename length
  centralHeader.writeUInt16LE(0, 30); // Extra length
  centralHeader.writeUInt16LE(0, 32); // Comment length
  centralHeader.writeUInt16LE(0, 34); // Disk number start
  centralHeader.writeUInt16LE(0, 36); // Internal file attributes
  centralHeader.writeUInt32LE(0x81a40000, 38); // External file attributes (-rw-r--r--)
  centralHeader.writeUInt32LE(0, 42); // Relative offset of local header

  const localOffset = 30 + nameLen + size;
  const centralSize = 46 + nameLen;

  // 3. End of Central Directory Record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.write("PK\x05\x06", 0); // Signature
  eocd.writeUInt16LE(0, 4); // Disk number
  eocd.writeUInt16LE(0, 6); // Central dir start disk
  eocd.writeUInt16LE(1, 8); // Number of entries on this disk
  eocd.writeUInt16LE(1, 10); // Total entries
  eocd.writeUInt32LE(centralSize, 12); // Size of central directory
  eocd.writeUInt32LE(localOffset, 16); // Offset of start of central directory
  eocd.writeUInt16LE(0, 20); // Zip comment length

  return Buffer.concat([
    localHeader,
    filenameBuf,
    contentBuf,
    centralHeader,
    filenameBuf,
    eocd,
  ]);
}

/**
 * Recursively locates the monorepo workspace root containing pnpm-workspace.yaml.
 */
function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let curr = resolve(startDir);
  while (curr !== resolve(curr, "..")) {
    if (
      existsSync(resolve(curr, "pnpm-workspace.yaml")) ||
      (existsSync(resolve(curr, "package.json")) &&
        existsSync(resolve(curr, "apps")))
    ) {
      return curr;
    }
    curr = resolve(curr, "..");
  }
  return startDir;
}

/**
 * Builds and bundles the real serverless Lambda code from `apps/fleet-manager`.
 * Executes `pnpm --filter @veolms/fleet-manager run bundle:lambda` and packages the output.
 */
export async function bundleFleetManagerLambda(
  workspaceRoot?: string,
): Promise<Uint8Array> {
  const root = workspaceRoot ?? findWorkspaceRoot();
  const fleetManagerDist = resolve(
    root,
    "apps/fleet-manager/dist/lambda/index.mjs",
  );

  try {
    execSync("pnpm --filter @veolms/fleet-manager run bundle:lambda", {
      cwd: root,
      stdio: "pipe",
    });
  } catch (err: unknown) {
    const execErr = err as {
      stdout?: Buffer;
      stderr?: Buffer;
      message?: string;
    };
    const stderrStr = execErr.stderr?.toString("utf-8") || "";
    const stdoutStr = execErr.stdout?.toString("utf-8") || "";
    const fullOutput =
      (stderrStr + "\n" + stdoutStr).trim() || execErr.message || String(err);

    const formattedError = [
      "\n=============================================================================",
      "❌ BUNDLE COMPILATION ERROR: @veolms/fleet-manager",
      "=============================================================================",
      "Failed to bundle the serverless Lambda entrypoint for deployment:",
      "",
      fullOutput,
      "",
      "🛠️  Troubleshooting Steps:",
      " 1. Inspect the file and line number mentioned in the compiler output above.",
      " 2. Run 'pnpm --filter @veolms/fleet-manager run bundle:lambda' to test locally.",
      " 3. Run 'pnpm typecheck' to check for TypeScript errors.",
      "=============================================================================\n",
    ].join("\n");

    console.error(formattedError);
    throw new Error(`Lambda Bundling Failed:\n${fullOutput}`);
  }

  const bundledCode = await readFile(fleetManagerDist, "utf-8");
  return createSingleFileZip("index.mjs", bundledCode);
}

/**
 * Automates deployment and update of VeoLMS Serverless Fleet Manager Control Plane to AWS Lambda.
 * Packages the real compiled code from `apps/fleet-manager` directly.
 */
export async function deployServerlessLambda(
  options: DeployLambdaOptions,
): Promise<DeployLambdaResult> {
  const {
    region,
    functionName = "VeoLMS-FleetManager-ControlPlane",
    roleArn,
    databaseUrl = "postgresql://postgres:postgres@localhost:5432/veolms",
    tempBucket = "veolms-temp-scratch-bucket",
    prodBucket = "veolms-production-media-bucket",
    memorySizeMb = 512,
    timeoutSeconds = 60,
    workspaceRoot,
  } = options;

  const zipCodeBuffer =
    options.zipCodeBuffer ?? (await bundleFleetManagerLambda(workspaceRoot));

  const lambda = new LambdaClient({ region });

  const envVariables: Record<string, string> = {
    DATABASE_URL: databaseUrl,
    STORAGE_DRIVER: "s3",
    S3_TEMP_BUCKET: tempBucket,
    S3_PROD_BUCKET: prodBucket,
    DEBUG: process.env.DEBUG === "true" ? "true" : "false",
    NODE_OPTIONS: "--enable-source-maps",
  };

  // 1. Check if function exists and verify architecture
  let exists = false;
  let existingArn = "";
  try {
    const getRes = await lambda.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    );
    const existingArch = getRes.Configuration?.Architectures?.[0];
    if (existingArch && existingArch !== "arm64") {
      console.log(
        `  🔄 Migrating Lambda architecture from [${existingArch}] to [arm64] (Graviton)...`,
      );
      await lambda.send(
        new DeleteFunctionCommand({ FunctionName: functionName }),
      );
      exists = false;
    } else {
      exists = true;
      existingArn = getRes.Configuration?.FunctionArn || "";
    }
  } catch {
    exists = false;
  }

  // 2. Update existing function
  if (exists) {
    // Update code first
    const codeRes = await lambda.send(
      new UpdateFunctionCodeCommand({
        FunctionName: functionName,
        ZipFile: zipCodeBuffer,
      }),
    );

    // Update configuration
    try {
      await lambda.send(
        new UpdateFunctionConfigurationCommand({
          FunctionName: functionName,
          Role: roleArn,
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          MemorySize: memorySizeMb,
          Timeout: timeoutSeconds,
          Environment: { Variables: envVariables },
        }),
      );
    } catch {
      // Configuration already up to date
    }

    return {
      functionName,
      functionArn: codeRes.FunctionArn || existingArn,
      isNew: false,
    };
  }

  // 3. Create new function
  const createRes = await lambda.send(
    new CreateFunctionCommand({
      FunctionName: functionName,
      Role: roleArn,
      Handler: "index.handler",
      Runtime: "nodejs22.x",
      Architectures: ["arm64"],
      MemorySize: memorySizeMb,
      Timeout: timeoutSeconds,
      Code: {
        ZipFile: zipCodeBuffer,
      },
      Environment: { Variables: envVariables },
      Tags: {
        Project: "VeoLMS",
      },
    }),
  );

  return {
    functionName,
    functionArn: createRes.FunctionArn || "",
    isNew: true,
  };
}

/**
 * Destroys the Serverless Lambda function.
 */
export async function destroyServerlessLambda(options: {
  region: string;
  functionName?: string;
}): Promise<boolean> {
  const { region, functionName = "VeoLMS-FleetManager-ControlPlane" } = options;
  const lambda = new LambdaClient({ region });

  try {
    await lambda.send(
      new DeleteFunctionCommand({ FunctionName: functionName }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks existence and status of the Serverless Lambda function.
 */
export async function checkServerlessLambda(options: {
  region: string;
  functionName?: string;
}): Promise<{
  exists: boolean;
  functionArn?: string;
  runtime?: string;
  architecture?: string;
}> {
  const { region, functionName = "VeoLMS-FleetManager-ControlPlane" } = options;
  const lambda = new LambdaClient({ region });

  try {
    const res = await lambda.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    );
    const arch = res.Configuration?.Architectures?.[0] || "arm64";
    return {
      exists: true,
      functionArn: res.Configuration?.FunctionArn,
      runtime: res.Configuration?.Runtime,
      architecture: arch,
    };
  } catch {
    return { exists: false };
  }
}
