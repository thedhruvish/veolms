import type {
  NoWorkSignalPayload,
  VideoQuality,
  WorkerHeartbeatPayload,
  WorkerRegistrationPayload,
  WorkerState,
} from "@veolms/fleet-types";

export interface RegisterWorkerResponse {
  readonly success: boolean;
  readonly worker?: {
    readonly id: string;
    readonly instanceId: string;
    readonly state: WorkerState;
  };
  readonly error?: string;
}

export interface HeartbeatResponse {
  readonly success: boolean;
  readonly error?: string;
}

export interface NoWorkResponse {
  readonly action: "KEEP" | "TERMINATE";
  readonly reason: string;
  readonly error?: string;
}

export interface CompleteChunkResponse {
  readonly success: boolean;
  readonly shouldFinalize?: boolean;
  readonly videoId?: string;
  readonly requestedQualities?: readonly VideoQuality[];
  readonly chunks?: readonly { id: string; chunk_index: number }[];
  readonly error?: string;
}

export interface FinalizeVideoResponse {
  readonly success: boolean;
  readonly error?: string;
}

export interface LiveProgressState {
  state: WorkerState;
  currentChunkId?: string;
  progressPercent: number;
  currentFps?: number;
  currentKbps?: number;
  speed?: string;
  estimatedTimeRemainingSeconds?: number;
}
