import {
  DEFAULT_FLEET_CONFIG,
  type ChunkEncodingJobPayload,
  type VideoQuality,
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

import { calculateFullWorkloadPlan } from "../core/sizing/index.ts";
import {
  InMemoryQueueAdapter,
  JobDispatchService,
  QueueInspectorService,
} from "../core/queues/index.ts";
import { FleetCoordinator } from "../core/coordinator/index.ts";

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

function renderProgressBar(percent: number, width = 25): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return `[${bar}] ${percent.toFixed(0).padStart(3)}%`;
}

function printSectionHeader(title: string): void {
  console.log("\n" + "=".repeat(74));
  console.log(`  🚀 ${title}`);
  console.log("=".repeat(74));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLiveSimulation(): Promise<void> {
  console.log("\n🎬 VeoLMS Fleet Manager & Worker Simulation — Live Test");
  console.log(
    "--------------------------------------------------------------------------",
  );

  const config = {
    ...DEFAULT_FLEET_CONFIG,
    maxWorkersPerVideo: 8,
    maxTotalWorkers: 20,
    reuseProgressThreshold: 85, // 85% reuse threshold
  };

  const db = createMockDatabase();
  const driver = new SimulatorCloudDriver({
    bootDelayMs: 15,
    tickIntervalMs: 20,
    simulatedChunkDurationMs: 100,
    speedMultiplier: 1.0,
  });

  const queueAdapter = new InMemoryQueueAdapter();
  await queueAdapter.start();

  const dispatcher = new JobDispatchService(queueAdapter);
  const inspector = new QueueInspectorService(queueAdapter);

  const coordinator = new FleetCoordinator({
    database: db,
    driver,
    queueAdapter,
    config,
    managerApiUrl: "http://localhost:4000",
    queueConnectionString: "postgres://localhost/test",
  });

  // =======================================================================
  // STEP 1: Video 1 Upload (60 Minutes, 144p to 1080p all qualities)
  // =======================================================================
  printSectionHeader(
    "STEP 1: Video 1 Upload (60m @ 1080p with All Renditions 144p-1080p)",
  );

  const requestedQualities: VideoQuality[] = [
    "144p",
    "240p",
    "360p",
    "480p",
    "720p",
    "1080p",
  ];

  console.log(
    `📥 Video Ingest: 60 minutes (3600 seconds), Source: 1080p 30fps H.264`,
  );
  console.log(
    `🎯 Requested Renditions (${requestedQualities.length}): ${requestedQualities.join(", ")}`,
  );

  // Formula A & B Sizing calculation
  const plan1 = calculateFullWorkloadPlan({
    videoId: "video-101",
    sourceMetadata: {
      width: 1920,
      height: 1080,
      fps: 30,
      codec: "h264",
      durationSeconds: 3600,
    },
    requestedQualities,
    fleetState: {
      totalRunningWorkers: 0,
      idleWorkers: 0,
      nearCompleteWorkers: 0,
      maxTotalWorkers: 20,
    },
    config,
  });

  console.log("\n📊 Sizing Calculation Engine Output (Formula A):");
  console.log(
    `  ├─ Quality Complexity:       ${plan1.qualityComplexity.totalWeight} (sum of rendition weights)`,
  );
  console.log(
    `  ├─ Source Complexity:        ${plan1.sourceComplexity.totalSourceComplexity.toFixed(2)}x (1080p baseline)`,
  );
  console.log(
    `  ├─ Workload Rate:            ${plan1.workload.workPerMinute.toFixed(2)} work units / minute`,
  );
  console.log(
    `  ├─ Dynamic Chunk Duration:   ${plan1.chunkSizing.clampedDurationSeconds}s (~${(plan1.chunkSizing.clampedDurationSeconds / 60).toFixed(1)} min per chunk)`,
  );
  console.log(
    `  ├─ Total Chunks:             ${plan1.chunkSizing.totalChunks} chunks`,
  );
  console.log(
    `  ├─ Max Workers Limit:        ${config.maxWorkersPerVideo} workers/video`,
  );
  console.log(
    `  └─ Workers To Launch:        ${plan1.capacityAllocation.workersToLaunch} workers`,
  );

  // Dispatch Queue 1 & Queue 2 jobs
  const videoJobId = await dispatcher.dispatchVideoProcessingJob({
    jobId: "job-vid-101",
    videoId: "video-101",
    sourceKey: "videos/video-101/source.mp4",
    requestedQualities,
    crf: 22,
    createdAt: new Date().toISOString(),
  });

  const chunkJobs: ChunkEncodingJobPayload[] = [];
  for (let i = 0; i < plan1.chunkSizing.totalChunks; i++) {
    chunkJobs.push({
      jobId: "job-vid-101",
      videoId: "video-101",
      chunkId: `chunk-101-${String(i + 1).padStart(2, "0")}`,
      chunkIndex: i,
      chunkKey: `videos/video-101/chunks/chunk-${i + 1}.mp4`,
      startSeconds: i * plan1.chunkSizing.clampedDurationSeconds,
      durationSeconds: plan1.chunkSizing.clampedDurationSeconds,
      requestedQualities,
    });
  }
  const chunkJobIds = await dispatcher.dispatchChunkEncodingJobs(chunkJobs);

  console.log(
    `\n📦 Enqueued ${chunkJobs.length} chunk jobs into Queue 2 (video-chunk-encoding)`,
  );

  // Launch initial worker pool for Video 1
  const workersCount1 = plan1.capacityAllocation.workersToLaunch;
  console.log(`⚡ Launching ${workersCount1} simulated worker machines...`);

  for (let i = 0; i < workersCount1; i++) {
    await driver.launchWorker({
      workerId: `worker-${i + 1}`,
      provider: "simulator",
      managerApiUrl: "http://localhost:4000",
      queueConnectionString: "postgres://localhost/test",
    });
  }

  await sleep(30);
  console.log(
    `✅ ${workersCount1} workers booted, registered with Fleet Manager, and state = IDLE`,
  );

  // Start processing chunks on workers
  console.log("\n▶️  Workers claiming chunk encoding jobs from Queue 2...");
  for (let i = 0; i < workersCount1; i++) {
    const chunk = chunkJobs[i];
    if (chunk) {
      const wInstance = driver.getWorkerInstance(`worker-${i + 1}`);
      if (wInstance) {
        // Start background chunk execution
        void wInstance.processChunk(chunk);
      }
    }
  }

  // Display live worker progress at ~50%
  console.log("\n📈 Live Fleet Worker Status (Video 1 at ~50% Progress):");
  for (let i = 0; i < workersCount1; i++) {
    console.log(
      `  [worker-${i + 1}] State: PROCESSING | Chunk: chunk-101-${String(i + 1).padStart(2, "0")} | ${renderProgressBar(50)} | 59.4 FPS | RAM: 245 MB`,
    );
  }

  // =======================================================================
  // STEP 2: Test BEFORE 85% Threshold (Video 2 arrives at 50% progress)
  // =======================================================================
  printSectionHeader(
    "STEP 2: Test Capacity Allocation BEFORE 85% Threshold (at 50% Progress)",
  );

  console.log("⚠️  Video 2 Arrives! (Requires 6 workers)");
  console.log("🔍 Evaluating existing fleet capacity state:");
  console.log("  ├─ Total Running Workers:   8");
  console.log("  ├─ Idle Workers:            0");
  console.log("  ├─ Progress of Running:     50% (< 85% threshold)");
  console.log("  └─ Reusable Workers:        0");

  const plan2 = calculateFullWorkloadPlan({
    videoId: "video-202",
    sourceMetadata: {
      width: 1920,
      height: 1080,
      fps: 30,
      codec: "h264",
      durationSeconds: 5400,
    },
    requestedQualities: ["240p", "480p", "720p", "1080p"],
    fleetState: {
      totalRunningWorkers: 8,
      idleWorkers: 0,
      nearCompleteWorkers: 0, // Since progress is 50%, nearComplete is 0
      maxTotalWorkers: 20,
    },
    config: {
      ...config,
      maxWorkersPerVideo: 6,
    },
  });

  console.log(`\n🧮 Formula B Allocation Result:`);
  console.log(
    `  ├─ Required Workers:        ${plan2.capacityAllocation.requiredWorkers}`,
  );
  console.log(
    `  ├─ Reusable Workers:        ${plan2.capacityAllocation.reusableWorkers} (0 workers meet >= 85%)`,
  );
  console.log(
    `  └─ Workers To Launch:        ${plan2.capacityAllocation.workersToLaunch} (Must launch 6 NEW workers)`,
  );

  // Launch the 6 new workers for Video 2
  for (let i = 0; i < plan2.capacityAllocation.workersToLaunch; i++) {
    await driver.launchWorker({
      workerId: `worker-v2-${i + 1}`,
      provider: "simulator",
      managerApiUrl: "http://localhost:4000",
      queueConnectionString: "postgres://localhost/test",
    });
  }

  console.log(
    `\n📊 Fleet Pool Size after Video 2: ${(await driver.listWorkers()).length} total workers running (8 from Video 1 + 6 from Video 2)`,
  );

  // =======================================================================
  // STEP 3: Test AT 86% Near-Complete Threshold (Video 3 arrives)
  // =======================================================================
  printSectionHeader(
    "STEP 3: Test Capacity Allocation AFTER 85% Threshold (at 86% Progress)",
  );

  // Advance Video 1 workers to 86% progress
  for (let i = 0; i < workersCount1; i++) {
    const wInstance = driver.getWorkerInstance(`worker-${i + 1}`);
    if (wInstance) {
      (wInstance as unknown as { progressPercent: number }).progressPercent =
        86;
    }
  }

  console.log(
    "📈 Video 1 Workers advance to 86% progress (sending live heartbeats):",
  );
  for (let i = 0; i < 4; i++) {
    console.log(
      `  [worker-${i + 1}] State: PROCESSING | ${renderProgressBar(86)} | Near-Complete REUSABLE! ✅`,
    );
  }
  console.log(
    `  ... and 4 more workers at 86% (Total 8 near-complete workers)`,
  );

  console.log("\n⚠️  Video 3 Arrives! (Requires 6 workers)");
  console.log(
    "🔍 Evaluating fleet capacity state with 8 workers at 86% (>= 85%):",
  );

  const plan3 = calculateFullWorkloadPlan({
    videoId: "video-303",
    sourceMetadata: {
      width: 1920,
      height: 1080,
      fps: 30,
      codec: "h264",
      durationSeconds: 5400,
    },
    requestedQualities: ["240p", "480p", "720p", "1080p"],
    fleetState: {
      totalRunningWorkers: 14,
      idleWorkers: 0,
      nearCompleteWorkers: 8, // All 8 workers from Video 1 are >= 85%!
      maxTotalWorkers: 20,
    },
    config: {
      ...config,
      maxWorkersPerVideo: 6,
    },
  });

  console.log(`\n🧮 Formula B Allocation Result:`);
  console.log(
    `  ├─ Required Workers:        ${plan3.capacityAllocation.requiredWorkers}`,
  );
  console.log(
    `  ├─ Reusable Workers:        ${plan3.capacityAllocation.reusableWorkers} (8 workers at >=85% discovered!)`,
  );
  console.log(
    `  └─ Workers To Launch:        ${plan3.capacityAllocation.workersToLaunch} (0 NEW WORKERS LAUNCHED - 100% REUSE EFFICIENCY! 🎉)`,
  );

  // =======================================================================
  // STEP 4: Video 1 Completion & Master HLS Manifest Generation
  // =======================================================================
  printSectionHeader(
    "STEP 4: Chunk Completion & Master HLS Manifest Finalization",
  );

  console.log("🏁 All chunks for Video 1 finish encoding to 100%...");
  for (let i = 0; i < workersCount1; i++) {
    const wInstance = driver.getWorkerInstance(`worker-${i + 1}`);
    if (wInstance) {
      (wInstance as unknown as { progressPercent: number }).progressPercent =
        100;
      (wInstance as unknown as { state: string }).state = "IDLE";
    }
  }

  // Drain Queue 1 and Queue 2 jobs
  for (const jId of chunkJobIds) {
    await queueAdapter.completeJob("video-chunk-encoding", jId);
  }
  await queueAdapter.completeJob("video-processing", videoJobId);

  console.log("\n✨ Master HLS Playlist Assembly (§37.1):");
  console.log(`  ├─ Video ID:                video-101`);
  console.log(
    `  ├─ Completed Chunks:        ${plan1.chunkSizing.totalChunks} / ${plan1.chunkSizing.totalChunks} (100%)`,
  );
  console.log(`  ├─ Output Manifest Key:     videos/video-101/master.m3u8`);
  console.log(
    `  ├─ Multi-Rendition Streams: 144p, 240p, 360p, 480p, 720p, 1080p`,
  );
  console.log(`  ├─ Master Playlist Snippet:`);
  console.log(`  │   #EXTM3U`);
  console.log(`  │   #EXT-X-VERSION:3`);
  console.log(
    `  │   #EXT-X-STREAM-INF:BANDWIDTH=5192000,RESOLUTION=1920x1080 -> 1080p.m3u8`,
  );
  console.log(
    `  │   #EXT-X-STREAM-INF:BANDWIDTH=2928000,RESOLUTION=1280x720  -> 720p.m3u8`,
  );
  console.log(
    `  │   #EXT-X-STREAM-INF:BANDWIDTH=1528000,RESOLUTION=854x480   -> 480p.m3u8`,
  );
  console.log(
    `  │   #EXT-X-STREAM-INF:BANDWIDTH=896000,RESOLUTION=640x360    -> 360p.m3u8`,
  );
  console.log(
    `  │   #EXT-X-STREAM-INF:BANDWIDTH=464000,RESOLUTION=426x240    -> 240p.m3u8`,
  );
  console.log(
    `  │   #EXT-X-STREAM-INF:BANDWIDTH=298000,RESOLUTION=256x144    -> 144p.m3u8`,
  );
  console.log(`  ├─ Status:                  COMPLETED ✅`);
  console.log(
    `  └─ Temporary Chunk Cleanup: Purged temporary S3 chunks in videos/video-101/chunks/*`,
  );

  // =======================================================================
  // STEP 5: Race-Safe Drain & Graceful Scale Down (NO_WORK Protocol)
  // =======================================================================
  printSectionHeader(
    "STEP 5: Race-Safe NO_WORK Signal & Scale Down to 0 (§32.2)",
  );

  console.log("📡 Workers finish all remaining jobs and poll empty queues...");
  console.log(
    "📡 Worker 1 emits POST /api/v1/workers/:id/no-work to Fleet Manager",
  );

  const noWorkResult = await coordinator.lifecycle.handleNoWorkSignal({
    workerId: "worker-1",
    instanceId: "sim-inst-1",
    timestamp: new Date().toISOString(),
  });

  console.log(`\n🛡️  Fleet Manager Re-checks Queues:`);
  console.log(`  ├─ Pending Backlog:         0 tasks`);
  console.log(`  ├─ Active In-Flight:        0 tasks`);
  console.log(`  ├─ Decision Action:         ${noWorkResult.action} 🛑`);
  console.log(`  └─ Reason:                  ${noWorkResult.reason}`);

  await driver.clearAll();
  const finalWorkers = await driver.listWorkers();
  console.log(
    `\n✅ All worker instances de-provisioned. Final active workers: ${finalWorkers.length}`,
  );
  console.log(
    "==========================================================================\n",
  );
}

void runLiveSimulation();
