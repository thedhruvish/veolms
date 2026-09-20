import type { FastifyBaseLogger } from "fastify";
import { splitDateRange, executeCloudflareGraphQL } from "../analytics.shared.ts";

export interface DeliveryAnalyticsProviderOptions {
  apiToken?: string;
  accountId?: string;
  workerName?: string;
  endpoint?: string;
  logger?: FastifyBaseLogger;
}

export interface WorkerAnalyticsRawPoint {
  date: string;
  datetime: string;
  coloCode: string;
  status: string;
  cacheStatus: string;
  requests: number;
  subrequests: number;
  responseBodySize: number;
  errors: number;
}

export interface ColoDeliveryMetric {
  coloCode: string;
  requests: number;
  responseBodyBytes: number;
  subrequests: number;
}

export interface DailyDeliveryMetric {
  date: string;
  requests: number;
  responseBodyBytes: number;
  subrequests: number;
}

export interface CloudflareDeliveryResult {
  workerName: string;
  totalRequests: number;
  totalSubrequests: number;
  totalResponseBodyBytes: number;
  totalErrors: number;
  cacheHitRatio: number;
  rawPoints: WorkerAnalyticsRawPoint[];
  coloMetrics: Map<string, ColoDeliveryMetric>;
  dailyMetrics: Map<string, DailyDeliveryMetric>;
}

const WORKER_INVOCATIONS_QUERY_WITH_SCRIPT = `
query WorkerDeliveryMetricsWithScript(
  $accountTag: string!
  $since: Time!
  $until: Time!
  $scriptName: string!
) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(
        limit: 10000
        filter: {
          datetime_geq: $since
          datetime_leq: $until
          scriptName: $scriptName
        }
        orderBy: [datetime_ASC]
      ) {
        sum {
          requests
          subrequests
          responseBodySize
          errors
        }
        dimensions {
          date
          datetime
          scriptName
          status
          cacheStatus
          coloCode
        }
      }
    }
  }
}
`;

const WORKER_INVOCATIONS_QUERY_ALL = `
query WorkerDeliveryMetricsAll(
  $accountTag: string!
  $since: Time!
  $until: Time!
) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(
        limit: 10000
        filter: {
          datetime_geq: $since
          datetime_leq: $until
        }
        orderBy: [datetime_ASC]
      ) {
        sum {
          requests
          subrequests
          responseBodySize
          errors
        }
        dimensions {
          date
          datetime
          scriptName
          status
          cacheStatus
          coloCode
        }
      }
    }
  }
}
`;

export interface DeliveryAnalyticsProvider {
  fetchWorkerAnalytics(options: {
    startDate: Date;
    endDate: Date;
    workerName?: string;
  }): Promise<CloudflareDeliveryResult | null>;
}

export function createDeliveryAnalyticsProvider({
  apiToken,
  accountId,
  workerName: defaultWorkerName,
  endpoint = "https://api.cloudflare.com/client/v4/graphql",
  logger,
}: DeliveryAnalyticsProviderOptions): DeliveryAnalyticsProvider {
  async function fetchWorkerChunk({
    start,
    end,
    targetWorker,
  }: {
    start: Date;
    end: Date;
    targetWorker?: string;
  }): Promise<WorkerAnalyticsRawPoint[]> {
    if (!apiToken || !accountId) {
      return [];
    }

    const hasWorker = Boolean(targetWorker && targetWorker.trim().length > 0);
    const query = hasWorker
      ? WORKER_INVOCATIONS_QUERY_WITH_SCRIPT
      : WORKER_INVOCATIONS_QUERY_ALL;
    const variables: Record<string, unknown> = {
      accountTag: accountId,
      since: start.toISOString(),
      until: end.toISOString(),
    };
    if (hasWorker) {
      variables.scriptName = targetWorker;
    }

    type WorkersInvocationsResponse = {
      viewer?: {
        accounts?: Array<{
          workersInvocationsAdaptive?: Array<{
            sum?: {
              requests?: number;
              subrequests?: number;
              responseBodySize?: number;
              errors?: number;
            };
            dimensions?: {
              date?: string;
              datetime?: string;
              scriptName?: string;
              status?: string;
              cacheStatus?: string;
              coloCode?: string;
            };
          }>;
        }>;
      };
    };

    const data = await executeCloudflareGraphQL<WorkersInvocationsResponse>({
      endpoint,
      apiToken,
      query,
      variables,
      logger,
      operationName: "WorkerDeliveryMetrics",
    });

    if (!data) {
      return [];
    }

    const rows = data.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? [];
    return rows.map((r) => ({
      date: r.dimensions?.date ?? "",
      datetime: r.dimensions?.datetime ?? "",
      coloCode: r.dimensions?.coloCode ?? "",
      status: r.dimensions?.status ?? "",
      cacheStatus: r.dimensions?.cacheStatus ?? "unknown",
      requests: r.sum?.requests ?? 0,
      subrequests: r.sum?.subrequests ?? 0,
      responseBodySize: r.sum?.responseBodySize ?? 0,
      errors: r.sum?.errors ?? 0,
    }));
  }

  async function fetchWorkerAnalytics({
    startDate,
    endDate,
    workerName: overrideWorker,
  }: {
    startDate: Date;
    endDate: Date;
    workerName?: string;
  }): Promise<CloudflareDeliveryResult | null> {
    const worker = overrideWorker || defaultWorkerName;

    if (!apiToken || !accountId) {
      logger?.debug(
        "Cloudflare Worker analytics skipped: missing credentials",
      );
      return null;
    }

    try {
      const chunks = splitDateRange(startDate, endDate, 30);
      const chunkPromises = chunks.map((chunk) =>
        fetchWorkerChunk({
          start: chunk.start,
          end: chunk.end,
          targetWorker: worker,
        }),
      );

      const chunkResults = await Promise.all(chunkPromises);
      const rawPoints: WorkerAnalyticsRawPoint[] = chunkResults.flat();

      let totalRequests = 0;
      let totalSubrequests = 0;
      let totalResponseBodyBytes = 0;
      let totalErrors = 0;

      const coloMetrics = new Map<string, ColoDeliveryMetric>();
      const dailyMetrics = new Map<string, DailyDeliveryMetric>();

      for (const point of rawPoints) {
        totalRequests += point.requests;
        totalSubrequests += point.subrequests;
        totalResponseBodyBytes += point.responseBodySize;
        totalErrors += point.errors;

        if (point.coloCode) {
          const existingColo = coloMetrics.get(point.coloCode) ?? {
            coloCode: point.coloCode,
            requests: 0,
            responseBodyBytes: 0,
            subrequests: 0,
          };
          existingColo.requests += point.requests;
          existingColo.responseBodyBytes += point.responseBodySize;
          existingColo.subrequests += point.subrequests;
          coloMetrics.set(point.coloCode, existingColo);
        }

        if (point.date) {
          const existingDaily = dailyMetrics.get(point.date) ?? {
            date: point.date,
            requests: 0,
            responseBodyBytes: 0,
            subrequests: 0,
          };
          existingDaily.requests += point.requests;
          existingDaily.responseBodyBytes += point.responseBodySize;
          existingDaily.subrequests += point.subrequests;
          dailyMetrics.set(point.date, existingDaily);
        }
      }

      const cacheHitRatio =
        totalRequests > 0
          ? Math.min(
              100,
              Math.max(
                0,
                ((totalRequests - totalSubrequests) / totalRequests) * 100,
              ),
            )
          : 0;

      return {
        workerName: worker ?? "all",
        totalRequests,
        totalSubrequests,
        totalResponseBodyBytes,
        totalErrors,
        cacheHitRatio,
        rawPoints,
        coloMetrics,
        dailyMetrics,
      };
    } catch (err) {
      logger?.error(
        { err },
        "Failed to execute Cloudflare Worker Analytics query",
      );
      return null;
    }
  }

  return {
    fetchWorkerAnalytics,
  };
}
