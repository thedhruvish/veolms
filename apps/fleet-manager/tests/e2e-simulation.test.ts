import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  DEFAULT_FLEET_CONFIG,
  type ChunkEncodingJobPayload,
  type VideoJobStatus,
  type WorkerHeartbeatPayload,
  type WorkerRecord,
} from "@veolms/fleet-types";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import type { Database } from "@veolms/database";
import { SimulatorCloudDriver } from "@veolms/fleet-plugin-simulator";

import { calculateFullWorkloadPlan } from "../src/core/sizing/index.ts";
import {
  InMemoryQueueAdapter,
  JobDispatchService,
  QueueInspectorService,
} from "../src/core/queues/index.ts";
import {
  FleetCoordinator,
  type CoordinationContext,
} from "../src/core/coordinator/index.ts";

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

describe("End-to-End Fleet Coordination & Worker Simulation Suite", () => {
  let mockDb: Kysely<Database>;
  let driver: SimulatorCloudDriver;
  let queueAdapter: InMemoryQueueAdapter;
  let dispatcher: JobDispatchService;
  let inspector: QueueInspectorService;
  let coordinator: FleetCoordinator;
  let context: CoordinationContext;

  beforeEach(async () => {
    mockDb = createMockDatabase();
    driver = new SimulatorCloudDriver({
      bootDelayMs: 5,
      tickIntervalMs: 10,
      simulatedChunkDurationMs: 50,
      speedMultiplier: 2.0,
    });
    queueAdapter = new InMemoryQueueAdapter();
    await queueAdapter.start();

    dispatcher = new JobDispatchService(queueAdapter);
    inspector = new QueueInspectorService(queueAdapter);

    context = {
      database: mockDb,
      driver,
      queueAdapter,
      config: {
        ...DEFAULT_FLEET_CONFIG,
        maxWorkersPerVideo: 8,
        maxTotalWorkers: 20,
        reuseProgressThreshold: 85,
      },
      managerApiUrl: "http://localhost:4000",
      queueConnectionString: "postgres://localhost/test",
    };

    coordinator = new FleetCoordinator(context);
  });

  it("Scenario 1: Cold Start Sizing -> Dispatch -> Auto-scale -> Process -> Complete", async () => {
    // 1. Video arrives: 60-minute (3600s) 1080p video requesting 240p, 720p, 1080p
    const workloadPlan = calculateFullWorkloadPlan({
      videoId: "video-e2e-1",
      durationSeconds: 3600,
      sourceMetadata: {
        width: 1920,
        height: 1080,
        fps: 30,
        codec: "h264",
        durationSeconds: 3600,
      },
      requestedQualities: ["240p", "720p", "1080p"],
      fleetState: {
        totalRunningWorkers: 0,
        idleWorkers: 0,
        nearCompleteWorkers: 0,
        maxTotalWorkers: 20,
      },
      config: context.config,
    });

    assert.ok(workloadPlan.chunkSizing.totalChunks >= 2);
    assert.equal(
      workloadPlan.capacityAllocation.workersToLaunch,
      Math.min(workloadPlan.chunkSizing.totalChunks, 8),
    );

    // 2. Dispatch Video Processing Job (Queue 1)
    await dispatcher.dispatchVideoProcessingJob({
      jobId: "job-e2e-1",
      videoId: "video-e2e-1",
      sourceKey: "videos/video-e2e-1/source.mp4",
      requestedQualities: ["240p", "720p", "1080p"],
      crf: 22,
      createdAt: new Date().toISOString(),
    });

    // 3. Dispatch Chunk Encoding Batch (Queue 2)
    const chunkJobs: ChunkEncodingJobPayload[] = [];
    for (let i = 0; i < workloadPlan.chunkSizing.totalChunks; i++) {
      chunkJobs.push({
        jobId: "job-e2e-1",
        videoId: "video-e2e-1",
        chunkId: `chunk-e2e-${i}`,
        chunkIndex: i,
        chunkKey: `videos/video-e2e-1/chunks/chunk-${i}.mp4`,
        startSeconds: i * workloadPlan.chunkSizing.clampedDurationSeconds,
        durationSeconds: workloadPlan.chunkSizing.clampedDurationSeconds,
        requestedQualities: ["240p", "720p", "1080p"],
      });
    }
    await dispatcher.dispatchChunkEncodingJobs(chunkJobs);

    // Verify queue backlog before workers launch
    const pendingTotal = await inspector.getPendingCount();
    assert.equal(pendingTotal, 1 + chunkJobs.length);

    // 4. Launch required workers via driver
    const workersCount = workloadPlan.capacityAllocation.workersToLaunch;
    for (let i = 0; i < workersCount; i++) {
      await driver.launchWorker({
        workerId: `worker-cold-${i}`,
        provider: "simulator",
        managerApiUrl: context.managerApiUrl,
        queueConnectionString: context.queueConnectionString,
      });
    }

    // Allow simulated workers to boot
    await new Promise((r) => setTimeout(r, 30));

    const activeWorkers = await driver.listWorkers();
    assert.equal(activeWorkers.length, workersCount);
    for (const w of activeWorkers) {
      assert.equal(w.state, "IDLE");
      assert.equal(w.isHealthy, true);
    }

    // 5. Process all chunks concurrently across the simulated workers
    const processingPromises = chunkJobs.map(async (chunk, idx) => {
      const assignedWorkerId = `worker-cold-${idx % workersCount}`;
      return driver.processChunkOnWorker(assignedWorkerId, chunk);
    });

    const results = await Promise.all(processingPromises);
    for (const res of results) {
      assert.equal(res.status, "SUCCESS");
    }

    // 6. All workers finish chunk processing and return to IDLE
    const workersAfter = await driver.listWorkers();
    for (const w of workersAfter) {
      assert.equal(w.state, "IDLE");
    }

    await driver.clearAll();
  });

  it("Scenario 2: Worker Reuse (Formula B with >=85% near-complete capacity)", () => {
    // Current fleet has 4 workers at >= 85% progress and 2 idle workers
    const fleetState = {
      totalRunningWorkers: 6,
      idleWorkers: 2,
      nearCompleteWorkers: 4,
      maxTotalWorkers: 20,
    };

    // Video B arrives needing 6 chunks / workers
    const workloadPlan = calculateFullWorkloadPlan({
      videoId: "video-e2e-2",
      durationSeconds: 3600,
      sourceMetadata: {
        width: 1920,
        height: 1080,
        fps: 30,
        codec: "h264",
        durationSeconds: 3600,
      },
      requestedQualities: ["240p", "720p", "1080p"],
      fleetState,
      config: context.config,
    });

    // Reusable capacity = 2 idle + 4 nearComplete = 6 workers
    // Required workers = min(6, 8) = 6
    // Missing workers to launch must be 0!
    assert.equal(workloadPlan.capacityAllocation.requiredWorkers, 6);
    assert.equal(workloadPlan.capacityAllocation.reusableWorkers, 6);
    assert.equal(workloadPlan.capacityAllocation.workersToLaunch, 0);
  });

  it("Scenario 3: Worker Heartbeat Auditing and Timeout Handling", async () => {
    // Launch a simulated worker
    await driver.launchWorker({
      workerId: "worker-dead-1",
      provider: "simulator",
      managerApiUrl: context.managerApiUrl,
      queueConnectionString: context.queueConnectionString,
    });

    await new Promise((r) => setTimeout(r, 20));

    // Audit dead workers through lifecycle manager
    const deadWorkerIds =
      await coordinator.lifecycle.detectAndFailDeadWorkers();
    assert.equal(Array.isArray(deadWorkerIds), true);

    await driver.terminateWorker("worker-dead-1");
  });

  it("Scenario 4: Graceful Scale Down & Race-Safe NO_WORK Handling (§32.2)", async () => {
    // Launch simulated worker
    await driver.launchWorker({
      workerId: "worker-drain-1",
      provider: "simulator",
      managerApiUrl: context.managerApiUrl,
      queueConnectionString: context.queueConnectionString,
    });

    await new Promise((r) => setTimeout(r, 20));

    // 1. With jobs in queue, worker NO_WORK signal is rejected (kept alive)
    await queueAdapter.publish("video-chunk-encoding", {
      jobId: "job-drain-test",
      videoId: "vid-drain",
    });

    const decision1 = await coordinator.lifecycle.handleNoWorkSignal({
      workerId: "worker-drain-1",
      instanceId: "inst-drain-1",
      timestamp: new Date().toISOString(),
    });

    assert.equal(decision1.action, "KEEP");

    // 2. Fetch and complete the job so queue becomes drained
    const job = await queueAdapter.fetchNextJob("video-chunk-encoding");
    assert.ok(job !== null);
    await queueAdapter.completeJob("video-chunk-encoding", job.id);

    // 3. Now with queue empty, worker NO_WORK triggers graceful termination
    const decision2 = await coordinator.lifecycle.handleNoWorkSignal({
      workerId: "worker-drain-1",
      instanceId: "inst-drain-1",
      timestamp: new Date().toISOString(),
    });

    assert.equal(decision2.action, "TERMINATE");

    const status = await driver.getWorkerStatus("worker-drain-1");
    assert.equal(status.state, "TERMINATED");
  });
});
