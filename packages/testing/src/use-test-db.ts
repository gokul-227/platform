import type { Database as AuditDatabase } from "@aec-craft/platform-audit-api";
import type { Database as AuthorizationDatabase } from "@aec-craft/platform-authorization";
import type { Database as FilesDatabase } from "@aec-craft/platform-files-api";
import type { Database as GraphDatabase } from "@aec-craft/platform-graph-api";
import type { Database as TenancyDatabase } from "@aec-craft/platform-tenancy-api";
import type { Database as ThreadsDatabase } from "@aec-craft/platform-threads-api";
import type { Database as UsersDatabase } from "@aec-craft/platform-users-api";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach } from "vitest";

import { createTestDb, ensureMigrated, truncateAll } from "./db";

/**
 * Shared `beforeAll` / `afterAll` / `beforeEach` wiring for integration suites.
 * Returns getters (not bare references) because the drizzle instances are
 * created inside `beforeAll`, after the suite's top-level `describe` body runs.
 *
 *   const ctx = useTestDb();
 *   it("works", async () => { await ctx.db.select().from(graphNode)... });
 *
 * Truncates between every test so suites cannot leak state into each other.
 */
export function useTestDb(): {
  readonly auditDb: AuditDatabase;
  readonly authorizationDb: AuthorizationDatabase;
  readonly db: GraphDatabase;
  readonly filesDb: FilesDatabase;
  readonly tenancyDb: TenancyDatabase;
  readonly threadsDb: ThreadsDatabase;
  readonly usersDb: UsersDatabase;
  readonly pool: pg.Pool;
} {
  let auditDb: AuditDatabase;
  let authorizationDb: AuthorizationDatabase;
  let db: GraphDatabase;
  let filesDb: FilesDatabase;
  let tenancyDb: TenancyDatabase;
  let threadsDb: ThreadsDatabase;
  let usersDb: UsersDatabase;
  let pool: pg.Pool;

  beforeAll(async () => {
    ({
      auditDb,
      authorizationDb,
      db,
      filesDb,
      tenancyDb,
      threadsDb,
      usersDb,
      pool,
    } = createTestDb());
    await ensureMigrated(pool);
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    // Every drizzle instance rides the same pool; end it exactly once.
    await pool.end();
  });

  return {
    get auditDb() {
      return auditDb;
    },
    get authorizationDb() {
      return authorizationDb;
    },
    get db() {
      return db;
    },
    get filesDb() {
      return filesDb;
    },
    get tenancyDb() {
      return tenancyDb;
    },
    get threadsDb() {
      return threadsDb;
    },
    get usersDb() {
      return usersDb;
    },
    get pool() {
      return pool;
    },
  };
}
