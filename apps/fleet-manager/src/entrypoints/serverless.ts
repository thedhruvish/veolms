import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, type Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type {
  LambdaResponse,
  VideoJobEvent,
  VideoQualityLevel,
} from "@veolms/contracts";
import { videoJobEventSchema } from "@veolms/contracts";
import {
  loadFleetManagerConfig,
  resolveProviderName,
  type FleetManagerConfig,
} from "@veolms/config";
import type { FleetProvider } from "@veolms/fleet-types";
import {
  createFleetManager,
  type FleetManager,
  type MonitorCycleResult,
} from "../core/fleet-manager.ts";
import { resolveFleetProvider } from "../core/provider-resolver.ts";

export interface ServerlessFleetOptions {
  readonly configOverride?: Partial<FleetManagerConfig>;
  readonly provider?: FleetProvider;
  readonly providerName?: string;
  readonly providerOptions?: unknown;
  readonly db?: Kysely<Database>;
}

export interface ServerlessExecutionResult {
  readonly success: boolean;
  readonly jobClaimed?: boolean;
  readonly monitorResult?: MonitorCycleResult;
  readonly timestamp: string;
  readonly error?: string;
}

/**
 * Extracts and normalizes a VideoJobEvent payload from various serverless
 * invocation structures:
 * - Direct invocation payload (e.g. AWS Lambda SDK invoke, CloudEvent data)
 * - HTTP proxy payload (AWS Lambda Function URL, API Gateway, GCP HTTP function)
 */
export function extractVideoJobEvent(rawEvent: unknown): VideoJobEvent {
  if (!rawEvent || typeof rawEvent !== "object") {
    return {};
  }

  const record = rawEvent as Record<string, unknown>;
  let candidate: Record<string, unknown> = record;

  // Handle HTTP proxy integration format: event.body can be JSON string or base64
  if ("body" in record && record.body !== undefined && record.body !== null) {
    if (typeof record.body === "string") {
      try {
        const rawString =
          record.isBase64Encoded === true
            ? Buffer.from(record.body, "base64").toString("utf-8")
            : record.body;
        candidate = JSON.parse(rawString);
      } catch {
        candidate = {};
      }
    } else if (typeof record.body === "object" && record.body !== null) {
      candidate = record.body as Record<string, unknown>;
    }
  }

  // Safe parse against schema
  const parsed = videoJobEventSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }

  // Fallback extraction for loose / non-UUID or partial payloads
  const result: Record<string, unknown> = {};
  if (typeof candidate.action === "string") {
    const actionUpper = candidate.action.toUpperCase();
    if (["TICK", "CLAIM", "MONITOR", "QUEUE"].includes(actionUpper)) {
      result.action = actionUpper;
    }
  }
  if (typeof candidate.jobId === "string") result.jobId = candidate.jobId;
  if (typeof candidate.videoId === "string") result.videoId = candidate.videoId;
  if (typeof candidate.videoKey === "string")
    result.videoKey = candidate.videoKey;
  if (typeof candidate.outputPrefix === "string")
    result.outputPrefix = candidate.outputPrefix;
  if (Array.isArray(candidate.qualities))
    result.qualities = candidate.qualities;
  if (
    candidate.videoSize !== undefined &&
    !Number.isNaN(Number(candidate.videoSize))
  ) {
    result.videoSize = Number(candidate.videoSize);
  }

  return result as VideoJobEvent;
}

/**
 * Executes a single serverless cycle for the Fleet Manager.
 *
 * Programmatic interface suitable for any cloud serverless function or container runtime.
 */
export async function runServerlessFleetCycle(
  rawEvent: unknown = {},
  options: ServerlessFleetOptions = {},
): Promise<ServerlessExecutionResult> {
  const event = extractVideoJobEvent(rawEvent);
  const config = {
    ...loadFleetManagerConfig(),
    ...options.configOverride,
  };

  const db = options.db ?? createDatabase(config.DATABASE_URL);
  const shouldCloseDb = !options.db;

  try {
    let provider = options.provider;
    if (!provider) {
      const repoRoot = join(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "..",
        "..",
        "..",
      );
      const defaultWorkerScript = join(
        repoRoot,
        "apps/media-worker/src/index.ts",
      );
      const workerScript =
        config.MEDIA_WORKER_SCRIPT_PATH ??
        (existsSync(defaultWorkerScript) ? defaultWorkerScript : undefined);

      const targetProviderName =
        resolveProviderName(options.providerName, process.env) ??
        config.PROVIDER ??
        "AWS";

      const providerOpts = options.providerOptions ?? {
        workerScriptPath: workerScript,
      };

      provider = await resolveFleetProvider(targetProviderName, providerOpts);
    }

    const fleet: FleetManager = createFleetManager({
      provider,
      db,
      config,
    });

    // 1. If action is QUEUE and video parameters are provided, ensure job is queued (idempotent)
    if (event.action === "QUEUE" && event.videoKey) {
      const videoKey = event.videoKey;
      const videoId = event.videoId ?? event.jobId ?? videoKey;
      const outputPrefix = event.outputPrefix ?? `transcoded/${videoId}`;
      const qualities: readonly VideoQualityLevel[] = event.qualities ?? [
        "1080p",
        "720p",
        "480p",
        "360p",
      ];

      await fleet.queueJob({
        jobId: event.jobId,
        videoId,
        videoKey,
        outputPrefix,
        qualities,
        videoSize: event.videoSize ? Number(event.videoSize) : undefined,
      });
    }

    // 2. Run monitoring cycle first to clean up stale/timed-out workers and free capacity
    const monitorResult = await fleet.runMonitoringCycle();

    if (event.action === "MONITOR") {
      return {
        success: true,
        monitorResult,
        timestamp: new Date().toISOString(),
      };
    }

    // 3. Claim and provision next queued job
    const jobClaimed = await fleet.processNextJob();

    return {
      success: true,
      jobClaimed,
      monitorResult,
      timestamp: new Date().toISOString(),
    };
  } finally {
    if (shouldCloseDb) {
      try {
        await db.destroy();
      } catch (destroyErr: unknown) {
        console.error(
          "[serverless-fleet] Error closing database connection:",
          destroyErr,
        );
      }
    }
  }
}

/**
 * Universal AWS Lambda / Function URL / Cloud Function handler.
 *
 * Compatible with:
 * - AWS Lambda Direct Invocations
 * - AWS Lambda Function URLs & API Gateway Proxy
 * - GCP Cloud Functions HTTP / Eventarc
 * - Generic serverless runtimes
 */
export async function handler(
  event: unknown = {},
  _context?: unknown,
): Promise<LambdaResponse> {
  console.info("[serverless-fleet] Invoked with event:", JSON.stringify(event));

  try {
    const result = await runServerlessFleetCycle(event);
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[serverless-fleet] Execution error:", message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      }),
    };
  }
}

/**
 * Creates an HTTP request handler adapter (compatible with Express, Fastify, GCP HTTP Cloud Functions).
 */
export function createHttpHandler(options: ServerlessFleetOptions = {}) {
  return async (
    req: { body?: unknown },
    res: {
      status(code: number): {
        json(data: unknown): void;
        send(data: unknown): void;
      };
    },
  ): Promise<void> => {
    try {
      const result = await runServerlessFleetCycle(req.body ?? {}, options);
      res.status(200).json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      });
    }
  };
}

export default handler;
