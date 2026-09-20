import { z } from "zod";

export const dataDeliveryTimeWindowSchema = z.enum(["7D", "30D", "3M", "1Y"]);
export type DataDeliveryTimeWindow = z.infer<typeof dataDeliveryTimeWindowSchema>;

export const dataDeliveryAssetTypeFilterSchema = z.enum([
  "all",
  "video",
  "image",
  "resource",
  "document",
  "audio",
  "hls",
  "dash",
  "stream_segment",
  "encrypted_media",
  "other",
]);
export type DataDeliveryAssetTypeFilter = z.infer<
  typeof dataDeliveryAssetTypeFilterSchema
>;

export const dataDeliveryQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  compareStartDate: z.string().optional(),
  compareEndDate: z.string().optional(),
  courseId: z.string().optional(),
  assetType: dataDeliveryAssetTypeFilterSchema.optional().default("all"),
  timeWindow: dataDeliveryTimeWindowSchema.optional().default("30D"),
});
export type DataDeliveryQuery = z.infer<typeof dataDeliveryQuerySchema>;

export const deliveryKpiTrendDirectionSchema = z.enum(["up", "down", "neutral"]);
export type DeliveryKpiTrendDirection = z.infer<
  typeof deliveryKpiTrendDirectionSchema
>;

export const kpiDeliveryMetricSchema = z.object({
  bytes: z.number(),
  formatted: z.string(),
  changePercentage: z.number(),
  trend: deliveryKpiTrendDirectionSchema,
  comparisonLabel: z.string(),
  sparkline: z.array(z.number()),
});
export type KpiDeliveryMetric = z.infer<typeof kpiDeliveryMetricSchema>;

export const kpiPercentageMetricSchema = z.object({
  percentage: z.number(),
  formatted: z.string(),
  changePercentage: z.number(),
  trend: deliveryKpiTrendDirectionSchema,
  comparisonLabel: z.string(),
  sparkline: z.array(z.number()),
});
export type KpiPercentageMetric = z.infer<typeof kpiPercentageMetricSchema>;

export const dataDeliverySummarySchema = z.object({
  totalDataDelivered: kpiDeliveryMetricSchema,
  videoDataStreamed: kpiDeliveryMetricSchema,
  imagesDelivered: kpiDeliveryMetricSchema,
  resourcesDelivered: kpiDeliveryMetricSchema,
  originEgress: kpiDeliveryMetricSchema,
  cacheHitRatio: kpiPercentageMetricSchema,
});
export type DataDeliverySummary = z.infer<typeof dataDeliverySummarySchema>;

export const dataDeliveredOverTimePointSchema = z.object({
  date: z.string(),
  timestamp: z.string(),
  videoBytes: z.number(),
  imagesBytes: z.number(),
  resourcesBytes: z.number(),
  audioBytes: z.number(),
  otherBytes: z.number(),
  totalBytes: z.number(),
});
export type DataDeliveredOverTimePoint = z.infer<
  typeof dataDeliveredOverTimePointSchema
>;

export const deliverySplitCategoryKeySchema = z.enum([
  "video",
  "images",
  "resources",
  "audio",
  "hls",
  "dash",
  "stream_segments",
  "encrypted_media",
  "other",
]);
export type DeliverySplitCategoryKey = z.infer<
  typeof deliverySplitCategoryKeySchema
>;

export const deliverySplitCategorySchema = z.object({
  key: deliverySplitCategoryKeySchema,
  type: z.string(),
  bytes: z.number(),
  formatted: z.string(),
  sharePercentage: z.number(),
});
export type DeliverySplitCategory = z.infer<typeof deliverySplitCategorySchema>;

export const deliverySplitSchema = z.object({
  totalBytes: z.number(),
  totalFormatted: z.string(),
  categories: z.array(deliverySplitCategorySchema),
});
export type DeliverySplit = z.infer<typeof deliverySplitSchema>;

export const cdnVsOriginDeliverySchema = z.object({
  totalDeliveredBytes: z.number(),
  totalDeliveredFormatted: z.string(),
  cdnCacheBytes: z.number(),
  cdnCacheFormatted: z.string(),
  cdnCachePercentage: z.number(),
  originEgressBytes: z.number(),
  originEgressFormatted: z.string(),
  originEgressPercentage: z.number(),
  originBandwidthSavedBytes: z.number(),
  originBandwidthSavedFormatted: z.string(),
  cacheHitRatio: z.number(),
});
export type CdnVsOriginDelivery = z.infer<typeof cdnVsOriginDeliverySchema>;

export const topBandwidthContentItemSchema = z.object({
  contentId: z.string(),
  title: z.string(),
  type: z.string(),
  courseTitle: z.string(),
  courseId: z.string().nullable(),
  dataDeliveredBytes: z.number(),
  dataDeliveredFormatted: z.string(),
  originEgressBytes: z.number(),
  originEgressFormatted: z.string(),
  requestsCount: z.number(),
  uniqueUsersCount: z.number(),
});
export type TopBandwidthContentItem = z.infer<
  typeof topBandwidthContentItemSchema
>;

export const deliveryByCourseItemSchema = z.object({
  courseId: z.string(),
  courseTitle: z.string(),
  courseSlug: z.string(),
  thumbnailUrl: z.string().nullable().optional(),
  totalDeliveredBytes: z.number(),
  totalDeliveredFormatted: z.string(),
  videoBytes: z.number(),
  videoFormatted: z.string(),
  imagesBytes: z.number(),
  imagesFormatted: z.string(),
  resourcesBytes: z.number(),
  resourcesFormatted: z.string(),
  dataPerActiveLearnerBytes: z.number(),
  dataPerActiveLearnerFormatted: z.string(),
});
export type DeliveryByCourseItem = z.infer<typeof deliveryByCourseItemSchema>;

export const requestsByDeviceItemSchema = z.object({
  device: z.string(),
  requestsCount: z.number(),
  sharePercentage: z.number(),
});
export type RequestsByDeviceItem = z.infer<typeof requestsByDeviceItemSchema>;

export const requestsByDeviceSchema = z.object({
  totalRequests: z.number(),
  devices: z.array(requestsByDeviceItemSchema),
});
export type RequestsByDevice = z.infer<typeof requestsByDeviceSchema>;

export const regionalDeliveryItemSchema = z.object({
  region: z.string(),
  deliveredBytes: z.number(),
  deliveredFormatted: z.string(),
  originEgressBytes: z.number(),
  originEgressFormatted: z.string(),
  avgQuality: z.string(),
  requestsCount: z.number(),
});
export type RegionalDeliveryItem = z.infer<typeof regionalDeliveryItemSchema>;

export const deliveryCostAndEfficiencySchema = z.object({
  estimatedDeliveryCostUsd: z.number(),
  costDeltaPercentage: z.number(),
  costDeltaTrend: deliveryKpiTrendDirectionSchema.optional().default("down"),
  comparisonLabel: z.string(),
  costPerActiveLearnerUsd: z.number(),
  costPerLearnerDeltaPercentage: z.number(),
  costPerLearnerDeltaTrend: deliveryKpiTrendDirectionSchema.optional().default("down"),
  highestCacheEfficiencySegment: z.object({
    segment: z.string(),
    cacheHitRatio: z.number(),
  }),
});
export type DeliveryCostAndEfficiency = z.infer<
  typeof deliveryCostAndEfficiencySchema
>;

export const dataDeliveryPeriodSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  compareStartDate: z.string(),
  compareEndDate: z.string(),
  comparisonLabel: z.string(),
});
export type DataDeliveryPeriod = z.infer<typeof dataDeliveryPeriodSchema>;

export const dataDeliveryResponseSchema = z.object({
  period: dataDeliveryPeriodSchema,
  summary: dataDeliverySummarySchema,
  dataDeliveredOverTime: z.array(dataDeliveredOverTimePointSchema),
  deliverySplit: deliverySplitSchema,
  cdnVsOriginDelivery: cdnVsOriginDeliverySchema,
  topBandwidthContent: z.array(topBandwidthContentItemSchema),
  deliveryByCourse: z.array(deliveryByCourseItemSchema),
  requestsByDevice: requestsByDeviceSchema,
  regionalDelivery: z.array(regionalDeliveryItemSchema),
  costAndEfficiency: deliveryCostAndEfficiencySchema,
  bulletInsights: z.array(z.string()),
});
export type DataDeliveryResponse = z.infer<typeof dataDeliveryResponseSchema>;
