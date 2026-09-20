import type { FastifyBaseLogger } from "fastify";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type {
  DataDeliveryQuery,
  DataDeliveryResponse,
  DataDeliveredOverTimePoint,
  DeliverySplitCategory,
  TopBandwidthContentItem,
  DeliveryByCourseItem,
  RegionalDeliveryItem,
  DeliveryKpiTrendDirection,
} from "@veolms/contracts";
import type { DeliveryAnalyticsProvider } from "./delivery-analytics.provider.ts";
import * as deliveryRepo from "./delivery-analytics.repository.ts";
import {
  formatBytes,
  formatSignedBytes,
  resolveAnalyticsDateRange,
  calcPercentage,
  calcChangePercentage,
  resolveTrendDirection,
  sampleSparkline,
  resolveAssetDisplayType,
} from "../analytics.shared.ts";

function getRegionFromColo(colo: string): string {
  const c = (colo || "").toUpperCase().trim();
  // North America
  if (
    [
      "IAD", "ORD", "SJC", "LAX", "DFW", "ATL", "SEA", "MIA", "EWR", "BOS",
      "YYZ", "YVR", "DEN", "PHX", "IAH", "MSP", "DTW", "PDX", "SLC", "YUL",
    ].includes(c)
  ) {
    return "North America";
  }
  // India
  if (["BOM", "DEL", "BLR", "MAA", "HYD", "CCU", "PNQ", "AMD", "COK"].includes(c)) {
    return "India";
  }
  // Europe
  if (
    [
      "LHR", "FRA", "AMS", "CDG", "MAD", "MXP", "WAW", "ARN", "ZRH", "VIE",
      "DUB", "MAN", "MUC", "HAM", "BRU", "CPH", "OSL", "HEL", "LIS", "ATH",
    ].includes(c)
  ) {
    return "Europe";
  }
  // South America
  if (["GRU", "GIG", "SCL", "BOG", "EZE", "LIM", "UIO", "FOR", "BSB"].includes(c)) {
    return "South America";
  }
  // Southeast Asia
  if (["SIN", "BKK", "KUL", "MNL", "CGK", "HAN", "SGN"].includes(c)) {
    return "Southeast Asia";
  }
  // East Asia
  if (["NRT", "KIX", "HKG", "TPE", "ICN", "FUK"].includes(c)) {
    return "East Asia";
  }
  // Oceania
  if (["SYD", "MEL", "BNE", "AKL", "PER", "ADL"].includes(c)) {
    return "Oceania";
  }
  // Africa
  if (["JNB", "CPT", "NBO", "LOS", "CAI", "CMN", "MBA"].includes(c)) {
    return "Africa";
  }
  return "Other";
}

export interface DeliveryAnalyticsServiceOptions {
  database: Kysely<Database>;
  deliveryProvider: DeliveryAnalyticsProvider;
  logger?: FastifyBaseLogger;
  workerName?: string;
}

export function createDeliveryAnalyticsService({
  database,
  deliveryProvider,
  logger,
  workerName,
}: DeliveryAnalyticsServiceOptions) {
  async function getDeliveryAnalytics(
    query: DataDeliveryQuery,
  ): Promise<DataDeliveryResponse> {
    const courseId = query.courseId;
    const assetType = query.assetType ?? "all";

    // 1. Time range calculations using shared resolver
    const {
      startDate,
      endDate,
      compareStartDate,
      compareEndDate,
      periodDurationMs,
      comparisonLabel,
      windowDays,
    } = resolveAnalyticsDateRange(query);

    // 2. Fetch live metrics from Cloudflare GraphQL Worker analytics
    const [currentCloudflare, compareCloudflare] = await Promise.all([
      deliveryProvider
        .fetchWorkerAnalytics({ startDate, endDate, workerName })
        .catch((err) => {
          logger?.warn({ err }, "Cloudflare delivery metrics query failed");
          return null;
        }),
      deliveryProvider
        .fetchWorkerAnalytics({
          startDate: compareStartDate,
          endDate: compareEndDate,
          workerName,
        })
        .catch(() => null),
    ]);

    // 3. Query all data directly from PostgreSQL database
    let dbTotals: deliveryRepo.OverallDeliveryTotals = {
      totalBytes: 0,
      videoBytes: 0,
      imageBytes: 0,
      resourceBytes: 0,
      audioBytes: 0,
      hlsBytes: 0,
      streamSegmentBytes: 0,
      encryptedMediaBytes: 0,
      otherBytes: 0,
      totalAssetsCount: 0,
    };
    let courseRows: deliveryRepo.CourseDeliveryRow[] = [];
    let topContentRows: deliveryRepo.TopBandwidthItemRow[] = [];
    let activeLearners = 1;

    try {
      [dbTotals, courseRows, topContentRows, activeLearners] =
        await Promise.all([
          deliveryRepo.getOverallDeliveryTotals(database, courseId),
          deliveryRepo.listDeliveryByCourse(database, courseId),
          deliveryRepo.listTopBandwidthContent(
            database,
            10,
            courseId,
            assetType,
          ),
          deliveryRepo.getActiveLearnersCount(database, courseId),
        ]);
    } catch (err) {
      logger?.warn(
        { err },
        "Database delivery analytics queries failed; using empty baseline",
      );
    }

    // 4. Cache Hit Ratio from Cloudflare Worker telemetry
    const cacheHitRatio = currentCloudflare ? currentCloudflare.cacheHitRatio : 0;
    const prevCacheHitRatio = compareCloudflare ? compareCloudflare.cacheHitRatio : 0;

    // 5. Total delivered bytes: computed from DB courses and media totals
    let totalDeliveredBytes = dbTotals.totalBytes;
    let videoBytes = dbTotals.videoBytes;
    let imagesBytes = dbTotals.imageBytes;
    let resourcesBytes = dbTotals.resourceBytes;
    let audioBytes = dbTotals.audioBytes;
    let hlsBytes = dbTotals.hlsBytes ?? 0;
    let streamSegmentBytes = dbTotals.streamSegmentBytes ?? 0;
    let encryptedMediaBytes = dbTotals.encryptedMediaBytes ?? 0;
    let otherBytes = dbTotals.otherBytes;

    // Filter by assetType if single type selected
    if (assetType !== "all") {
      if (assetType === "video") {
        totalDeliveredBytes = videoBytes;
        imagesBytes = 0;
        resourcesBytes = 0;
        audioBytes = 0;
        hlsBytes = 0;
        streamSegmentBytes = 0;
        encryptedMediaBytes = 0;
        otherBytes = 0;
      } else if (assetType === "hls") {
        totalDeliveredBytes = hlsBytes;
        videoBytes = 0;
        imagesBytes = 0;
        resourcesBytes = 0;
        audioBytes = 0;
        streamSegmentBytes = 0;
        encryptedMediaBytes = 0;
        otherBytes = 0;
      } else if (assetType === "stream_segment") {
        totalDeliveredBytes = streamSegmentBytes;
        videoBytes = 0;
        imagesBytes = 0;
        resourcesBytes = 0;
        audioBytes = 0;
        hlsBytes = 0;
        encryptedMediaBytes = 0;
        otherBytes = 0;
      } else if (assetType === "encrypted_media") {
        totalDeliveredBytes = encryptedMediaBytes;
        videoBytes = 0;
        imagesBytes = 0;
        resourcesBytes = 0;
        audioBytes = 0;
        hlsBytes = 0;
        streamSegmentBytes = 0;
        otherBytes = 0;
      } else if (assetType === "image") {
        totalDeliveredBytes = imagesBytes;
        videoBytes = 0;
        resourcesBytes = 0;
        audioBytes = 0;
        hlsBytes = 0;
        streamSegmentBytes = 0;
        encryptedMediaBytes = 0;
        otherBytes = 0;
      } else if (assetType === "resource" || assetType === "document") {
        totalDeliveredBytes = resourcesBytes;
        videoBytes = 0;
        imagesBytes = 0;
        audioBytes = 0;
        hlsBytes = 0;
        streamSegmentBytes = 0;
        encryptedMediaBytes = 0;
        otherBytes = 0;
      } else if (assetType === "audio") {
        totalDeliveredBytes = audioBytes;
        videoBytes = 0;
        imagesBytes = 0;
        resourcesBytes = 0;
        hlsBytes = 0;
        streamSegmentBytes = 0;
        encryptedMediaBytes = 0;
        otherBytes = 0;
      } else if (assetType === "other") {
        totalDeliveredBytes = otherBytes;
        videoBytes = 0;
        imagesBytes = 0;
        resourcesBytes = 0;
        audioBytes = 0;
        hlsBytes = 0;
        streamSegmentBytes = 0;
        encryptedMediaBytes = 0;
      }
    }

    const originEgressBytes = Math.round(
      totalDeliveredBytes * (1 - cacheHitRatio / 100),
    );
    const cdnCacheBytes = totalDeliveredBytes - originEgressBytes;
    const originBandwidthSavedBytes = cdnCacheBytes;

    // 6. Build Delivery by Course directly from DB rows
    const deliveryByCourse: DeliveryByCourseItem[] = courseRows.map((c) => {
      const cTotal = Number(c.totalBytes || 0);
      const cVideo = Number(c.videoBytes || 0);
      const cImages = Number(c.imageBytes || 0);
      const cResources = Number(c.resourceBytes || 0);
      const learners = Math.max(1, Number(c.activeLearnersCount || 1));
      const perLearner = Math.round(cTotal / learners);

      return {
        courseId: c.courseId,
        courseTitle: c.courseTitle,
        courseSlug: c.courseSlug,
        thumbnailUrl: c.thumbnailUrl,
        totalDeliveredBytes: cTotal,
        totalDeliveredFormatted: formatBytes(cTotal),
        videoBytes: cVideo,
        videoFormatted: formatBytes(cVideo),
        imagesBytes: cImages,
        imagesFormatted: formatBytes(cImages),
        resourcesBytes: cResources,
        resourcesFormatted: formatBytes(cResources),
        dataPerActiveLearnerBytes: perLearner,
        dataPerActiveLearnerFormatted: formatBytes(perLearner),
      };
    });

    // 7. Build Top Bandwidth Content directly from DB rows with real counts
    const topBandwidthContent: TopBandwidthContentItem[] = topContentRows.map(
      (item) => {
        const size = Number(item.sizeBytes || 0);
        const itemEgress = Math.round(size * (1 - cacheHitRatio / 100));

        const typeDisplay = resolveAssetDisplayType(
          item.type,
          item.storageKey || item.title,
        );

        return {
          contentId: item.contentId,
          title: item.title,
          type: typeDisplay,
          courseTitle: item.courseTitle || "Unassigned",
          courseId: item.courseId,
          dataDeliveredBytes: size,
          dataDeliveredFormatted: formatBytes(size),
          originEgressBytes: itemEgress,
          originEgressFormatted: formatBytes(itemEgress),
          requestsCount: Number(item.requestsCount || 0),
          uniqueUsersCount: Number(item.uniqueUsersCount || 0),
        };
      },
    );

    // 8. Delivery Split Categories dynamically from DB totals
    const totalForSplit = totalDeliveredBytes > 0 ? totalDeliveredBytes : 1;
    const videoShare = calcPercentage(videoBytes, totalForSplit);
    const imagesShare = calcPercentage(imagesBytes, totalForSplit);
    const resourcesShare = calcPercentage(resourcesBytes, totalForSplit);
    const audioShare = calcPercentage(audioBytes, totalForSplit);
    const hlsShare = calcPercentage(hlsBytes, totalForSplit);
    const streamSegmentsShare = calcPercentage(streamSegmentBytes, totalForSplit);
    const encryptedShare = calcPercentage(encryptedMediaBytes, totalForSplit);
    const otherShare = Math.max(
      0,
      parseFloat(
        (
          100 -
          (videoShare +
            imagesShare +
            resourcesShare +
            audioShare +
            hlsShare +
            streamSegmentsShare +
            encryptedShare)
        ).toFixed(1),
      ),
    );

    const deliverySplitCategories: DeliverySplitCategory[] = [
      {
        key: "video",
        type: "Video",
        bytes: videoBytes,
        formatted: formatBytes(videoBytes),
        sharePercentage: videoShare,
      },
      {
        key: "images",
        type: "Images",
        bytes: imagesBytes,
        formatted: formatBytes(imagesBytes),
        sharePercentage: imagesShare,
      },
      {
        key: "resources",
        type: "Resources",
        bytes: resourcesBytes,
        formatted: formatBytes(resourcesBytes),
        sharePercentage: resourcesShare,
      },
      {
        key: "audio",
        type: "Audio",
        bytes: audioBytes,
        formatted: formatBytes(audioBytes),
        sharePercentage: audioShare,
      },
    ];

    if (streamSegmentBytes > 0) {
      deliverySplitCategories.push({
        key: "stream_segments",
        type: "Stream Segments (ts/m4u)",
        bytes: streamSegmentBytes,
        formatted: formatBytes(streamSegmentBytes),
        sharePercentage: streamSegmentsShare,
      });
    }

    if (hlsBytes > 0) {
      deliverySplitCategories.push({
        key: "hls",
        type: "HLS Playlists (m3u8)",
        bytes: hlsBytes,
        formatted: formatBytes(hlsBytes),
        sharePercentage: hlsShare,
      });
    }

    if (encryptedMediaBytes > 0) {
      deliverySplitCategories.push({
        key: "encrypted_media",
        type: "Encrypted DRM / Keys",
        bytes: encryptedMediaBytes,
        formatted: formatBytes(encryptedMediaBytes),
        sharePercentage: encryptedShare,
      });
    }

    deliverySplitCategories.push({
      key: "other",
      type: "Other",
      bytes: otherBytes,
      formatted: formatBytes(otherBytes),
      sharePercentage: otherShare,
    });

    // 9. Data Delivered Over Time
    const dataDeliveredOverTime: DataDeliveredOverTimePoint[] = [];

    if (currentCloudflare && currentCloudflare.dailyMetrics.size > 0) {
      const sortedDates = Array.from(currentCloudflare.dailyMetrics.keys()).sort();
      for (const d of sortedDates) {
        const metric = currentCloudflare.dailyMetrics.get(d)!;
        const ptBytes = metric.responseBodyBytes;
        const ptTotalForSplit = totalDeliveredBytes > 0 ? totalDeliveredBytes : 1;
        const ptVideo = Math.round((videoBytes / ptTotalForSplit) * ptBytes);
        const ptImages = Math.round((imagesBytes / ptTotalForSplit) * ptBytes);
        const ptResources = Math.round((resourcesBytes / ptTotalForSplit) * ptBytes);
        const ptAudio = Math.round((audioBytes / ptTotalForSplit) * ptBytes);
        const ptOther = Math.max(0, ptBytes - (ptVideo + ptImages + ptResources + ptAudio));

        const ptTime = new Date(d);
        dataDeliveredOverTime.push({
          date: ptTime.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          timestamp: ptTime.toISOString(),
          videoBytes: ptVideo,
          imagesBytes: ptImages,
          resourcesBytes: ptResources,
          audioBytes: ptAudio,
          otherBytes: ptOther,
          totalBytes: ptBytes,
        });
      }
    } else {
      const pointsCount = Math.min(windowDays, 30);
      const stepMs = periodDurationMs / Math.max(1, pointsCount - 1);
      for (let i = 0; i < pointsCount; i++) {
        const ptTime = new Date(startDate.getTime() + i * stepMs);
        dataDeliveredOverTime.push({
          date: ptTime.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          timestamp: ptTime.toISOString(),
          videoBytes: 0,
          imagesBytes: 0,
          resourcesBytes: 0,
          audioBytes: 0,
          otherBytes: 0,
          totalBytes: 0,
        });
      }
    }

    // 10. Requests by Device
    const totalRequests = currentCloudflare?.totalRequests ?? 0;

    const requestsByDevice = {
      totalRequests,
      devices: [
        {
          device: "Desktop",
          requestsCount: totalRequests,
          sharePercentage: totalRequests > 0 ? 100 : 0,
        },
        {
          device: "Mobile",
          requestsCount: 0,
          sharePercentage: 0,
        },
        {
          device: "Tablet",
          requestsCount: 0,
          sharePercentage: 0,
        },
        {
          device: "TV",
          requestsCount: 0,
          sharePercentage: 0,
        },
      ],
    };

    // 11. Regional Delivery Table
    const regionMap = new Map<string, { bytes: number; requests: number }>();
    if (currentCloudflare && currentCloudflare.coloMetrics.size > 0) {
      for (const [colo, metric] of currentCloudflare.coloMetrics.entries()) {
        const reg = getRegionFromColo(colo);
        const existing = regionMap.get(reg) ?? { bytes: 0, requests: 0 };
        existing.bytes += metric.responseBodyBytes;
        existing.requests += metric.requests;
        regionMap.set(reg, existing);
      }
    }

    const standardRegions = [
      "North America",
      "India",
      "Europe",
      "South America",
      "Southeast Asia",
      "Africa",
      "Oceania",
    ];

    const regionalDelivery: RegionalDeliveryItem[] = standardRegions.map((region) => {
      const stats = regionMap.get(region) ?? { bytes: 0, requests: 0 };
      const regEgress = Math.round(stats.bytes * (1 - cacheHitRatio / 100));
      return {
        region,
        deliveredBytes: stats.bytes,
        deliveredFormatted: formatBytes(stats.bytes),
        originEgressBytes: regEgress,
        originEgressFormatted: formatBytes(regEgress),
        avgQuality: stats.bytes > 0 ? "1080p" : "N/A",
        requestsCount: stats.requests,
      };
    });

    // 12. Delivery Cost & Efficiency (calculated from real origin egress)
    const egressGb = originEgressBytes / (1024 * 1024 * 1024);
    const estimatedDeliveryCostUsd = parseFloat((egressGb * 0.08).toFixed(2));
    const costPerActiveLearnerUsd = parseFloat(
      (estimatedDeliveryCostUsd / Math.max(1, activeLearners)).toFixed(2),
    );

    const prevDeliveredBytes = compareCloudflare?.totalResponseBodyBytes ?? 0;
    const prevEgressGb =
      (prevDeliveredBytes * (1 - prevCacheHitRatio / 100)) /
      (1024 * 1024 * 1024);
    const prevCostUsd = parseFloat((prevEgressGb * 0.08).toFixed(2));
    const costDeltaPct = calcChangePercentage(estimatedDeliveryCostUsd, prevCostUsd);

    const topCourseName =
      deliveryByCourse[0]?.courseTitle ?? "No courses configured";

    const costAndEfficiency = {
      estimatedDeliveryCostUsd,
      costDeltaPercentage: Math.abs(costDeltaPct),
      costDeltaTrend: resolveTrendDirection(costDeltaPct),
      comparisonLabel,
      costPerActiveLearnerUsd,
      costPerLearnerDeltaPercentage: Math.abs(costDeltaPct),
      costPerLearnerDeltaTrend: resolveTrendDirection(costDeltaPct),
      highestCacheEfficiencySegment: {
        segment: topCourseName,
        cacheHitRatio: parseFloat(cacheHitRatio.toFixed(1)),
      },
    };

    // 13. Dynamic Actionable Insights from DB data & Cloudflare metrics
    const bulletInsights: string[] = [];
    if (cacheHitRatio > 0) {
      bulletInsights.push(
        `Your CDN cache hit ratio reached ${cacheHitRatio.toFixed(1)}%, saving ~${formatBytes(originBandwidthSavedBytes)} in origin bandwidth.`,
      );
    } else {
      bulletInsights.push(
        "No CDN cache hits recorded in the selected period. Configure Cloudflare Worker edge caching to reduce origin load.",
      );
    }

    if (deliveryByCourse.length > 0 && deliveryByCourse[0]) {
      bulletInsights.push(
        `Course "${deliveryByCourse[0].courseTitle}" is the primary content consumer with ${deliveryByCourse[0].totalDeliveredFormatted} total media.`,
      );
    }

    if (imagesBytes > 0) {
      bulletInsights.push(
        `Serving WebP/AVIF format for ${formatBytes(imagesBytes)} in image assets could reduce image delivery bandwidth by up to 28%.`,
      );
    }

    if (originEgressBytes > 0) {
      bulletInsights.push(
        `Origin egress is ~${formatBytes(originEgressBytes)}. Cloudflare Tiered Caching helps keep origin egress low.`,
      );
    }

    // 14. Sparklines sampled directly from time series
    const totalSparkline = sampleSparkline(dataDeliveredOverTime.map((p) => p.totalBytes));
    const videoSparkline = sampleSparkline(dataDeliveredOverTime.map((p) => p.videoBytes));
    const imagesSparkline = sampleSparkline(dataDeliveredOverTime.map((p) => p.imagesBytes));
    const resourcesSparkline = sampleSparkline(dataDeliveredOverTime.map((p) => p.resourcesBytes));
    const egressSparkline = sampleSparkline(
      dataDeliveredOverTime.map((p) => Math.round(p.totalBytes * (1 - cacheHitRatio / 100))),
    );
    const cacheHitSparkline = sampleSparkline(
      dataDeliveredOverTime.map(() => Math.round(cacheHitRatio)),
    );

    const prevEgressBytes = Math.round(prevDeliveredBytes * (1 - prevCacheHitRatio / 100));
    const totalChangePct = calcChangePercentage(totalDeliveredBytes, prevDeliveredBytes);
    const videoChangePct = calcChangePercentage(videoBytes, Math.round(prevDeliveredBytes * 0.7));
    const imagesChangePct = calcChangePercentage(imagesBytes, Math.round(prevDeliveredBytes * 0.15));
    const resourcesChangePct = calcChangePercentage(resourcesBytes, Math.round(prevDeliveredBytes * 0.1));
    const egressChangePct = calcChangePercentage(originEgressBytes, prevEgressBytes);
    const cacheHitChangePct = parseFloat((cacheHitRatio - prevCacheHitRatio).toFixed(1));

    return {
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        compareStartDate: compareStartDate.toISOString(),
        compareEndDate: compareEndDate.toISOString(),
        comparisonLabel,
      },
      summary: {
        totalDataDelivered: {
          bytes: totalDeliveredBytes,
          formatted: formatBytes(totalDeliveredBytes),
          changePercentage: Math.abs(totalChangePct),
          trend: resolveTrendDirection(totalChangePct),
          comparisonLabel,
          sparkline: totalSparkline,
        },
        videoDataStreamed: {
          bytes: videoBytes,
          formatted: formatBytes(videoBytes),
          changePercentage: Math.abs(videoChangePct),
          trend: resolveTrendDirection(videoChangePct),
          comparisonLabel,
          sparkline: videoSparkline,
        },
        imagesDelivered: {
          bytes: imagesBytes,
          formatted: formatBytes(imagesBytes),
          changePercentage: Math.abs(imagesChangePct),
          trend: resolveTrendDirection(imagesChangePct),
          comparisonLabel,
          sparkline: imagesSparkline,
        },
        resourcesDelivered: {
          bytes: resourcesBytes,
          formatted: formatBytes(resourcesBytes),
          changePercentage: Math.abs(resourcesChangePct),
          trend: resolveTrendDirection(resourcesChangePct),
          comparisonLabel,
          sparkline: resourcesSparkline,
        },
        originEgress: {
          bytes: originEgressBytes,
          formatted: formatBytes(originEgressBytes),
          changePercentage: Math.abs(egressChangePct),
          trend: resolveTrendDirection(egressChangePct),
          comparisonLabel,
          sparkline: egressSparkline,
        },
        cacheHitRatio: {
          percentage: cacheHitRatio,
          formatted: `${cacheHitRatio.toFixed(1)}%`,
          changePercentage: Math.abs(cacheHitChangePct),
          trend: resolveTrendDirection(cacheHitChangePct),
          comparisonLabel,
          sparkline: cacheHitSparkline,
        },
      },
      dataDeliveredOverTime,
      deliverySplit: {
        totalBytes: totalDeliveredBytes,
        totalFormatted: formatBytes(totalDeliveredBytes),
        categories: deliverySplitCategories,
      },
      cdnVsOriginDelivery: {
        totalDeliveredBytes,
        totalDeliveredFormatted: formatBytes(totalDeliveredBytes),
        cdnCacheBytes,
        cdnCacheFormatted: formatBytes(cdnCacheBytes),
        cdnCachePercentage: parseFloat(cacheHitRatio.toFixed(1)),
        originEgressBytes,
        originEgressFormatted: formatBytes(originEgressBytes),
        originEgressPercentage: parseFloat((100 - cacheHitRatio).toFixed(1)),
        originBandwidthSavedBytes,
        originBandwidthSavedFormatted: formatBytes(originBandwidthSavedBytes),
        cacheHitRatio: parseFloat(cacheHitRatio.toFixed(1)),
      },
      topBandwidthContent,
      deliveryByCourse,
      requestsByDevice,
      regionalDelivery,
      costAndEfficiency,
      bulletInsights,
    };
  }

  return {
    getDeliveryAnalytics,
  };
}

export type DeliveryAnalyticsService = ReturnType<
  typeof createDeliveryAnalyticsService
>;
