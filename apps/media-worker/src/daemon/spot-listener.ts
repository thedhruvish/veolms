import type { FleetApiClient } from "../client/fleet-client.ts";

export interface SpotListenerOptions {
  readonly workerId: string;
  readonly client: FleetApiClient;
  readonly getCurrentChunkId?: () => string | null | undefined;
  readonly onInterruptionDetected?: () => Promise<void>;
  readonly pollIntervalMs?: number;
  readonly imdsEndpoint?: string;
}

/**
 * SpotInterruptionListener: Polls the AWS EC2 Instance Metadata Service (IMDSv2)
 * for Spot interruption notices (2-minute warning) and triggers task preservation
 * and graceful worker drain before instance termination.
 */
export class SpotInterruptionListener {
  private readonly workerId: string;
  private readonly client: FleetApiClient;
  private readonly getCurrentChunkId?: () => string | null | undefined;
  private readonly onInterruptionDetected?: () => Promise<void>;
  private readonly pollIntervalMs: number;
  private readonly imdsEndpoint: string;
  private timer?: NodeJS.Timeout;
  private isInterrupted = false;

  constructor(options: SpotListenerOptions) {
    this.workerId = options.workerId;
    this.client = options.client;
    this.getCurrentChunkId = options.getCurrentChunkId;
    this.onInterruptionDetected = options.onInterruptionDetected;
    this.pollIntervalMs = options.pollIntervalMs ?? 5000;
    this.imdsEndpoint =
      options.imdsEndpoint ||
      process.env.AWS_IMDS_ENDPOINT ||
      "http://169.254.169.254";
  }

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.checkInterruption();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async checkInterruption(): Promise<boolean> {
    if (this.isInterrupted) {
      return true;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      // Check Spot instance termination action notice
      const response = await fetch(
        `${this.imdsEndpoint}/latest/meta-data/spot/instance-action`,
        {
          headers: { "X-aws-ec2-metadata-token-ttl-seconds": "21600" },
          signal: controller.signal,
        },
      ).catch(() => null);

      clearTimeout(timeoutId);

      if (response && response.status === 200) {
        this.isInterrupted = true;
        const chunkId = this.getCurrentChunkId?.() ?? undefined;
        console.warn(
          `[SpotInterruption] AWS Spot interruption warning detected for worker ${this.workerId}! Preserving task and draining worker...`,
        );

        await this.client.notifySpotInterruption(this.workerId, chunkId);
        if (this.onInterruptionDetected) {
          await this.onInterruptionDetected();
        }
        return true;
      }
    } catch {
      // Non-AWS environment or IMDS unavailable
    }
    return false;
  }
}
