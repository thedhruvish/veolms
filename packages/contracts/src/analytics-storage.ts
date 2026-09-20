import { z } from "zod";

export const storageAnalyticsTimeWindowSchema = z.enum(["7D", "30D", "3M", "1Y"]);
export type StorageAnalyticsTimeWindow = z.infer<typeof storageAnalyticsTimeWindowSchema>;

export const storageAssetTypeFilterSchema = z.enum([
  "all",
  "video",
  "image",
  "resource",
  "document",
  "audio",
  "thumbnail",
  "hls",
  "dash",
  "stream_segment",
  "encrypted_media",
  "other",
]);
export type StorageAssetTypeFilter = z.infer<typeof storageAssetTypeFilterSchema>;

export const storageAnalyticsQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  compareStartDate: z.string().optional(),
  compareEndDate: z.string().optional(),
  courseId: z.string().optional(),
  assetType: storageAssetTypeFilterSchema.optional().default("all"),
  timeWindow: storageAnalyticsTimeWindowSchema.optional().default("30D"),
});

export type StorageAnalyticsQuery = z.infer<typeof storageAnalyticsQuerySchema>;

export const kpiTrendDirectionSchema = z.enum(["up", "down", "neutral"]);
export type KpiTrendDirection = z.infer<typeof kpiTrendDirectionSchema>;

export const kpiMetricSchema = z.object({
  bytes: z.number(),
  formatted: z.string(),
  changePercentage: z.number(),
  trend: kpiTrendDirectionSchema,
  comparisonLabel: z.string(),
  sparkline: z.array(z.number()),
});
export type KpiMetric = z.infer<typeof kpiMetricSchema>;

export const storageAnalyticsSummarySchema = z.object({
  totalStorage: kpiMetricSchema,
  videoStorage: kpiMetricSchema,
  imageStorage: kpiMetricSchema,
  resourceStorage: kpiMetricSchema,
  thumbnailsStorage: kpiMetricSchema,
  storageGrowth: kpiMetricSchema,
});
export type StorageAnalyticsSummary = z.infer<typeof storageAnalyticsSummarySchema>;

export const storageInsightsPanelSchema = z.object({
  storageGrowth30DaysBytes: z.number(),
  storageGrowth30DaysFormatted: z.string(),
  addedLast30DaysBytes: z.number(),
  addedLast30DaysFormatted: z.string(),
  recentlyUploadedAssetsCount: z.number(),
  storageEfficiencyScore: z.number(),
  storageEfficiencyLabel: z.string(),
});
export type StorageInsightsPanel = z.infer<typeof storageInsightsPanelSchema>;

export const storageGrowthTimeSeriesPointSchema = z.object({
  date: z.string(),
  timestamp: z.string(),
  originalVideosBytes: z.number(),
  transcodedVariantsBytes: z.number(),
  imagesBytes: z.number(),
  resourcesBytes: z.number(),
  otherBytes: z.number(),
  totalBytes: z.number(),
});
export type StorageGrowthTimeSeriesPoint = z.infer<typeof storageGrowthTimeSeriesPointSchema>;

export const storageBreakdownCategoryKeySchema = z.enum([
  "original_videos",
  "transcoded_variants",
  "thumbnails",
  "images",
  "resources",
  "audio",
  "hls_manifests",
  "dash_manifests",
  "stream_segments",
  "encrypted_media",
  "other",
]);
export type StorageBreakdownCategoryKey = z.infer<typeof storageBreakdownCategoryKeySchema>;

export const storageBreakdownItemSchema = z.object({
  key: storageBreakdownCategoryKeySchema,
  type: z.string(),
  bytes: z.number(),
  formatted: z.string(),
  sharePercentage: z.number(),
});
export type StorageBreakdownItem = z.infer<typeof storageBreakdownItemSchema>;

export const storageBreakdownSchema = z.object({
  totalBytes: z.number(),
  totalFormatted: z.string(),
  categories: z.array(storageBreakdownItemSchema),
});
export type StorageBreakdown = z.infer<typeof storageBreakdownSchema>;

export const storageByCourseItemSchema = z.object({
  courseId: z.string(),
  courseTitle: z.string(),
  courseSlug: z.string(),
  thumbnailUrl: z.string().nullable().optional(),
  videosBytes: z.number(),
  videosFormatted: z.string(),
  imagesBytes: z.number(),
  imagesFormatted: z.string(),
  resourcesBytes: z.number(),
  resourcesFormatted: z.string(),
  totalBytes: z.number(),
  totalFormatted: z.string(),
  sharePercentage: z.number(),
});
export type StorageByCourseItem = z.infer<typeof storageByCourseItemSchema>;

export const storageByCourseSectionSchema = z.object({
  items: z.array(storageByCourseItemSchema),
  totals: z.object({
    videosBytes: z.number(),
    videosFormatted: z.string(),
    imagesBytes: z.number(),
    imagesFormatted: z.string(),
    resourcesBytes: z.number(),
    resourcesFormatted: z.string(),
    totalBytes: z.number(),
    totalFormatted: z.string(),
    sharePercentage: z.number(),
  }),
});
export type StorageByCourseSection = z.infer<typeof storageByCourseSectionSchema>;

export const storedAssetKindSchema = z.enum([
  "video",
  "image",
  "document",
  "audio",
  "hls",
  "dash",
  "stream_segment",
  "encrypted_media",
  "other",
]);
export type StoredAssetKind = z.infer<typeof storedAssetKindSchema>;

export const largestStoredAssetItemSchema = z.object({
  assetId: z.string(),
  filename: z.string(),
  type: storedAssetKindSchema,
  courseTitle: z.string().nullable(),
  courseId: z.string().nullable(),
  originalSizeBytes: z.number(),
  originalSizeFormatted: z.string(),
  processedSizeBytes: z.number(),
  processedSizeFormatted: z.string(),
  totalSizeBytes: z.number(),
  totalSizeFormatted: z.string(),
  lastAccessedAt: z.string().nullable(),
});
export type LargestStoredAssetItem = z.infer<typeof largestStoredAssetItemSchema>;

export const videoStorageCompositionSchema = z.object({
  originalUploadsBytes: z.number(),
  originalUploadsFormatted: z.string(),
  originalUploadsShare: z.number(),
  transcodedVariantsBytes: z.number(),
  transcodedVariantsFormatted: z.string(),
  transcodedVariantsShare: z.number(),
  thumbnailsPreviewsBytes: z.number(),
  thumbnailsPreviewsFormatted: z.string(),
  thumbnailsPreviewsShare: z.number(),
  totalVideoStorageBytes: z.number(),
  totalVideoStorageFormatted: z.string(),
  totalVideoStorageShare: z.number(),
});
export type VideoStorageComposition = z.infer<typeof videoStorageCompositionSchema>;

export const assetCountByTypeSchema = z.object({
  videos: z.number(),
  images: z.number(),
  documents: z.number(),
  audio: z.number(),
  hls: z.number().default(0),
  dash: z.number().default(0),
  streamSegments: z.number().default(0),
  encryptedMedia: z.number().default(0),
  other: z.number(),
  total: z.number(),
});
export type AssetCountByType = z.infer<typeof assetCountByTypeSchema>;

export const staleAssetItemSchema = z.object({
  assetId: z.string(),
  filename: z.string(),
  type: storedAssetKindSchema,
  lastAccessedAt: z.string().nullable(),
  sizeBytes: z.number(),
  sizeFormatted: z.string(),
});
export type StaleAssetItem = z.infer<typeof staleAssetItemSchema>;

export const staleAssetsSectionSchema = z.object({
  items: z.array(staleAssetItemSchema),
  totalStaleAssetsCount: z.number(),
});
export type StaleAssetsSection = z.infer<typeof staleAssetsSectionSchema>;

export const storageCostOverviewSchema = z.object({
  estimatedMonthlyCostUsd: z.number(),
  costDeltaPercentage: z.number(),
  comparisonLabel: z.string(),
  costPerCourseAvgUsd: z.number(),
  largestConsumerCourse: z
    .object({
      courseId: z.string(),
      courseTitle: z.string(),
      bytes: z.number(),
      formatted: z.string(),
      sharePercentage: z.number(),
    })
    .nullable(),
});
export type StorageCostOverview = z.infer<typeof storageCostOverviewSchema>;

export const storageAnalyticsPeriodSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  compareStartDate: z.string(),
  compareEndDate: z.string(),
  comparisonLabel: z.string(),
});
export type StorageAnalyticsPeriod = z.infer<typeof storageAnalyticsPeriodSchema>;

export const storageAnalyticsResponseSchema = z.object({
  period: storageAnalyticsPeriodSchema,
  summary: storageAnalyticsSummarySchema,
  insightsPanel: storageInsightsPanelSchema,
  storageGrowthOverTime: z.array(storageGrowthTimeSeriesPointSchema),
  storageBreakdown: storageBreakdownSchema,
  storageByCourse: storageByCourseSectionSchema,
  largestStoredAssets: z.array(largestStoredAssetItemSchema),
  videoStorageComposition: videoStorageCompositionSchema,
  assetCountByType: assetCountByTypeSchema,
  unusedOrStaleAssets: staleAssetsSectionSchema,
  storageCostOverview: storageCostOverviewSchema,
  bulletInsights: z.array(z.string()),
});
export type StorageAnalyticsResponse = z.infer<typeof storageAnalyticsResponseSchema>;
