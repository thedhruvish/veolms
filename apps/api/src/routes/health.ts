import type { FastifyInstance } from "fastify";

export function registerHealthRoute(app: FastifyInstance): void {
  app.get("/api/v1/health", async () => ({ status: "ok" }));
}
