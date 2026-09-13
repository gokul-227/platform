import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Database as AuditDatabase } from "@aec-craft/platform-audit-api";
import { auditEvent } from "@aec-craft/platform-audit-api";
import type { Database as AuthorizationDatabase } from "@aec-craft/platform-authorization";
import { group } from "@aec-craft/platform-authorization";
import type { Database as FilesDatabase } from "@aec-craft/platform-files-api";
import { file, fileUpload } from "@aec-craft/platform-files-api";
import type { Database as GraphDatabase } from "@aec-craft/platform-graph-api";
import {
  graphEdge,
  graphNode,
  graphVersion,
} from "@aec-craft/platform-graph-api";
import type { Database as TenancyDatabase } from "@aec-craft/platform-tenancy-api";
import { org, project } from "@aec-craft/platform-tenancy-api";
import type { Database as ThreadsDatabase } from "@aec-craft/platform-threads-api";
import {
  thread,
  threadMessage,
  threadRun,
} from "@aec-craft/platform-threads-api";
import type { Database as UsersDatabase } from "@aec-craft/platform-users-api";
import { user } from "@aec-craft/platform-users-api";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/**
 * Real-Postgres plumbing for the integration and e2e suites, whichever package
 * they live in.
 *
 *   - `dbAvailable()` — gate so integration suites self-skip when `DATABASE_URL`
 *     is unset (CI without a database, contributor without docker, etc.).
 *   - `createTestDb()` — the two shared-platform-DB views the suites need:
 *     the directory package's drizzle instance and the graph package's
 *     drizzle instance, both over one pool.
 *   - `ensureMigrated()` — applies each owning package's bundled drizzle
 *     genesis (directory, audit, graph), the same migrations a deployment
 *     runs; idempotent per journal.
 *   - `truncateAll()` — `TRUNCATE ... RESTART IDENTITY CASCADE` between tests
 *     so each test starts from a known state.
 *
 * `DATABASE_URL` defaults to the same value `apps/api/.env.example` uses
 * (port 5433, since cloud-sql-proxy occupies 5432 locally) so a dev with the
 * stock docker-compose Postgres can just run `pnpm test` without configuring
 * anything.
 */

// Tests run against `platform_test`, a separate DB from the dev `platform`,
// because `truncateAll()` wipes every row in `beforeEach`. Sharing the dev DB
// would silently delete the developer's signed-in user, orgs, and projects
// every time a test runs.
const DEFAULT_LOCAL_URL =
  "postgres://auth_app_role:dev@localhost:5433/platform_test";

/**
 * One database per `pnpm test`, so two runs at once cannot wipe each other.
 *
 * `truncateAll` empties every table in `beforeEach`. Two invocations sharing
 * `platform_test` therefore delete each other's fixtures mid-test, and the
 * failures that produces are neither reproducible nor honest: a row vanishes
 * between two awaited lines, so the suite blames whichever assertion happened to
 * run next. `--workspace-concurrency=1` serialises the packages within one
 * invocation and does nothing about a second shell.
 *
 * The root `test` script stamps `PLATFORM_TEST_RUN` and creates and drops the
 * database around the run; every package in that run inherits the variable, so
 * the schema is migrated once rather than per package. An explicit
 * `DATABASE_URL` still wins, which is how CI and `db:*` scripts point somewhere
 * of their own.
 */
function runScopedUrl(): string {
  const run = process.env.PLATFORM_TEST_RUN;
  if (!run) {
    return DEFAULT_LOCAL_URL;
  }
  const url = new URL(DEFAULT_LOCAL_URL);
  // The suffix is load-bearing: `assertWipeable` refuses to truncate a database
  // whose name does not end in `_test`.
  url.pathname = `/platform_run${run.replace(/\W/g, "")}_test`;
  return url.toString();
}

/**
 * The database a test is allowed to wipe names itself as one.
 *
 * `truncateAll` empties every row in `beforeEach`, and it truncates whatever
 * `DATABASE_URL` points at. A suite that needs credentials from `apps/api/.env`
 * gets run as `dotenv -e .env -- vitest`, and that file also carries
 * `DATABASE_URL=.../platform` — so one flag aimed the suites at the dev
 * database and deleted a developer's org, projects and files, leaving their own
 * fixtures behind. The comment above this used to be the only thing standing
 * between those two databases.
 */
function assertWipeable(): void {
  // Read from the URL, not `pool.options.database`: a pool built from a
  // connection string leaves that undefined, so checking it refused every
  // legitimate run.
  const name = new URL(dbUrl()).pathname.replace(/^\//, "");
  if (name.endsWith("_test")) {
    return;
  }
  throw new Error(
    `refusing to truncate "${name}": the test suites only wipe a database whose name ends in _test. ` +
      "DATABASE_URL is pointing somewhere else — most likely apps/api/.env, loaded by a `dotenv -e .env --` wrapper."
  );
}

/**
 * Tables in FK-dependency order (children before parents). Used only for the
 * explicit list passed to `TRUNCATE ... CASCADE` — CASCADE itself would handle
 * the ordering, but listing tables explicitly catches the case where someone
 * adds a new table and forgets to wire the test setup.
 */
const TABLES = [
  "audit_event",
  "file_upload",
  "file",
  "graph_version",
  "graph_edge",
  "graph_node",
  "thread_run",
  "thread_message",
  "thread",
  // Children before parents: `group.parent_id` is restrict-on-delete, and
  // TRUNCATE CASCADE does not walk a self-reference for us.
  "group",
  "project",
  "org",
  "user",
] as const;

export function dbUrl(): string {
  return process.env.DATABASE_URL ?? runScopedUrl();
}

/**
 * Probe the configured Postgres before any tests run. `vitest`'s
 * `describe.skipIf(!await isDbReachable())` would be nicer, but `skipIf`
 * doesn't take async — so we cache a sync flag set at module-init time
 * via `setDbReachable`.
 */
let cachedReachable: boolean | undefined;

export async function isDbReachable(): Promise<boolean> {
  if (cachedReachable !== undefined) {
    return cachedReachable;
  }
  if (process.env.SKIP_DB_TESTS === "1") {
    cachedReachable = false;
    return false;
  }
  const pool = new pg.Pool({
    connectionString: dbUrl(),
    max: 1,
    connectionTimeoutMillis: 1000,
  });
  try {
    await pool.query("select 1");
    cachedReachable = true;
  } catch {
    cachedReachable = false;
  } finally {
    await pool.end().catch(() => {});
  }
  return cachedReachable;
}

export function createTestPool(): pg.Pool {
  return new pg.Pool({ connectionString: dbUrl(), max: 4 });
}

const tenancySchema = { org, project };

const usersSchema = { user };

const authorizationSchema = { group };

const graphSchema = {
  graphNode,
  graphEdge,
  graphVersion,
};

const filesSchema = { file, fileUpload };

const auditSchema = { auditEvent };

const threadsSchema = {
  thread,
  threadMessage,
  threadRun,
};

export function createTestDb(pool?: pg.Pool): {
  auditDb: AuditDatabase;
  authorizationDb: AuthorizationDatabase;
  db: GraphDatabase;
  filesDb: FilesDatabase;
  tenancyDb: TenancyDatabase;
  threadsDb: ThreadsDatabase;
  usersDb: UsersDatabase;
  pool: pg.Pool;
} {
  const owned = pool ?? createTestPool();
  const db = drizzle(owned, { schema: graphSchema }) as GraphDatabase;
  const tenancyDb = drizzle(owned, {
    schema: tenancySchema,
  }) as unknown as TenancyDatabase;
  const usersDb = drizzle(owned, {
    schema: usersSchema,
  }) as unknown as UsersDatabase;
  // `as unknown as`, like the two above: the files schema carries a `tsvector`
  // custom type, and the resulting generic is deep enough that TS stops
  // comparing it structurally against the package's own `Database`. The runtime
  // object is the same tables over the same pool either way.
  const filesDb = drizzle(owned, {
    schema: filesSchema,
  }) as unknown as FilesDatabase;
  const authorizationDb = drizzle(owned, {
    schema: authorizationSchema,
  }) as unknown as AuthorizationDatabase;
  const threadsDb = drizzle(owned, {
    schema: threadsSchema,
  }) as ThreadsDatabase;
  const auditDb = drizzle(owned, {
    schema: auditSchema,
  }) as unknown as AuditDatabase;
  return {
    auditDb,
    authorizationDb,
    db,
    filesDb,
    tenancyDb,
    threadsDb,
    usersDb,
    pool: owned,
  };
}

/**
 * The platform database's slices, each migrated by its owning package —
 * mirrors what a deployment's migrate step runs. Folders are resolved
 * relative to this repo checkout (this package is repo-internal).
 */
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const SLICES = [
  // Tenancy and users first: authorization's `0001_seed_directory_groups` reads
  // `org` and `project`, so on a fresh database it fails outright when it runs
  // before the tables it seeds from exist. Authorization next, because the
  // slices below backfill their `group_id` from the groups it creates.
  { package: "tenancy-api", journal: "__drizzle_migrations_tenancy" },
  { package: "users-api", journal: "__drizzle_migrations_users" },
  { package: "authorization", journal: "__drizzle_migrations_permissions" },
  { package: "audit-api", journal: "__drizzle_migrations_audit" },
  { package: "graph-api", journal: "__drizzle_migrations_graph" },
  { package: "files-api", journal: "__drizzle_migrations_files" },
  { package: "threads-api", journal: "__drizzle_migrations_threads" },
] as const;

export async function ensureMigrated(pool: pg.Pool): Promise<void> {
  assertWipeable();
  for (const slice of SLICES) {
    await migrate(drizzle(pool), {
      migrationsFolder: path.join(
        REPO_ROOT,
        "packages",
        slice.package,
        "drizzle"
      ),
      migrationsTable: slice.journal,
    });
  }
}

/**
 * Wipe Postgres and the tuples that point at it.
 *
 * Keto is a second store and `TRUNCATE` does not reach it, so without this the
 * tuple set grows across the suite and a later test inherits a standing an
 * earlier one granted. The group ids have to be read before the truncate,
 * because afterwards there is nothing left to name them by.
 */
export async function truncateAll(pool: pg.Pool): Promise<void> {
  assertWipeable();
  const groups = await pool.query<{ id: string }>('SELECT id FROM "group"');
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await pool.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  await clearTuples(groups.rows.map((row) => row.id));
}

/** Every tuple on the named groups, gone. No-op when Keto is not reachable. */
async function clearTuples(groupIds: string[]): Promise<void> {
  if (groupIds.length === 0 || process.env.PLATFORM_API_KETO_OK !== "1") {
    return;
  }
  const readUrl = process.env.KETO_READ_URL ?? "http://localhost:4466";
  const writeUrl = process.env.KETO_WRITE_URL ?? "http://localhost:4467";
  const deltas: unknown[] = [];
  for (const id of groupIds) {
    const query = new URLSearchParams({
      namespace: "Group",
      object: id,
      page_size: "500",
    });
    const page = await fetch(`${readUrl}/relation-tuples?${query}`);
    if (!page.ok) {
      continue;
    }
    const body = (await page.json()) as { relation_tuples?: unknown[] };
    for (const relation_tuple of body.relation_tuples ?? []) {
      deltas.push({ action: "delete", relation_tuple });
    }
  }
  if (deltas.length > 0) {
    await fetch(`${writeUrl}/admin/relation-tuples`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(deltas),
    });
  }
}
