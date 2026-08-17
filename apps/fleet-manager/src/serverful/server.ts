import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type {
  NoWorkSignalPayload,
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
      sendJson(res, 500, {
        error: "Internal Server Error",
        message: errorMessage,
      });
    }
  });
}
