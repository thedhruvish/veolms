import type {
  NoWorkSignalPayload,
  WorkerHeartbeatPayload,
  WorkerRegistrationPayload,
  WorkerState,
} from "@veolms/fleet-types";

/**
 * Configuration options for the virtual fleet worker simulator.
 */
export interface SimulatorDriverOptions {
  /**
   * Simulated delay before a newly provisioned worker boots and registers (in ms).
   * Default: 50ms (for fast tests)
   */
  readonly bootDelayMs?: number;

  /**
   * Interval between simulated progress ticks/heartbeats (in ms).
   * Default: 25ms
   */
  readonly tickIntervalMs?: number;

  /**
   * Total simulated duration required to process an encoding chunk (in ms).
   * Default: 200ms
   */
  readonly simulatedChunkDurationMs?: number;

  /**
   * Multiplier to speed up or slow down virtual time.
   * Default: 1.0
   */
  readonly speedMultiplier?: number;

  /**
   * Simulated probability of failure during encoding (0.0 to 1.0).
   * Default: 0.0
   */
  readonly failureRate?: number;

  /**
   * Event hook invoked when a simulated worker boots and registers.
   */
  readonly onWorkerRegister?: (
    payload: WorkerRegistrationPayload,
  ) => void | Promise<void>;

  /**
   * Event hook invoked when a simulated worker emits a progress heartbeat.
   */
  readonly onWorkerHeartbeat?: (
    payload: WorkerHeartbeatPayload,
  ) => void | Promise<void>;

  /**
   * Event hook invoked when a simulated worker signals NO_WORK.
   */
  readonly onWorkerNoWork?: (
    payload: NoWorkSignalPayload,
  ) => void | Promise<void>;

  /**
   * Event hook invoked when a simulated worker transitions state.
   */
  readonly onStateChange?: (
    workerId: string,
    fromState: WorkerState,
    toState: WorkerState,
  ) => void;
}

export const DEFAULT_SIMULATOR_OPTIONS: Required<
  Omit<
    SimulatorDriverOptions,
    | "onWorkerRegister"
    | "onWorkerHeartbeat"
    | "onWorkerNoWork"
    | "onStateChange"
  >
> = {
  bootDelayMs: 50,
  tickIntervalMs: 25,
  simulatedChunkDurationMs: 200,
  speedMultiplier: 1.0,
  failureRate: 0.0,
};
