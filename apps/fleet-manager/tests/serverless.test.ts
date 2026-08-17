import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { DEFAULT_FLEET_CONFIG } from "@veolms/fleet-types";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import type { Database } from "@veolms/database";
import { SimulatorCloudDriver } from "@veolms/fleet-plugin-simulator";

import { FleetCoordinator } from "../src/core/coordinator/index.ts";
import { InMemoryQueueAdapter } from "../src/core/queues/index.ts";
import { createLambdaHandler } from "../src/serverless/index.ts";
import type { APIGatewayProxyResultV2Like } from "../src/serverless/types.ts";

function createMockDatabase(): Kysely<Database> {
  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

describe("Serverless Control Plane Adapter (Lambda)", () => {
  let driver: SimulatorCloudDriver;
  let queueAdapter: InMemoryQueueAdapter;
  let coordinator: FleetCoordinator;
  let handler: ReturnType<typeof createLambdaHandler>;

  beforeEach(async () => {
    const mockDb = createMockDatabase();
    driver = new SimulatorCloudDriver({ bootDelayMs: 10 });
    queueAdapter = new InMemoryQueueAdapter();
    await queueAdapter.start();

    coordinator = new FleetCoordinator({
      database: mockDb,
      driver,
      queueAdapter,
      config: DEFAULT_FLEET_CONFIG,
      managerApiUrl: "https://lambda.example.com",
      queueConnectionString: "postgres://localhost/test",
    });

    handler = createLambdaHandler(coordinator);
  });

  it("should handle API Gateway GET /health event", async () => {
    const event = {
      rawPath: "/health",
      requestContext: {
        http: {
          method: "GET",
          path: "/health",
        },
      },
    };

    const res = (await handler(event)) as APIGatewayProxyResultV2Like;
    assert.equal(res.statusCode, 200);

    const body = JSON.parse(res.body ?? "{}") as { status: string };
    assert.equal(body.status, "ok");
  });

  it("should handle API Gateway GET /api/v1/fleet/status event", async () => {
    const event = {
      rawPath: "/api/v1/fleet/status",
      requestContext: {
        http: {
          method: "GET",
          path: "/api/v1/fleet/status",
        },
      },
    };

    const res = (await handler(event)) as APIGatewayProxyResultV2Like;
    assert.equal(res.statusCode, 200);

    const body = JSON.parse(res.body ?? "{}") as { isDrained: boolean };
    assert.equal(body.isDrained, true);
  });

  it("should handle API Gateway POST /api/v1/workers/:id/heartbeat event", async () => {
    const event = {
      rawPath: "/api/v1/workers/worker-lambda-1/heartbeat",
      requestContext: {
        http: {
          method: "POST",
          path: "/api/v1/workers/worker-lambda-1/heartbeat",
        },
      },
      body: JSON.stringify({
        instanceId: "inst-lambda-1",
        state: "PROCESSING",
        progressPercent: 45,
        timestamp: new Date().toISOString(),
      }),
    };

    const res = (await handler(event)) as APIGatewayProxyResultV2Like;
    assert.equal(res.statusCode, 200);

    const body = JSON.parse(res.body ?? "{}") as { success: boolean };
    assert.equal(body.success, true);
  });

  it("should handle EventBridge scheduled event trigger", async () => {
    const event = {
      source: "aws.events",
      "detail-type": "Scheduled Event",
      time: new Date().toISOString(),
    };

    const res = (await handler(event)) as {
      success: boolean;
      source: string;
      result: { workersLaunched: number };
    };

    assert.equal(res.success, true);
    assert.equal(res.source, "EventBridge");
    assert.equal(res.result.workersLaunched, 0);
  });

  it("should handle SQS event batch trigger", async () => {
    const event = {
      Records: [
        {
          messageId: "sqs-msg-1",
          body: JSON.stringify({ videoId: "vid-sqs-1" }),
        },
      ],
    };

    const res = (await handler(event)) as {
      success: boolean;
      source: string;
      recordsProcessed: number;
    };

    assert.equal(res.success, true);
    assert.equal(res.source, "SQS");
    assert.equal(res.recordsProcessed, 1);
  });

  it("should return 404 for unknown HTTP routes", async () => {
    const event = {
      rawPath: "/unknown-endpoint",
      requestContext: {
        http: {
          method: "GET",
          path: "/unknown-endpoint",
        },
      },
    };

    const res = (await handler(event)) as APIGatewayProxyResultV2Like;
    assert.equal(res.statusCode, 404);
  });
});
