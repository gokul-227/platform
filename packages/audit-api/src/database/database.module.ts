import { createDrizzleDatabaseModule } from "@aec-craft/platform-common/drizzle";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { ConfigToken } from "../config/config";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export const DatabaseToken = Symbol.for(
  "@aec-craft/platform-audit-api:database"
);

export const DatabasePoolToken = Symbol.for(
  "@aec-craft/platform-audit-api:database-pool"
);

/** `poolMax` below the shared default of 20: this slice only ever reads. */
export const DatabaseModule = createDrizzleDatabaseModule({
  databaseToken: DatabaseToken,
  poolToken: DatabasePoolToken,
  configToken: ConfigToken,
  schema,
  poolMax: 5,
});
