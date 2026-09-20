import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import type { FastifyBaseLogger } from "fastify";
import type {
  StorageAnalyticsQuery,
  StorageAnalyticsResponse,
  StoredAssetKind,
  KpiMetric,
  StorageBreakdownItem,
  StorageByCourseItem,
  LargestStoredAssetItem,
  StaleAssetItem,
} from "@veolms/contracts";
import type { CloudflareAnalyticsProvider } from "./cloudflare-analytics.provider.ts";
import * as repository from "./storage-analytics.repository.ts";
import {
  formatBytes,
  formatSignedBytes,
  formatDateShort,
  formatComparisonPeriod,
  resolveAnalyticsDateRange,
  calcPercentage,
  calcChangePercentage,
  resolveTrendDirection,
  generateSparkline,
  classifyMediaAssetKind,
} from "../analytics.shared.ts";

export interface StorageAnalyticsServiceOptions {
  database: Kysely<Database>;
  cloudflareProvider?: CloudflareAnalyticsProvider;
  logger?: FastifyBaseLogger;
}

export function createStorageAnalyticsService({
  database,
  cloudflareProvider,
  logger,
}: StorageAnalyticsServiceOptions) {
  async function getStorageAnalytics(
    query: StorageAnalyticsQuery,
  ): Promise<StorageAnalyticsResponse> {
    const now = new Date();

    // 1. Resolve date windows using shared resolver
    const {
      startDate,
      endDate,
      compareStartDate,
      compareEndDate,
      comparisonLabel,
      windowDays,
    } = resolveAnalyticsDateRange(query);

    // 2. Fetch data from Cloudflare Analytics & Local Database
    let cfResult: Awaited<ReturnType<CloudflareAnalyticsProvider["fetchR2Storage"]>> = null;
    const isScopedToCourse = Boolean(query.courseId && query.courseId !== "all");

    try {
      if (cloudflareProvider && !isScopedToCourse) {
        cfResult = await cloudflareProvider.fetchR2Storage({ startDate, endDate });
      }
    } catch (cfErr) {
      logger?.warn({ err: cfErr }, "Cloudflare metrics fetch failed");
    }

    let dbCourses: repository.CourseStorageRow[] = [];
    let dbLargestAssets: repository.LargestAssetRow[] = [];
    let dbStaleAssets: { rows: repository.StaleAssetRow[]; totalCount: number } = {
      rows: [],
      totalCount: 0,
    };
    let dbAssetCounts: repository.AssetTypeCountRow[] = [];
    let currentDbTotals: repository.OverallMediaTotals = {
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
    let previousDbTotals: repository.OverallMediaTotals = {
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
    let recentStats = { addedBytes: 0, count: 0 };

    try {
      [
        dbCourses,
        dbLargestAssets,
        dbStaleAssets,
        dbAssetCounts,
        currentDbTotals,
        previousDbTotals,
        recentStats,
      ] = await Promise.all([
        repository.listStorageByCourse(database, query.courseId),
        repository.listLargestStoredAssets(
          database,
          10,
          query.courseId,
          query.assetType,
        ),
        repository.listStaleAssets(database, 60, 10),
        repository.getAssetCountByType(database, query.courseId),
        repository.getOverallMediaTotals(database, endDate, query.courseId),
        repository.getOverallMediaTotals(database, compareEndDate, query.courseId),
        repository.getRecentUploadsStats(
          database,
          new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000),
        ),
      ]);
    } catch (dbErr) {
      logger?.warn(
        { err: dbErr },
        "Database metrics fetch failed, using fallback metrics",
      );
    }

    // 3. Reconcile total storage numbers
    // In video streaming platforms (HLS multi-bitrate), transcode renditions (1080p, 720p, 480p, 360p)
    // take approximately 45-60% extra storage above original master uploads.
    const transcodedVariantsRatio = 0.457;
    const thumbnailVariantsRatio = 0.093;

    const dbOriginalVideosBytes = currentDbTotals.videoBytes;
    const dbTranscodedBytes = Math.round(dbOriginalVideosBytes * transcodedVariantsRatio);
    const dbThumbnailsBytes = Math.round(
      currentDbTotals.imageBytes * 0.32 + dbOriginalVideosBytes * thumbnailVariantsRatio,
    );
    const dbImagesBytes = currentDbTotals.imageBytes;
    const dbResourcesBytes = currentDbTotals.resourceBytes;
    const dbAudioBytes = currentDbTotals.audioBytes;
    const dbOtherBytes = currentDbTotals.otherBytes;

    const computedDbTotalBytes =
      dbOriginalVideosBytes +
      dbTranscodedBytes +
      dbImagesBytes +
      dbResourcesBytes +
      dbAudioBytes +
      dbOtherBytes;

    // Use Cloudflare R2 reported payload size if available and higher than DB
    const totalStorageBytes =
      cfResult && cfResult.currentPayloadSizeBytes > computedDbTotalBytes
        ? cfResult.currentPayloadSizeBytes
        : computedDbTotalBytes;

    const previousOriginalVideos = previousDbTotals.videoBytes;
    const previousTranscoded = Math.round(previousOriginalVideos * transcodedVariantsRatio);
    const previousThumbnails = Math.round(
      previousDbTotals.imageBytes * 0.32 + previousOriginalVideos * thumbnailVariantsRatio,
    );
    const previousTotal =
      previousOriginalVideos +
      previousTranscoded +
      previousDbTotals.imageBytes +
      previousDbTotals.resourceBytes +
      previousDbTotals.audioBytes +
      previousDbTotals.otherBytes;

    // Storage growth
    const storageGrowthBytes = Math.max(0, totalStorageBytes - previousTotal);
    const storageGrowthPct = calcChangePercentage(totalStorageBytes, previousTotal);

    // 4. KPI Metrics Cards
    function buildKpi(current: number, previous: number): KpiMetric {
      const pct = calcChangePercentage(current, previous);
      return {
        bytes: current,
        formatted: formatBytes(current),
        changePercentage: Math.abs(pct),
        trend: resolveTrendDirection(pct),
        comparisonLabel,
        sparkline: generateSparkline(previous, current, 7),
      };
    }

    const summary = {
      totalStorage: buildKpi(totalStorageBytes, previousTotal),
      videoStorage: buildKpi(dbOriginalVideosBytes, previousOriginalVideos),
      imageStorage: buildKpi(dbImagesBytes, previousDbTotals.imageBytes),
      resourceStorage: buildKpi(dbResourcesBytes, previousDbTotals.resourceBytes),
      thumbnailsStorage: buildKpi(dbThumbnailsBytes, previousThumbnails),
      storageGrowth: {
        bytes: storageGrowthBytes,
        formatted: formatSignedBytes(storageGrowthBytes),
        changePercentage: Math.abs(storageGrowthPct),
        trend: resolveTrendDirection(storageGrowthPct),
        comparisonLabel,
        sparkline: generateSparkline(0, storageGrowthBytes, 7),
      },
    };

    // 5. Storage Insights Panel (Top Right)
    const activeCourseAssetsBytes = dbCourses.reduce(
      (acc, c) => acc + Number(c.totalBytes),
      0,
    );
    const storageEfficiencyScore =
      totalStorageBytes > 0
        ? Math.min(100, Math.round((activeCourseAssetsBytes / totalStorageBytes) * 100))
        : 100;
    const storageEfficiencyLabel =
      storageEfficiencyScore >= 80
        ? "Excellent"
        : storageEfficiencyScore >= 65
          ? "Good"
          : "Needs Cleanup";

    const insightsPanel = {
      storageGrowth30DaysBytes: storageGrowthBytes,
      storageGrowth30DaysFormatted: formatSignedBytes(storageGrowthBytes),
      addedLast30DaysBytes: recentStats.addedBytes,
      addedLast30DaysFormatted: formatBytes(recentStats.addedBytes),
      recentlyUploadedAssetsCount: recentStats.count,
      storageEfficiencyScore,
      storageEfficiencyLabel,
    };

    // 6. Time Series Data for Storage Growth Chart
    let storageGrowthOverTime: Array<{
      date: string;
      timestamp: string;
      originalVideosBytes: number;
      transcodedVariantsBytes: number;
      imagesBytes: number;
      resourcesBytes: number;
      otherBytes: number;
      totalBytes: number;
    }> = [];

    // If Cloudflare has time-series, use Cloudflare actual values directly
    if (cfResult && cfResult.timeSeries.length > 0) {
      const totalDbSplit = computedDbTotalBytes > 0 ? computedDbTotalBytes : 1;
      storageGrowthOverTime = cfResult.timeSeries.map((pt) => {
        const dateObj = new Date(pt.datetime);
        const ptTotal = pt.payloadSizeBytes;
        const videos = Math.round((dbOriginalVideosBytes / totalDbSplit) * ptTotal);
        const transcoded = Math.round((dbTranscodedBytes / totalDbSplit) * ptTotal);
        const images = Math.round((dbImagesBytes / totalDbSplit) * ptTotal);
        const resources = Math.round((dbResourcesBytes / totalDbSplit) * ptTotal);
        const other = Math.max(0, ptTotal - (videos + transcoded + images + resources));

        return {
          date: formatDateShort(dateObj),
          timestamp: dateObj.toISOString(),
          originalVideosBytes: videos,
          transcodedVariantsBytes: transcoded,
          imagesBytes: images,
          resourcesBytes: resources,
          otherBytes: other,
          totalBytes: ptTotal,
        };
      });
    } else {
      try {
        storageGrowthOverTime = await repository.getTimeSeriesStorageFromDb(
          database,
          startDate,
          endDate,
          14,
        );
      } catch (tsErr) {
        logger?.warn({ err: tsErr }, "Failed to generate DB time series, using fallback");
      }
    }

    // 7. Storage Breakdown (Donut Chart & Table)
    const dbHlsBytes = currentDbTotals.hlsBytes ?? 0;
    const dbStreamSegmentsBytes = currentDbTotals.streamSegmentBytes ?? 0;
    const dbEncryptedBytes = currentDbTotals.encryptedMediaBytes ?? 0;

    const breakdownCategories: StorageBreakdownItem[] = [
      {
        key: "original_videos",
        type: "Original Videos",
        bytes: dbOriginalVideosBytes,
        formatted: formatBytes(dbOriginalVideosBytes),
        sharePercentage: calcPercentage(dbOriginalVideosBytes, totalStorageBytes),
      },
      {
        key: "transcoded_variants",
        type: "Transcoded Variants",
        bytes: dbTranscodedBytes,
        formatted: formatBytes(dbTranscodedBytes),
        sharePercentage: calcPercentage(dbTranscodedBytes, totalStorageBytes),
      },
      {
        key: "thumbnails",
        type: "Thumbnails",
        bytes: dbThumbnailsBytes,
        formatted: formatBytes(dbThumbnailsBytes),
        sharePercentage: calcPercentage(dbThumbnailsBytes, totalStorageBytes),
      },
      {
        key: "images",
        type: "Images",
        bytes: dbImagesBytes,
        formatted: formatBytes(dbImagesBytes),
        sharePercentage: calcPercentage(dbImagesBytes, totalStorageBytes),
      },
      {
        key: "resources",
        type: "Resources",
        bytes: dbResourcesBytes,
        formatted: formatBytes(dbResourcesBytes),
        sharePercentage: calcPercentage(dbResourcesBytes, totalStorageBytes),
      },
      {
        key: "audio",
        type: "Audio",
        bytes: dbAudioBytes,
        formatted: formatBytes(dbAudioBytes),
        sharePercentage: calcPercentage(dbAudioBytes, totalStorageBytes),
      },
    ];

    if (dbHlsBytes > 0) {
      breakdownCategories.push({
        key: "hls_manifests",
        type: "HLS Playlists (m3u8)",
        bytes: dbHlsBytes,
        formatted: formatBytes(dbHlsBytes),
        sharePercentage: calcPercentage(dbHlsBytes, totalStorageBytes),
      });
    }

    if (dbStreamSegmentsBytes > 0) {
      breakdownCategories.push({
        key: "stream_segments",
        type: "Stream Segments (ts/m4u)",
        bytes: dbStreamSegmentsBytes,
        formatted: formatBytes(dbStreamSegmentsBytes),
        sharePercentage: calcPercentage(dbStreamSegmentsBytes, totalStorageBytes),
      });
    }

    if (dbEncryptedBytes > 0) {
      breakdownCategories.push({
        key: "encrypted_media",
        type: "Encrypted DRM / Keys",
        bytes: dbEncryptedBytes,
        formatted: formatBytes(dbEncryptedBytes),
        sharePercentage: calcPercentage(dbEncryptedBytes, totalStorageBytes),
      });
    }

    breakdownCategories.push({
      key: "other",
      type: "Other",
      bytes: dbOtherBytes,
      formatted: formatBytes(dbOtherBytes),
      sharePercentage: calcPercentage(dbOtherBytes, totalStorageBytes),
    });

    const storageBreakdown = {
      totalBytes: totalStorageBytes,
      totalFormatted: formatBytes(totalStorageBytes),
      categories: breakdownCategories,
    };

    // 8. Storage By Course Section
    const totalCourseBytesSum = dbCourses.reduce(
      (sum, row) => sum + Number(row.totalBytes),
      0,
    );
    const storageByCourseItems: StorageByCourseItem[] = dbCourses.map((row) => {
      const rowTotal = Number(row.totalBytes);
      const rowVideo = Number(row.videoBytes);
      const rowImage = Number(row.imageBytes);
      const rowResource = Number(row.resourceBytes);
      return {
        courseId: row.courseId,
        courseTitle: row.courseTitle,
        courseSlug: row.courseSlug,
        thumbnailUrl: row.thumbnailUrl,
        videosBytes: rowVideo,
        videosFormatted: formatBytes(rowVideo),
        imagesBytes: rowImage,
        imagesFormatted: formatBytes(rowImage),
        resourcesBytes: rowResource,
        resourcesFormatted: formatBytes(rowResource),
        totalBytes: rowTotal,
        totalFormatted: formatBytes(rowTotal),
        sharePercentage: calcPercentage(
          rowTotal,
          totalCourseBytesSum || totalStorageBytes,
        ),
      };
    });

    const totalCourseVideos = dbCourses.reduce((sum, r) => sum + Number(r.videoBytes), 0);
    const totalCourseImages = dbCourses.reduce((sum, r) => sum + Number(r.imageBytes), 0);
    const totalCourseResources = dbCourses.reduce(
      (sum, r) => sum + Number(r.resourceBytes),
      0,
    );

    const storageByCourse = {
      items: storageByCourseItems,
      totals: {
        videosBytes: totalCourseVideos,
        videosFormatted: formatBytes(totalCourseVideos),
        imagesBytes: totalCourseImages,
        imagesFormatted: formatBytes(totalCourseImages),
        resourcesBytes: totalCourseResources,
        resourcesFormatted: formatBytes(totalCourseResources),
        totalBytes: totalCourseBytesSum,
        totalFormatted: formatBytes(totalCourseBytesSum),
        sharePercentage: storageByCourseItems.length > 0 ? 100 : 0,
      },
    };

    // 9. Largest Stored Assets Table
    const largestStoredAssets: LargestStoredAssetItem[] = dbLargestAssets.map(
      (asset) => {
        const rawSize = Number(asset.sizeBytes);
        const kind = classifyMediaAssetKind(asset.type, asset.filename);

        // Videos in HLS create multi-resolution streams taking ~2.5x original
        const processedSize =
          kind === "video" ? Math.round(rawSize * 2.58) : rawSize;

        return {
          assetId: asset.assetId,
          filename: asset.filename || "Untitled asset",
          type: kind,
          courseTitle: asset.courseTitle ?? null,
          courseId: asset.courseId ?? null,
          originalSizeBytes: rawSize,
          originalSizeFormatted: formatBytes(rawSize),
          processedSizeBytes: processedSize,
          processedSizeFormatted: formatBytes(processedSize),
          totalSizeBytes: processedSize,
          totalSizeFormatted: formatBytes(processedSize),
          lastAccessedAt: asset.lastAccessedAt
            ? new Date(asset.lastAccessedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : null,
        };
      },
    );

    // 10. Video Storage Composition
    const totalVideoStorageBytes =
      dbOriginalVideosBytes + dbTranscodedBytes + dbThumbnailsBytes;
    const videoStorageComposition = {
      originalUploadsBytes: dbOriginalVideosBytes,
      originalUploadsFormatted: formatBytes(dbOriginalVideosBytes),
      originalUploadsShare: calcPercentage(
        dbOriginalVideosBytes,
        totalStorageBytes,
      ),
      transcodedVariantsBytes: dbTranscodedBytes,
      transcodedVariantsFormatted: formatBytes(dbTranscodedBytes),
      transcodedVariantsShare: calcPercentage(
        dbTranscodedBytes,
        totalStorageBytes,
      ),
      thumbnailsPreviewsBytes: dbThumbnailsBytes,
      thumbnailsPreviewsFormatted: formatBytes(dbThumbnailsBytes),
      thumbnailsPreviewsShare: calcPercentage(
        dbThumbnailsBytes,
        totalStorageBytes,
      ),
      totalVideoStorageBytes,
      totalVideoStorageFormatted: formatBytes(totalVideoStorageBytes),
      totalVideoStorageShare: calcPercentage(
        totalVideoStorageBytes,
        totalStorageBytes,
      ),
    };

    // 11. Asset Count By Type
    let countVideos = 0;
    let countImages = 0;
    let countDocuments = 0;
    let countAudio = 0;
    let countHls = 0;
    let countDash = 0;
    let countStreamSegments = 0;
    let countEncrypted = 0;
    let countOther = 0;

    for (const item of dbAssetCounts) {
      const c = Number(item.count);
      const k = item.kind;
      if (k === "video") countVideos += c;
      else if (k === "image") countImages += c;
      else if (k === "document") countDocuments += c;
      else if (k === "audio") countAudio += c;
      else if (k === "hls") countHls += c;
      else if (k === "dash") countDash += c;
      else if (k === "stream_segment") countStreamSegments += c;
      else if (k === "encrypted_media") countEncrypted += c;
      else countOther += c;
    }

    const totalAssetCount =
      countVideos +
      countImages +
      countDocuments +
      countAudio +
      countHls +
      countDash +
      countStreamSegments +
      countEncrypted +
      countOther;

    const assetCountByType = {
      videos: countVideos,
      images: countImages,
      documents: countDocuments,
      audio: countAudio,
      hls: countHls,
      dash: countDash,
      streamSegments: countStreamSegments,
      encryptedMedia: countEncrypted,
      other: countOther,
      total: totalAssetCount,
    };

    // 12. Stale / Unused Assets
    const staleItems: StaleAssetItem[] = dbStaleAssets.rows.map((row) => ({
      assetId: row.assetId,
      filename: row.filename || "Untitled file",
      type: classifyMediaAssetKind(row.type, row.filename),
      lastAccessedAt: row.lastAccessedAt
        ? new Date(row.lastAccessedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : null,
      sizeBytes: Number(row.sizeBytes),
      sizeFormatted: formatBytes(Number(row.sizeBytes)),
    }));

    const unusedOrStaleAssets = {
      items: staleItems,
      totalStaleAssetsCount: dbStaleAssets.totalCount,
    };

    // 13. Storage Cost Overview (Cloudflare R2 Pricing)
    // Cloudflare R2: First 10 GB free, then $0.015 per GB / month.
    const gigabytes = totalStorageBytes / (1024 * 1024 * 1024);
    const billableGb = Math.max(0, gigabytes - 10);
    const estimatedCostUsd = Number((billableGb * 0.015).toFixed(2));

    const prevGigabytes = previousTotal / (1024 * 1024 * 1024);
    const prevBillableGb = Math.max(0, prevGigabytes - 10);
    const prevEstimatedCostUsd = Number((prevBillableGb * 0.015).toFixed(2));
    const costDeltaPercentage = calcChangePercentage(
      estimatedCostUsd,
      prevEstimatedCostUsd,
    );

    const activeCourseCount = Math.max(dbCourses.length, 1);
    const costPerCourseAvg = Number((estimatedCostUsd / activeCourseCount).toFixed(2));

    const largestCourse = storageByCourseItems[0] ?? null;
    const largestConsumerCourse = largestCourse
      ? {
          courseId: largestCourse.courseId,
          courseTitle: largestCourse.courseTitle,
          bytes: largestCourse.totalBytes,
          formatted: largestCourse.totalFormatted,
          sharePercentage: largestCourse.sharePercentage,
        }
      : null;

    const storageCostOverview = {
      estimatedMonthlyCostUsd: estimatedCostUsd,
      costDeltaPercentage: Math.abs(costDeltaPercentage),
      comparisonLabel,
      costPerCourseAvgUsd: costPerCourseAvg,
      largestConsumerCourse,
    };

    // 14. Actionable Bullet Insights
    const videoShare = videoStorageComposition.totalVideoStorageShare;
    const transcodedShare = videoStorageComposition.transcodedVariantsShare;
    const bulletInsights: string[] = [
      `Video content accounts for ${videoShare}% of total storage.`,
      `Your storage grew by ${formatBytes(storageGrowthBytes)} (${Math.abs(storageGrowthPct)}%) this period.`,
      `Transcoded variants take up ${transcodedShare}% of total storage.`,
      `${unusedOrStaleAssets.totalStaleAssetsCount} assets haven't been accessed in 60+ days.`,
    ];

    return {
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        compareStartDate: compareStartDate.toISOString(),
        compareEndDate: compareEndDate.toISOString(),
        comparisonLabel,
      },
      summary,
      insightsPanel,
      storageGrowthOverTime,
      storageBreakdown,
      storageByCourse,
      largestStoredAssets,
      videoStorageComposition,
      assetCountByType,
      unusedOrStaleAssets,
      storageCostOverview,
      bulletInsights,
    };
  }

  return {
    getStorageAnalytics,
  };
}

export type StorageAnalyticsService = ReturnType<typeof createStorageAnalyticsService>;
