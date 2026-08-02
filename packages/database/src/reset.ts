import { loadServerConfig } from "@veolms/config";
import { NO_MIGRATIONS } from "kysely/migration";

import { createDatabase } from "./client.ts";
import { assertMigrationSuccess, createMigrator } from "./migrator.ts";

const config = loadServerConfig(process.env);
const database = createDatabase(config.DATABASE_URL);

try {
  const migrator = createMigrator(database);
  assertMigrationSuccess(await migrator.migrateTo(NO_MIGRATIONS));
  assertMigrationSuccess(await migrator.migrateToLatest());
} finally {
  await database.destroy();
}
