import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type {
  ChunkEncodingJobPayload,
  NoWorkSignalPayload,
  VideoQuality,
  WorkerHeartbeatPayload,
  WorkerRegistrationPayload,
} from "@veolms/fleet-types";

import type { FleetCoordinator } from "../core/coordinator/coordinator.ts";

function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: unknown,
): void {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(json);
}

async function parseBody<T extends object>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw.trim()) {
    return {} as T;
  }
  return JSON.parse(raw) as T;
}

/**
 * Creates the HTTP server exposing control plane routes for worker registration,
 * heartbeats, and status queries.
 */
export function createWorkerApiServer(coordinator: FleetCoordinator): Server {
  return createServer(async (req, res) => {
    try {
      const method = req.method ?? "GET";
      const parsedUrl = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`,
      );
      const pathname = parsedUrl.pathname;

      if (method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        });
        res.end();
        return;
      }

      // Health Check
      if (method === "GET" && pathname === "/health") {
        sendJson(res, 200, {
          status: "ok",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Fleet Status Overview
      if (method === "GET" && pathname === "/api/v1/fleet/status") {
        const status = await coordinator.getFleetStatus();
        sendJson(res, 200, status);
        return;
      }

      // Fleet Infrastructure Details
      if (method === "GET" && pathname === "/api/v1/fleet/infra") {
        sendJson(res, 200, {
          provider: coordinator.context.driver.providerType,
          region: process.env.AWS_REGION || undefined,
          workerInstanceProfile: process.env.AWS_IAM_ROLE_ARN || undefined,
          workerRole: process.env.AWS_IAM_ROLE_ARN || undefined,
          securityGroupId: process.env.AWS_SECURITY_GROUP_ID || undefined,
          tempBucket: process.env.S3_TEMP_BUCKET || undefined,
          prodBucket: process.env.S3_PROD_BUCKET || undefined,
        });
        return;
      }

      // Manual Coordination Cycle Trigger
      if (method === "POST" && pathname === "/api/v1/fleet/cycle") {
        const result = await coordinator.runCoordinationCycle();
        sendJson(res, 200, result);
        return;
      }

      // Worker Registration
      if (method === "POST" && pathname === "/api/v1/workers/register") {
        const body = await parseBody<WorkerRegistrationPayload>(req);
        const record =
          await coordinator.lifecycle.handleWorkerRegistration(body);
        sendJson(res, 201, { success: true, worker: record });
        return;
      }

      // Worker Heartbeat: POST /api/v1/workers/:id/heartbeat
      const heartbeatMatch = pathname.match(
        /^\/api\/v1\/workers\/([^/]+)\/heartbeat$/,
      );
      if (method === "POST" && heartbeatMatch && heartbeatMatch[1]) {
        const workerId = heartbeatMatch[1];
        const body = await parseBody<WorkerHeartbeatPayload>(req);
        await coordinator.lifecycle.handleWorkerHeartbeat({
          ...body,
          workerId,
        });
        sendJson(res, 200, { success: true });
        return;
      }

      // Worker Fetch Next Chunk Job: POST /api/v1/workers/:id/next-job
      const nextJobMatch = pathname.match(
        /^\/api\/v1\/workers\/([^/]+)\/next-job$/,
      );
      if (method === "POST" && nextJobMatch && nextJobMatch[1]) {
        const workerId = nextJobMatch[1];
        let queueJob =
          await coordinator.context.queueAdapter.fetchNextJob<ChunkEncodingJobPayload>(
            "video-chunk-encoding",
          );

        // Fallback: Query Neon Postgres video_chunks directly if queue adapter has no item
        if (!queueJob) {
          try {
            const dbChunk = await coordinator.context.database
              .selectFrom("video_chunks")
              .innerJoin("video_jobs", "video_jobs.id", "video_chunks.video_id")
              .select([
                "video_chunks.id as chunkId",
                "video_chunks.video_id as videoId",
                "video_chunks.chunk_index as chunkIndex",
                "video_chunks.source_key as chunkKey",
                "video_chunks.start_seconds as startSeconds",
                "video_chunks.duration_seconds as durationSeconds",
                "video_jobs.requested_qualities as requestedQualities",
              ])
              .where("video_chunks.status", "=", "PENDING")
              .where("video_jobs.status", "in", ["PENDING", "ENCODING"])
              .orderBy("video_chunks.chunk_index", "asc")
              .limit(1)
              .executeTakeFirst();

            if (dbChunk) {
              const qualities: readonly VideoQuality[] =
                typeof dbChunk.requestedQualities === "string"
                  ? (JSON.parse(
                      dbChunk.requestedQualities,
                    ) as readonly VideoQuality[])
                  : (dbChunk.requestedQualities as readonly VideoQuality[]);

              queueJob = {
                id: dbChunk.chunkId,
                name: "video-chunk-encoding",
                state: "active",
                retryCount: 0,
                createdOn: new Date(),
                data: {
                  jobId: dbChunk.videoId,
                  videoId: dbChunk.videoId,
                  chunkId: dbChunk.chunkId,
                  chunkIndex: dbChunk.chunkIndex,
                  chunkKey: dbChunk.chunkKey,
                  startSeconds: Number(dbChunk.startSeconds),
                  durationSeconds: Number(dbChunk.durationSeconds),
                  requestedQualities: qualities,
                },
              };
            }
          } catch {
            // Ignore DB error
          }
        }

        if (queueJob) {
          // Update DB state
          try {
            await coordinator.context.database
              .updateTable("video_chunks")
              .set({
                worker_id: workerId,
                status: "PROCESSING",
                started_at: new Date(),
                updated_at: new Date(),
              })
              .where("id", "=", queueJob.data.chunkId)
              .execute();

            await coordinator.context.database
              .updateTable("workers")
              .set({
                state: "PROCESSING",
                current_job_id: queueJob.data.jobId,
                current_video_id: queueJob.data.videoId,
                current_chunk_id: queueJob.data.chunkId,
                progress_percent: 0,
                updated_at: new Date(),
              })
              .where("id", "=", workerId)
              .execute();
          } catch {
            // Ignore if DB update fails
          }

          sendJson(res, 200, { job: queueJob });
          return;
        }

        sendJson(res, 200, { job: null });
        return;
      }

      // Worker Complete Chunk: POST /api/v1/workers/:id/complete-chunk
      const completeChunkMatch = pathname.match(
        /^\/api\/v1\/workers\/([^/]+)\/complete-chunk$/,
      );
      if (method === "POST" && completeChunkMatch && completeChunkMatch[1]) {
        const workerId = completeChunkMatch[1];
        const body = await parseBody<{
          chunkId: string;
          outputKey?: string;
        }>(req);

        console.log(
          `[Fleet Control Plane] Received chunk completion from worker ${workerId} for chunk ${body.chunkId}`,
        );

        const isUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            body.chunkId,
          );
        let targetChunkId = body.chunkId;

        if (!isUuid && "getQueueList" in coordinator.context.queueAdapter) {
          const inMemAdapter = coordinator.context.queueAdapter as {
            getQueueList: (
              q: string,
            ) => Array<{ id: string; data?: { chunkId?: string } }>;
          };
          const list = inMemAdapter.getQueueList("video-chunk-encoding");
          const found = list.find((j) => j.id === body.chunkId);
          if (found?.data?.chunkId) {
            targetChunkId = found.data.chunkId;
          }
        }

        await coordinator.context.queueAdapter.completeJob(
          "video-chunk-encoding",
          body.chunkId,
        );

        try {
          const isTargetUuid =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              targetChunkId,
            );

          if (isTargetUuid) {
            await coordinator.context.database
              .updateTable("video_chunks")
              .set({
                status: "COMPLETED",
                output_key: body.outputKey ?? null,
                completed_at: new Date(),
                updated_at: new Date(),
              })
              .where("id", "=", targetChunkId)
              .execute();

            const chunkRow = await coordinator.context.database
              .selectFrom("video_chunks")
              .select("video_id")
              .where("id", "=", targetChunkId)
              .executeTakeFirst();

            let shouldFinalize = false;
            let finalizationPayload: {
              videoId: string;
              requestedQualities: readonly string[];
              chunks: readonly { id: string; chunk_index: number }[];
            } | null = null;

            if (chunkRow?.video_id) {
              const updatedJob = await coordinator.context.database
                .updateTable("video_jobs")
                .set((eb) => ({
                  completed_chunks: eb("completed_chunks", "+", 1),
                  status: "ENCODING",
                  updated_at: new Date(),
                }))
                .where("id", "=", chunkRow.video_id)
                .returning([
                  "id",
                  "chunk_count",
                  "completed_chunks",
                  "requested_qualities",
                ])
                .executeTakeFirst();

              // If all chunks completed, elect this worker to stitch master manifest
              if (
                updatedJob &&
                updatedJob.chunk_count > 0 &&
                updatedJob.completed_chunks >= updatedJob.chunk_count
              ) {
                const videoChunks = await coordinator.context.database
                  .selectFrom("video_chunks")
                  .select(["id", "chunk_index"])
                  .where("video_id", "=", updatedJob.id)
                  .orderBy("chunk_index", "asc")
                  .execute();

                await coordinator.context.database
                  .updateTable("video_jobs")
                  .set({ status: "FINALIZING", updated_at: new Date() })
                  .where("id", "=", updatedJob.id)
                  .execute();

                shouldFinalize = true;
                finalizationPayload = {
                  videoId: updatedJob.id,
                  requestedQualities:
                    (updatedJob.requested_qualities as unknown as string[]) || [
                      "1080p",
                      "720p",
                      "480p",
                    ],
                  chunks: videoChunks,
                };
              }
            }

            await coordinator.context.database
              .updateTable("workers")
              .set({
                state: "IDLE",
                current_chunk_id: null,
                progress_percent: 100,
                updated_at: new Date(),
              })
              .where("id", "=", workerId)
              .execute();

            sendJson(res, 200, {
              success: true,
              shouldFinalize,
              ...(finalizationPayload ?? {}),
            });
            return;
          }
        } catch (err: unknown) {
          console.error(
            `[Fleet Control Plane] DB error on completeChunk:`,
            err,
          );
        }

        sendJson(res, 200, { success: true, shouldFinalize: false });
        return;
      }

      // Worker Finalize Video: POST /api/v1/workers/:id/finalize-video
      const finalizeVideoMatch = pathname.match(
        /^\/api\/v1\/workers\/([^/]+)\/finalize-video$/,
      );
      if (method === "POST" && finalizeVideoMatch && finalizeVideoMatch[1]) {
        const workerId = finalizeVideoMatch[1];
        const body = await parseBody<{
          videoId: string;
          masterManifestKey?: string;
          error?: string;
        }>(req);

        console.log(
          `[Fleet Control Plane] Received video finalization from worker ${workerId} for video ${body.videoId} (master key: ${body.masterManifestKey ?? "default"})`,
        );

        if (body.error) {
          await coordinator.context.database
            .updateTable("video_jobs")
            .set({
              status: "FAILED",
              error: `Master manifest finalization failed: ${body.error}`,
              updated_at: new Date(),
            })
            .where("id", "=", body.videoId)
            .execute()
            .catch(() => {});
        } else {
          await coordinator.context.database
            .updateTable("video_jobs")
            .set({
              status: "COMPLETED",
              output_manifest_key:
                body.masterManifestKey || `videos/${body.videoId}/master.m3u8`,
              updated_at: new Date(),
            })
            .where("id", "=", body.videoId)
            .execute()
            .catch(() => {});
        }

        sendJson(res, 200, { success: true });
        return;
      }

      // Worker Fail Chunk: POST /api/v1/workers/:id/fail-chunk
      const failChunkMatch = pathname.match(
        /^\/api\/v1\/workers\/([^/]+)\/fail-chunk$/,
      );
      if (method === "POST" && failChunkMatch && failChunkMatch[1]) {
        const workerId = failChunkMatch[1];
        const body = await parseBody<{
          chunkId: string;
          error?: string;
        }>(req);

        let targetChunkId = body.chunkId;
        const isUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            body.chunkId,
          );

        if (!isUuid && "getQueueList" in coordinator.context.queueAdapter) {
          const inMemAdapter = coordinator.context.queueAdapter as {
            getQueueList: (
              q: string,
            ) => Array<{ id: string; data?: { chunkId?: string } }>;
          };
          const list = inMemAdapter.getQueueList("video-chunk-encoding");
          const found = list.find((j) => j.id === body.chunkId);
          if (found?.data?.chunkId) {
            targetChunkId = found.data.chunkId;
          }
        }

        await coordinator.context.queueAdapter.failJob(
          "video-chunk-encoding",
          body.chunkId,
          body.error ?? "Chunk transcoding failed",
        );

        try {
          const isTargetUuid =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              targetChunkId,
            );

          if (isTargetUuid) {
            const chunkRecord = await coordinator.context.database
              .selectFrom("video_chunks")
              .select(["id", "video_id", "retry_count", "chunk_index"])
              .where("id", "=", targetChunkId)
              .executeTakeFirst();

            const currentRetries = (chunkRecord?.retry_count ?? 0) + 1;
            const maxRetries = 3;

            if (currentRetries >= maxRetries) {
              // Dead-letter the chunk
              await coordinator.context.database
                .updateTable("video_chunks")
                .set({
                  status: "FAILED",
                  retry_count: currentRetries,
                  error:
                    body.error ??
                    `Transcoding failed after ${currentRetries} attempts`,
                  updated_at: new Date(),
                })
                .where("id", "=", targetChunkId)
                .execute();

              // Escalate video job to FAILED
              if (chunkRecord?.video_id) {
                await coordinator.context.database
                  .updateTable("video_jobs")
                  .set({
                    status: "FAILED",
                    error: `Video job failed due to chunk failure (Chunk index: ${chunkRecord.chunk_index}): ${body.error ?? "Max retries exceeded"}`,
                    updated_at: new Date(),
                  })
                  .where("id", "=", chunkRecord.video_id)
                  .execute();
              }
            } else {
              // Retry the chunk: reset to PENDING
              await coordinator.context.database
                .updateTable("video_chunks")
                .set({
                  status: "PENDING",
                  retry_count: currentRetries,
                  error:
                    body.error ??
                    `Attempt ${currentRetries} failed, retrying...`,
                  updated_at: new Date(),
                })
                .where("id", "=", targetChunkId)
                .execute();
            }
          }

          await coordinator.context.database
            .updateTable("workers")
            .set({
              state: "IDLE",
              current_chunk_id: null,
              updated_at: new Date(),
            })
            .where("id", "=", workerId)
            .execute();
        } catch {
          // Ignore
        }

        sendJson(res, 200, { success: true });
        return;
      }

      // Worker Spot Interruption Warning: POST /api/v1/workers/:id/interruption
      const interruptionMatch = pathname.match(
        /^\/api\/v1\/workers\/([^/]+)\/interruption$/,
      );
      if (method === "POST" && interruptionMatch && interruptionMatch[1]) {
        const workerId = interruptionMatch[1];
        const body = await parseBody<{ chunkId?: string }>(req);

        console.warn(
          `[Fleet Control Plane] Spot interruption warning received from worker ${workerId} (active chunk: ${body.chunkId ?? "none"})`,
        );

        if (body.chunkId) {
          await coordinator.context.database
            .updateTable("video_chunks")
            .set({
              status: "PENDING",
              error: "Worker interrupted by EC2 Spot reclaim, task preserved",
              updated_at: new Date(),
            })
            .where("id", "=", body.chunkId)
            .execute()
            .catch(() => {});
        }

        await coordinator.context.database
          .updateTable("workers")
          .set({
            state: "TERMINATED",
            current_chunk_id: null,
            updated_at: new Date(),
          })
          .where("id", "=", workerId)
          .execute()
          .catch(() => {});

        sendJson(res, 200, { success: true, action: "DRAINING" });
        return;
      }

      // Worker NO_WORK Signal: POST /api/v1/workers/:id/no-work
      const noWorkMatch = pathname.match(
        /^\/api\/v1\/workers\/([^/]+)\/no-work$/,
      );
      if (method === "POST" && noWorkMatch && noWorkMatch[1]) {
        const workerId = noWorkMatch[1];
        const body = await parseBody<NoWorkSignalPayload>(req);
        const decision = await coordinator.lifecycle.handleNoWorkSignal({
          ...body,
          workerId,
        });
        sendJson(res, 200, decision);
        return;
      }

      // 404 Not Found
      sendJson(res, 404, { error: "Route not found", path: pathname });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;
      const isDebug = process.env.DEBUG === "true";
      const reqMethod = (req.method || "GET").toUpperCase();
      const reqPath = req.url || "/";

      console.error(
        `[VeoLMS Server Error] ${reqMethod} ${reqPath}:`,
        errorMessage,
        "\nStack:",
        errorStack,
      );

      if (isDebug) {
        sendJson(res, 500, {
          error: "Internal Server Error",
          message: errorMessage,
          stack: errorStack,
          path: reqPath,
          method: reqMethod,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      sendJson(res, 500, {
        error: "Internal Server Error",
        message: "Internal Server Error",
        timestamp: new Date().toISOString(),
      });
    }
  });
}
