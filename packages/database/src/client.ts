import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

import type { Database } from "./schema.ts";

export function createDatabase(databaseUrl: string): Kysely<Database> {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 30000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });

  // Handle and prevent unhandled ECONNRESET on idle client sockets from serverless pooler
  pool.on("error", (err: unknown) => {
    const error = err as { code?: string; message?: string };
    if (error.code !== "ECONNRESET") {
      console.warn("[Database Pool Warning]:", error.message ?? String(err));
    }
  });

  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool,
    }),
  });
}
