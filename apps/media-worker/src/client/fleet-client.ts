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
}
