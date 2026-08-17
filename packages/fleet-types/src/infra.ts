/**
 * Infrastructure Provisioning, Teardown, and Lifecycle interfaces for VeoLMS Fleet Providers.
 */

export type InfraAction = "setup" | "destroy" | "reinstall" | "status";

export interface InfraProvisionOptions {
  readonly action?: InfraAction;
  readonly region?: string;
  readonly tempStoragePath?: string;
  readonly prodStoragePath?: string;
  readonly tempBucketName?: string;
  readonly prodBucketName?: string;
  readonly databaseUrl?: string;
  readonly runnerMode?: string;
  readonly isInteractive?: boolean;
  readonly force?: boolean;
  readonly [key: string]: unknown;
}

export interface InfraProvisionResult {
  readonly provider: string;
  readonly action: InfraAction;
  readonly success: boolean;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly outputs?: Readonly<Record<string, string>>;
  readonly instructions?: readonly string[];
}

export interface FleetInfraManager {
  readonly name: string;
  readonly provider: string;
  provision(options: InfraProvisionOptions): Promise<InfraProvisionResult>;
}
