import { createDrizzleDatabaseModule } from "@aec-craft/platform-common/drizzle";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { ConfigToken } from "../config/config";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export const DatabaseToken = Symbol.for(
  "@aec-craft/platform-authorization:database"
);

export const DatabasePoolToken = Symbol.for(
  "@aec-craft/platform-authorization:database-pool"
);

/** Sized above the read-mostly slices: the group tree is read on the
 * candidate-list path of every list query. */
export const DatabaseModule = createDrizzleDatabaseModule({
  databaseToken: DatabaseToken,
  poolToken: DatabasePoolToken,
  configToken: ConfigToken,
  schema,
  poolMax: 10,
});
