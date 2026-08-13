import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { Pool } from "pg";

// Parse Postgres BIGINT (int8) columns as JS numbers instead of strings.
pg.defaults.parseInt8 = true;


import type { Database } from "./schema.ts";

export function createDatabase(databaseUrl: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: databaseUrl }),
    }),
  });
}
