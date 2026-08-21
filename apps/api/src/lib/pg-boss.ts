import Boss from "pg-boss";
import { config } from "../config.ts";

let bossInstance: Boss | null = null;
let startingPromise: Promise<Boss> | null = null;

export async function getBoss(): Promise<Boss> {
  if (bossInstance) {
    return bossInstance;
  }

  // Guard against a TOCTOU race: two concurrent callers on a cold-started
  // process must not each construct/start their own instance, and a second
  // caller must not observe a not-yet-started instance. Sharing this promise
  // means every concurrent caller awaits the same start() before proceeding.
  if (!startingPromise) {
    const instance = new Boss({
      connectionString: config.DATABASE_URL,
      // Disable default cron/monitoring overhead in fastify routes context
      // unless required
    });
    startingPromise = instance.start().then(
      () => {
        bossInstance = instance;
        return instance;
      },
      (err) => {
        // Let a later call retry from scratch instead of being stuck
        // forever replaying this one failed start().
        startingPromise = null;
        throw err;
      },
    );
  }

  return startingPromise;
}
