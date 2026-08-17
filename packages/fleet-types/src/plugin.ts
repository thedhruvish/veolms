import type {
  InfraProvisionOptions,
  InfraProvisionResult,
} from "./infra.ts";

export interface PluginEnvVarDefinition {
  readonly key: string;
  readonly description: string;
  readonly defaultValue?: string;
  readonly required?: boolean;
}

export interface FleetPluginManifest {
  readonly name: string;
  readonly packageName: string;
  readonly provider: string;
  readonly description: string;
  readonly defaultRunnerMode: string;
  readonly supportedRunnerModes: readonly string[];
  readonly getEnvTemplate: (options: {
    runnerMode?: string;
    databaseUrl?: string;
    storagePath?: string;
    fleetManagerUrl?: string;
    isHardwareAccelerated?: boolean;
  }) => Record<string, string>;
  readonly envVars: readonly PluginEnvVarDefinition[];
  /**
   * Optional automated infrastructure provisioner for the plugin
   * (e.g. S3 buckets, IAM, security groups, local folders, container verification).
   */
  readonly provisionInfra?: (
    options: InfraProvisionOptions,
  ) => Promise<InfraProvisionResult>;
}
