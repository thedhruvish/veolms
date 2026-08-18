import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { createServer, type Server } from "node:http";

import {
  FleetApiClient,
  HeartbeatEmitter,
  callFleetManager,
  createFleetClient,
  sampleSystemMetrics,
} from "../src/client/index.ts";
import { loadWorkerConfig } from "../src/config/index.ts";

describe("Media Worker Fleet Client & Heartbeat Emitter", () => {
  let server: Server;
  let baseUrl: string;
  let lastHeartbeat: unknown = null;
  let lastNoWork: unknown = null;
  let lastRegistration: unknown = null;

  before(async () => {
    server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const raw = Buffer.concat(chunks).toString("utf-8");
      const body = raw ? JSON.parse(raw) : {};

      const path = req.url ?? "/";

      if (path === "/api/v1/workers/register") {
        lastRegistration = body;
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, worker: body }));
        return;
      }

      if (path.includes("/heartbeat")) {
        lastHeartbeat = body;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        return;
      }

      if (path.includes("/no-work")) {
        lastNoWork = body;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ action: "TERMINATE", reason: "Queue drained" }),
        );
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("should measure system CPU, memory, and uptime metrics", () => {
    const metrics = sampleSystemMetrics();
    assert.equal(typeof metrics.cpuPercent, "number");
    assert.ok(metrics.memoryRssMb > 0);
    assert.ok(metrics.uptimeSeconds >= 0);
  });

  it("should register worker with Fleet Manager API", async () => {
    const client = new FleetApiClient(baseUrl);
    const result = await client.register({
      workerId: "mw-worker-1",
      instanceId: "mw-inst-1",
      provider: "local_process",
      instanceType: "standard",
      startedAt: new Date().toISOString(),
    });

    assert.equal(result.success, true);
    assert.ok(lastRegistration !== null);
  });

  it("should emit progress heartbeat via HeartbeatEmitter", async () => {
    const config = loadWorkerConfig({
      WORKER_ID: "mw-worker-2",
      INSTANCE_ID: "mw-inst-2",
      MANAGER_API_URL: baseUrl,
      HEARTBEAT_INTERVAL_MS: "50",
    });

    const client = new FleetApiClient(baseUrl);
    const emitter = new HeartbeatEmitter(config, client);

    emitter.setState("PROCESSING", "chunk-99");
    emitter.updateProgress(75.5, {
      currentFps: 59.2,
      currentKbps: 2500,
      speed: "1.8x",
      etaSeconds: 15,
    });

    await emitter.emitPulse();

    assert.ok(lastHeartbeat !== null);
    const hb = lastHeartbeat as {
      workerId: string;
      progressPercent: number;
      fps: number;
    };
    assert.equal(hb.workerId, "mw-worker-2");
    assert.equal(hb.progressPercent, 75.5);
    assert.equal(hb.fps, 59.2);
  });

  it("should send NO_WORK signal to Fleet Manager API", async () => {
    const client = new FleetApiClient(baseUrl);
    const res = await client.sendNoWorkSignal({
      workerId: "mw-worker-3",
      instanceId: "mw-inst-3",
      timestamp: new Date().toISOString(),
    });

    assert.equal(res.action, "TERMINATE");
    assert.ok(lastNoWork !== null);
  });

  it("should support createFleetClient factory function", () => {
    const client = createFleetClient(baseUrl);
    assert.ok(client instanceof FleetApiClient);
  });

  it("should execute quick requests with callFleetManager utility", async () => {
    const res = await callFleetManager<{ action: string }>(
      "/api/v1/workers/mw-worker-4/no-work",
      {
        baseUrl,
        method: "POST",
        body: {
          instanceId: "mw-inst-4",
          timestamp: new Date().toISOString(),
        },
      },
    );

    assert.equal(res.success, true);
    assert.equal(res.status, 200);
    assert.equal(res.data?.action, "TERMINATE");
  });
});
