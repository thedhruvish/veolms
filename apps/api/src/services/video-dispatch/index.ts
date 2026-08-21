import { PutEventsCommand } from "@aws-sdk/client-eventbridge";
import type { FastifyBaseLogger } from "fastify";

import { getBoss } from "../../lib/pg-boss.ts";
import { getEventBridgeClient } from "../../lib/eventbridge.ts";
import { config } from "../../config.ts";

export interface VideoJobDispatchPayload {
  jobId: string;
  videoId: string;
  inputPath: string;
  quality: number[];
}

export interface VideoDispatchService {
  dispatch(payload: VideoJobDispatchPayload): Promise<void>;
}

export interface VideoDispatchEventBridgeOptions {
  /** EventBridge bus name. If undefined, AWS SDK defaults to the default event bus. */
  busName: string | undefined;
  eventSource: string;
  detailType: string;
}

export interface VideoDispatchOptions {
  eventBridge: VideoDispatchEventBridgeOptions;
  logger: FastifyBaseLogger;
}

/**
 * Builds the service responsible for dispatching video transcode jobs:
 * - Queues the job to pg-boss.
 * - Triggers Lambda via EventBridge.
 */
export function createVideoDispatchService(
  options: VideoDispatchOptions,
): VideoDispatchService {
  async function dispatchToQueue(
    payload: VideoJobDispatchPayload,
  ): Promise<void> {
    const boss = await getBoss();
    await boss.send("video-processing", payload, {
      retryLimit: config.PG_BOSS_RETRY_LIMIT,
      retryDelay: config.PG_BOSS_RETRY_DELAY,
      retryBackoff: config.PG_BOSS_RETRY_BACKOFF,
      expireInSeconds: config.PG_BOSS_JOB_EXPIRE,
    });
  }

  async function dispatchToLambda(
    payload: VideoJobDispatchPayload,
  ): Promise<void> {
    const client = getEventBridgeClient();
    const response = await client.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: options.eventBridge.eventSource,
            DetailType: options.eventBridge.detailType,
            ...(options.eventBridge.busName
              ? { EventBusName: options.eventBridge.busName }
              : {}),
            Detail: JSON.stringify(payload),
          },
        ],
      }),
    );

    if (response?.FailedEntryCount && response.FailedEntryCount > 0) {
      const failedEntry = response.Entries?.find((entry) => entry.ErrorCode);
      throw new Error(
        `EventBridge rejected the transcode event: ${failedEntry?.ErrorCode ?? "unknown"} — ${failedEntry?.ErrorMessage ?? "no message"}`,
      );
    }
  }

  async function dispatch(payload: VideoJobDispatchPayload): Promise<void> {
    options.logger.info(
      { jobId: payload.jobId, videoId: payload.videoId },
      "Dispatching video transcode job",
    );

    // 1. Send to pg-boss queue
    try {
      await dispatchToQueue(payload);
      options.logger.info(
        { jobId: payload.jobId },
        "Successfully sent video processing job to pg-boss queue",
      );
    } catch (queueErr) {
      options.logger.error(
        { err: queueErr, jobId: payload.jobId },
        "Failed to send video processing job to pg-boss queue",
      );
    }

    // 2. Trigger Lambda via EventBridge
    try {
      await dispatchToLambda(payload);
      options.logger.info(
        { jobId: payload.jobId },
        "Successfully triggered video processing Lambda via EventBridge",
      );
    } catch (lambdaErr) {
      options.logger.error(
        { err: lambdaErr, jobId: payload.jobId },
        "Failed to trigger video processing Lambda via EventBridge",
      );
      throw lambdaErr;
    }
  }

  return { dispatch };
}
