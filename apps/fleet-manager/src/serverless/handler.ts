import type {
  NoWorkSignalPayload,
  WorkerHeartbeatPayload,
  WorkerRegistrationPayload,
} from "@veolms/fleet-types";

import { FleetCoordinator } from "../core/coordinator/coordinator.ts";
import type { CoordinationContext } from "../core/coordinator/types.ts";
import type {
  APIGatewayProxyEventV2Like,
  APIGatewayProxyResultV2Like,
  EventBridgeScheduledEventLike,
  LambdaContextLike,
  SQSEventLike,
} from "./types.ts";

function jsonResponse(
  statusCode: number,
  data: unknown,
): APIGatewayProxyResultV2Like {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(data),
  };
}

function parseJsonBody<T extends object>(rawBody?: string | null): T {
  if (!rawBody || !rawBody.trim()) {
    return {} as T;
  }
  return JSON.parse(rawBody) as T;
}

/**
 * Creates a universal AWS Lambda / serverless function handler supporting:
 * 1. API Gateway HTTP requests from workers (register, heartbeat, no-work, status).
 * 2. EventBridge scheduled cron triggers for periodic coordination cycles.
 * 3. SQS event batch triggers on video processing queue events.
 */
export function createLambdaHandler(
  contextOrCoordinator: CoordinationContext | FleetCoordinator,
): (
  event: unknown,
  lambdaContext?: LambdaContextLike,
) => Promise<APIGatewayProxyResultV2Like | unknown> {
  const coordinator =
    "runCoordinationCycle" in contextOrCoordinator
      ? contextOrCoordinator
      : new FleetCoordinator(contextOrCoordinator);

  return async (
    event: unknown,
    _lambdaContext?: LambdaContextLike,
  ): Promise<APIGatewayProxyResultV2Like | unknown> => {
    if (!event || typeof event !== "object") {
      return jsonResponse(400, { error: "Invalid event payload" });
    }

    const eventObj = event as Record<string, unknown>;

    // Case 1: EventBridge Scheduled Event (Periodic fleet reconciliation cron)
    if (
      eventObj.source === "aws.events" ||
      eventObj["detail-type"] === "Scheduled Event"
    ) {
      const result = await coordinator.runCoordinationCycle();
      return {
        success: true,
        source: "EventBridge",
        result,
      };
    }

    // Case 2: SQS Event (Incoming job notification)
    if (Array.isArray(eventObj.Records) && eventObj.Records.length > 0) {
      const sqsEvent = event as SQSEventLike;
      // Execute coordination cycle in response to queue events
      const result = await coordinator.runCoordinationCycle();
      return {
        success: true,
        source: "SQS",
        recordsProcessed: sqsEvent.Records.length,
        result,
      };
    }

    // Case 3: API Gateway HTTP Event
    const httpEvent = event as APIGatewayProxyEventV2Like;
    const method = (
      httpEvent.requestContext?.http?.method ||
      httpEvent.httpMethod ||
      "GET"
    ).toUpperCase();
    const pathname =
      httpEvent.requestContext?.http?.path ||
      httpEvent.rawPath ||
      httpEvent.path ||
      "/";

    try {
      if (method === "GET" && pathname === "/health") {
        return jsonResponse(200, {
          status: "ok",
          timestamp: new Date().toISOString(),
        });
      }

      if (method === "GET" && pathname === "/api/v1/fleet/status") {
        const status = await coordinator.getFleetStatus();
        return jsonResponse(200, status);
      }

      if (method === "GET" && pathname === "/api/v1/fleet/infra") {
        return jsonResponse(200, {
          provider: coordinator.context.driver.providerType,
          region: process.env.AWS_REGION || undefined,
          workerInstanceProfile: process.env.AWS_IAM_ROLE_ARN || undefined,
          workerRole: process.env.AWS_IAM_ROLE_ARN || undefined,
          securityGroupId: process.env.AWS_SECURITY_GROUP_ID || undefined,
          tempBucket: process.env.S3_TEMP_BUCKET || undefined,
          prodBucket: process.env.S3_PROD_BUCKET || undefined,
        });
      }

      if (method === "POST" && pathname === "/api/v1/fleet/cycle") {
        const result = await coordinator.runCoordinationCycle();
        return jsonResponse(200, result);
      }

      if (method === "POST" && pathname === "/api/v1/workers/register") {
        const body = parseJsonBody<WorkerRegistrationPayload>(httpEvent.body);
        const record =
          await coordinator.lifecycle.handleWorkerRegistration(body);
        return jsonResponse(201, { success: true, worker: record });
      }

      // Heartbeat: POST /api/v1/workers/:id/heartbeat
      const hbMatch = pathname.match(
        /^\/api\/v1\/workers\/([^/]+)\/heartbeat$/,
      );
      if (method === "POST" && hbMatch && hbMatch[1]) {
        const workerId = hbMatch[1];
        const body = parseJsonBody<WorkerHeartbeatPayload>(httpEvent.body);
        await coordinator.lifecycle.handleWorkerHeartbeat({
          ...body,
          workerId,
        });
        return jsonResponse(200, { success: true });
      }

      // NO_WORK: POST /api/v1/workers/:id/no-work
      const nwMatch = pathname.match(/^\/api\/v1\/workers\/([^/]+)\/no-work$/);
      if (method === "POST" && nwMatch && nwMatch[1]) {
        const workerId = nwMatch[1];
        const body = parseJsonBody<NoWorkSignalPayload>(httpEvent.body);
        const decision = await coordinator.lifecycle.handleNoWorkSignal({
          ...body,
          workerId,
        });
        return jsonResponse(200, decision);
      }

      return jsonResponse(404, {
        error: "Route not found",
        method,
        path: pathname,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;
      const isDebug = process.env.DEBUG === "true";

      console.error(
        `[VeoLMS Lambda Error] ${method} ${pathname}:`,
        errorMessage,
        "\nStack:",
        errorStack,
      );

      if (isDebug) {
        return jsonResponse(500, {
          error: "Internal Server Error",
          message: errorMessage,
          stack: errorStack,
          path: pathname,
          method,
          timestamp: new Date().toISOString(),
        });
      }

      return jsonResponse(500, {
        error: "Internal Server Error",
        message: "Internal Server Error",
        timestamp: new Date().toISOString(),
      });
    }
  };
}
