import type {
  NoWorkSignalPayload,
  WorkerHeartbeatPayload,
  WorkerRegistrationPayload,
} from "@veolms/fleet-types";

import type {
  HeartbeatResponse,
  NoWorkResponse,
  RegisterWorkerResponse,
} from "./types.ts";

/**
 * FleetApiClient: Communicates directly with the Fleet Manager Control Plane API.
 */
export class FleetApiClient {
  private readonly baseUrl: string;

  constructor(managerApiUrl: string) {
    this.baseUrl = managerApiUrl.replace(/\/+$/, "");
  }

  /**
   * Registers this worker instance with the Fleet Manager.
   */
  async register(
    payload: WorkerRegistrationPayload,
  ): Promise<RegisterWorkerResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/workers/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        return {
          success: false,
          error: `HTTP ${res.status}: ${res.statusText}`,
        };
      }

      return (await res.json()) as RegisterWorkerResponse;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Sends a real-time progress and telemetry heartbeat.
   */
  async sendHeartbeat(
    payload: WorkerHeartbeatPayload,
  ): Promise<HeartbeatResponse> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/workers/${payload.workerId}/heartbeat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        return {
          success: false,
          error: `HTTP ${res.status}: ${res.statusText}`,
        };
      }

      return (await res.json()) as HeartbeatResponse;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  /**
   * Emits a NO_WORK signal to the Fleet Manager when queue is empty.
   */
  async sendNoWorkSignal(
    payload: NoWorkSignalPayload,
  ): Promise<NoWorkResponse> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/workers/${payload.workerId}/no-work`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        return {
          action: "KEEP",
          reason: `HTTP ${res.status}: ${res.statusText}`,
          error: `HTTP ${res.status}`,
        };
      }

      return (await res.json()) as NoWorkResponse;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        action: "KEEP",
        reason: `Failed to contact manager: ${message}`,
        error: message,
      };
    }
  }

  /**
   * Fetches the next available chunk encoding job from the Fleet Manager.
   */
  async fetchNextJob<T extends object>(
    workerId: string,
  ): Promise<{ readonly id: string; readonly data: T } | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/workers/${workerId}/next-job`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );

      if (!res.ok) {
        return null;
      }

      const body = (await res.json()) as {
        job: { id: string; data: T } | null;
      };
      return body.job ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Reports chunk completion to the Fleet Manager.
   */
  async completeChunk(
    workerId: string,
    chunkId: string,
    outputKey?: string,
  ): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/api/v1/workers/${workerId}/complete-chunk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunkId, outputKey }),
      });
    } catch {
      // Ignore network errors
    }
  }

  /**
   * Reports chunk failure to the Fleet Manager.
   */
  async failChunk(
    workerId: string,
    chunkId: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/api/v1/workers/${workerId}/fail-chunk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunkId, error: errorMessage }),
      });
    } catch {
      // Ignore network errors
    }
  }
}
