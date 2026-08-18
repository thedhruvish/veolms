import type {
  NoWorkSignalPayload,
  WorkerHeartbeatPayload,
  WorkerRegistrationPayload,
} from "@veolms/fleet-types";

import type {
  CompleteChunkResponse,
  FinalizeVideoResponse,
  HeartbeatResponse,
  NoWorkResponse,
  RegisterWorkerResponse,
} from "./types.ts";

export interface CallFleetManagerOptions {
  readonly baseUrl?: string;
  readonly method?: "GET" | "POST" | "PUT" | "DELETE";
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  readonly apiKey?: string;
}

export interface CallFleetManagerResult<T = unknown> {
  readonly success: boolean;
  readonly status?: number;
  readonly data?: T;
  readonly error?: string;
}

/**
 * High-level utility function to quickly call any endpoint on the Fleet Manager Control Plane.
 *
 * @example
 * ```ts
 * const status = await callFleetManager("/api/v1/fleet/status");
 * const res = await callFleetManager("/api/v1/fleet/cycle", { method: "POST" });
 * ```
 */
export async function callFleetManager<T = unknown>(
  path: string,
  options: CallFleetManagerOptions = {},
): Promise<CallFleetManagerResult<T>> {
  const baseUrl = (
    options.baseUrl ||
    process.env.MANAGER_API_URL ||
    "http://localhost:4000"
  ).replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${baseUrl}${cleanPath}`;

  const apiKey = options.apiKey || process.env.FLEET_API_KEY;
  const authHeaders: Record<string, string> = {};
  if (apiKey) {
    authHeaders["Authorization"] = `Bearer ${apiKey}`;
    authHeaders["x-api-key"] = apiKey;
  }

  try {
    const res = await fetch(url, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(options.headers ?? {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const isJson = res.headers
      .get("content-type")
      ?.includes("application/json");
    const data = isJson ? ((await res.json()) as T) : undefined;

    if (!res.ok) {
      return {
        success: false,
        status: res.status,
        error: `HTTP ${res.status}: ${res.statusText}`,
        data,
      };
    }

    return {
      success: true,
      status: res.status,
      data,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * FleetApiClient: Communicates directly with the Fleet Manager Control Plane API using callFleetManager.
 */
export class FleetApiClient {
  readonly baseUrl: string;
  readonly apiKey?: string;

  constructor(managerApiUrl: string, apiKey?: string) {
    this.baseUrl = managerApiUrl.replace(/\/+$/, "");
    this.apiKey = apiKey || process.env.FLEET_API_KEY;
  }

  /**
   * Registers this worker instance with the Fleet Manager.
   */
  async register(
    payload: WorkerRegistrationPayload,
  ): Promise<RegisterWorkerResponse> {
    const res = await callFleetManager<RegisterWorkerResponse>(
      "/api/v1/workers/register",
      {
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        method: "POST",
        body: payload,
      },
    );
    if (!res.success) {
      return { success: false, error: res.error };
    }
    return res.data ?? { success: true };
  }

  /**
   * Sends a real-time progress and telemetry heartbeat.
   */
  async sendHeartbeat(
    payload: WorkerHeartbeatPayload,
  ): Promise<HeartbeatResponse> {
    const res = await callFleetManager<HeartbeatResponse>(
      `/api/v1/workers/${payload.workerId}/heartbeat`,
      {
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        method: "POST",
        body: payload,
      },
    );
    if (!res.success) {
      return { success: false, error: res.error };
    }
    return res.data ?? { success: true };
  }

  /**
   * Emits a NO_WORK signal to the Fleet Manager when queue is empty.
   */
  async sendNoWorkSignal(
    payload: NoWorkSignalPayload,
  ): Promise<NoWorkResponse> {
    const res = await callFleetManager<NoWorkResponse>(
      `/api/v1/workers/${payload.workerId}/no-work`,
      {
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        method: "POST",
        body: payload,
      },
    );
    if (!res.success || !res.data) {
      return {
        action: "KEEP",
        reason: res.error ?? "Failed to contact manager",
        error: res.error,
      };
    }
    return res.data;
  }

  /**
   * Fetches the next available chunk encoding job from the Fleet Manager.
   */
  async fetchNextJob<T extends object>(
    workerId: string,
  ): Promise<{ readonly id: string; readonly data: T } | null> {
    const res = await callFleetManager<{ job: { id: string; data: T } | null }>(
      `/api/v1/workers/${workerId}/next-job`,
      {
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        method: "POST",
      },
    );
    return res.data?.job ?? null;
  }

  /**
   * Reports chunk completion to the Fleet Manager.
   * Returns whether this worker is elected to finalize master.m3u8 for the video.
   */
  async completeChunk(
    workerId: string,
    chunkId: string,
    outputKey?: string,
  ): Promise<CompleteChunkResponse> {
    const res = await callFleetManager<CompleteChunkResponse>(
      `/api/v1/workers/${workerId}/complete-chunk`,
      {
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        method: "POST",
        body: { chunkId, outputKey },
      },
    );
    if (!res.success) {
      return { success: false, error: res.error };
    }
    return res.data ?? { success: true };
  }

  /**
   * Reports final master.m3u8 manifest completion to the Fleet Manager.
   */
  async finalizeVideo(
    workerId: string,
    videoId: string,
    masterManifestKey?: string,
    error?: string,
  ): Promise<FinalizeVideoResponse> {
    const res = await callFleetManager<FinalizeVideoResponse>(
      `/api/v1/workers/${workerId}/finalize-video`,
      {
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        method: "POST",
        body: { videoId, masterManifestKey, error },
      },
    );
    if (!res.success) {
      return { success: false, error: res.error };
    }
    return res.data ?? { success: true };
  }

  /**
   * Reports chunk failure to the Fleet Manager.
   */
  async failChunk(
    workerId: string,
    chunkId: string,
    errorMessage: string,
  ): Promise<void> {
    await callFleetManager(`/api/v1/workers/${workerId}/fail-chunk`, {
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      method: "POST",
      body: { chunkId, error: errorMessage },
    });
  }

  /**
   * Reports an impending Spot interruption warning to the Fleet Manager.
   */
  async notifySpotInterruption(
    workerId: string,
    chunkId?: string,
  ): Promise<void> {
    await callFleetManager(`/api/v1/workers/${workerId}/interruption`, {
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      method: "POST",
      body: {
        workerId,
        chunkId,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * Creates or gets a configured FleetApiClient instance.
 */
export function createFleetClient(
  managerApiUrl: string = process.env.MANAGER_API_URL ||
    "http://localhost:4000",
  apiKey?: string,
): FleetApiClient {
  return new FleetApiClient(managerApiUrl, apiKey);
}
