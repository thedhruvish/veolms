export interface AwsCloudDriverOptions {
  readonly region: string;
  readonly amiId?: string;
  readonly subnetId?: string;
  readonly securityGroupIds?: string[];
  readonly instanceType?: string;
  /**
   * List of allowed EC2 instance types for dynamic workload-based auto-scaling.
   * e.g. ['c6i.large', 'c6i.xlarge', 'c6i.2xlarge', 'g4dn.xlarge']
   */
  readonly allowedInstanceTypes?: readonly string[];
  readonly iamInstanceProfileArn?: string;
  readonly keyName?: string;
  readonly spotMaxPrice?: string;
  readonly useSpotInstances?: boolean;
  readonly tempS3Bucket: string;
  readonly prodS3Bucket: string;
  readonly fleetManagerApiUrl: string;
  readonly databaseUrl?: string;
  /**
   * Optional container image tag (e.g. 'ghcr.io/veolms/media-worker:latest').
   * If omitted, EC2 instances run the media worker as a native host Node.js process (Zero Docker overhead).
   */
  readonly workerContainerImage?: string;
  readonly forceSoftwareEncoder?: boolean;
}

export const DEFAULT_AWS_DRIVER_OPTIONS: Omit<
  AwsCloudDriverOptions,
  "region" | "tempS3Bucket" | "prodS3Bucket" | "fleetManagerApiUrl"
> = {
  instanceType: "c6i.xlarge",
  allowedInstanceTypes: [
    "c6i.large",
    "c6i.xlarge",
    "c6i.2xlarge",
    "g4dn.xlarge",
  ],
  useSpotInstances: true,
  forceSoftwareEncoder: false,
};
