import type { FastifyReply, FastifyRequest } from "fastify";
import type { DataDeliveryQuery } from "@veolms/contracts";
import type { DeliveryAnalyticsService } from "./delivery-analytics.service.ts";

export interface DeliveryAnalyticsControllerOptions {
  service: DeliveryAnalyticsService;
}

export function createDeliveryAnalyticsController({
  service,
}: DeliveryAnalyticsControllerOptions) {
  async function getDeliveryAnalytics(
    request: FastifyRequest<{ Querystring: DataDeliveryQuery }>,
    _reply: FastifyReply,
  ) {
    const query = request.query;
    return service.getDeliveryAnalytics(query);
  }

  return {
    getDeliveryAnalytics,
  };
}

export type DeliveryAnalyticsController = ReturnType<
  typeof createDeliveryAnalyticsController
>;
