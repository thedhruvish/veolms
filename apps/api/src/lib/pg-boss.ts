import Boss from "pg-boss";
import { config } from "../config.ts";

let bossInstance: Boss | null = null;

export async function getBoss(): Promise<Boss> {
  if (!bossInstance) {
    bossInstance = new Boss({
      connectionString: config.DATABASE_URL,
      // Disable default cron/monitoring overhead in fastify routes context
      // unless required
    });
    await bossInstance.start();
  }
  return bossInstance;
}
