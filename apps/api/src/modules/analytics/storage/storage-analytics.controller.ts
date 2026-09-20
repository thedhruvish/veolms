import type { FastifyReply, FastifyRequest } from "fastify";
import type { StorageAnalyticsQuery } from "@veolms/contracts";
import type { StorageAnalyticsService } from "./storage-analytics.service.ts";

export interface StorageAnalyticsControllerOptions {
  service: StorageAnalyticsService;
}

export function createStorageAnalyticsController({
  service,
}: StorageAnalyticsControllerOptions) {
  async function getStorageAnalytics(
    request: FastifyRequest<{ Querystring: StorageAnalyticsQuery }>,
    _reply: FastifyReply,
  ) {
    const query = request.query;
    return service.getStorageAnalytics(query);
  }

  return {
    getStorageAnalytics,
  };
}

export type StorageAnalyticsController = ReturnType<
  typeof createStorageAnalyticsController
>;
