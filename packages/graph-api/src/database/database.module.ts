import { createDrizzleDatabaseModule } from "@aec-craft/platform-common/drizzle";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { ConfigToken } from "../config/config";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

/**
 * The handle `Database["transaction"]` passes to its callback. Named because the
 * batch services and the version log take it as an argument, which is what puts
 * a whole changeset on the one transaction `GraphBatchService` owns.
 */
export type GraphTransaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];

export const DatabaseToken = Symbol.for(
  "@aec-craft/platform-graph-api:database"
);

export const DatabasePoolToken = Symbol.for(
  "@aec-craft/platform-graph-api:database-pool"
);

export const DatabaseModule = createDrizzleDatabaseModule({
  databaseToken: DatabaseToken,
  poolToken: DatabasePoolToken,
  configToken: ConfigToken,
  schema,
});
