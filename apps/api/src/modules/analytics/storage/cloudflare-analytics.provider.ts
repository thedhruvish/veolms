import type { FastifyBaseLogger } from "fastify";
import { executeCloudflareGraphQL } from "../analytics.shared.ts";

export interface CloudflareAnalyticsProviderOptions {
  apiToken?: string;
  accountId?: string;
  bucketName?: string;
  endpoint?: string;
  logger?: FastifyBaseLogger;
}

export interface R2StorageTimeSeriesPoint {
  datetime: string;
  objectCount: number;
  uploadCount: number;
  payloadSizeBytes: number;
  metadataSizeBytes: number;
}

export interface CloudflareR2StorageResult {
  bucketName: string;
  currentPayloadSizeBytes: number;
  currentObjectCount: number;
  timeSeries: R2StorageTimeSeriesPoint[];
}

const R2_STORAGE_QUERY = `
query R2StorageMetrics(
  $accountTag: string!
  $startDate: Time!
  $endDate: Time!
  $bucketName: string!
) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      r2StorageAdaptiveGroups(
        limit: 10000
        filter: {
          datetime_geq: $startDate
          datetime_leq: $endDate
          bucketName: $bucketName
        }
        orderBy: [datetime_ASC]
      ) {
        max {
          objectCount
          uploadCount
          payloadSize
          metadataSize
        }
        dimensions {
          datetime
        }
      }
    }
  }
}
`;

export interface CloudflareAnalyticsProvider {
  fetchR2Storage(options: {
    startDate: Date;
    endDate: Date;
    bucketName?: string;
  }): Promise<CloudflareR2StorageResult | null>;
}

export function createCloudflareAnalyticsProvider({
  apiToken,
  accountId,
  bucketName: defaultBucketName,
  endpoint = "https://api.cloudflare.com/client/v4/graphql",
  logger,
}: CloudflareAnalyticsProviderOptions): CloudflareAnalyticsProvider {
  async function fetchR2Storage({
    startDate,
    endDate,
    bucketName: overrideBucket,
  }: {
    startDate: Date;
    endDate: Date;
    bucketName?: string;
  }): Promise<CloudflareR2StorageResult | null> {
    const bucket = overrideBucket || defaultBucketName;

    if (!apiToken || !accountId || !bucket) {
      logger?.debug(
        "Cloudflare analytics skipped: missing CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, or bucket name",
      );
      return null;
    }

    type R2StorageResponse = {
      viewer?: {
        accounts?: Array<{
          r2StorageAdaptiveGroups?: Array<{
            max?: {
              objectCount?: number;
              uploadCount?: number;
              payloadSize?: number;
              metadataSize?: number;
            };
            dimensions?: {
              datetime?: string;
            };
          }>;
        }>;
      };
    };

    const data = await executeCloudflareGraphQL<R2StorageResponse>({
      endpoint,
      apiToken,
      query: R2_STORAGE_QUERY,
      variables: {
        accountTag: accountId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        bucketName: bucket,
      },
      logger,
      operationName: "R2StorageMetrics",
    });

    if (!data) {
      return null;
    }

    const groups = data.viewer?.accounts?.[0]?.r2StorageAdaptiveGroups ?? [];
    const timeSeries: R2StorageTimeSeriesPoint[] = groups.map((group) => ({
      datetime: group.dimensions?.datetime ?? "",
      objectCount: group.max?.objectCount ?? 0,
      uploadCount: group.max?.uploadCount ?? 0,
      payloadSizeBytes: group.max?.payloadSize ?? 0,
      metadataSizeBytes: group.max?.metadataSize ?? 0,
    }));

    const latest = timeSeries[timeSeries.length - 1];
    const currentPayloadSizeBytes = latest ? latest.payloadSizeBytes : 0;
    const currentObjectCount = latest ? latest.objectCount : 0;

    return {
      bucketName: bucket,
      currentPayloadSizeBytes,
      currentObjectCount,
      timeSeries,
    };
  }

  return {
    fetchR2Storage,
  };
}
