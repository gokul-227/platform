// Create and drop the per-run test database the root `test` script stamps.
//
// Plain `.mjs` because this package is never built: the script has to run under
// bare node from a pnpm lifecycle, before any test process exists.
//
// Both subcommands are idempotent. `create` tolerates a database that is
// already there (42P04) so a re-entrant run does not fail, and `drop` tolerates
// one that is gone.

import pg from "pg";

const DEFAULT_URL = "postgres://auth_app_role:dev@localhost:5433/platform_test";

function targetUrl() {
  const run = process.env.PLATFORM_TEST_RUN;
  const url = new URL(process.env.DATABASE_URL ?? DEFAULT_URL);
  if (!process.env.DATABASE_URL && run) {
    url.pathname = `/platform_run${run.replace(/\W/g, "")}_test`;
  }
  return url;
}

/**
 * `postgres` is the maintenance database: CREATE and DROP cannot run from
 * inside the database they name.
 */
function maintenanceUrl(target) {
  const url = new URL(target.toString());
  url.pathname = "/postgres";
  return url.toString();
}

async function main() {
  const action = process.argv[2];
  const target = targetUrl();
  const name = target.pathname.replace(/^\//, "");
  // Never let this reach the shared database, whichever way it was invoked.
  if (!name.startsWith("platform_run")) {
    return;
  }
  const client = new pg.Client({ connectionString: maintenanceUrl(target) });
  try {
    await client.connect();
  } catch {
    // No reachable Postgres is the same non-event it is for the suites: they
    // self-skip, so the run must not fail here.
    return;
  }
  try {
    if (action === "create") {
      await client.query(`CREATE DATABASE "${name}"`);
    } else if (action === "drop") {
      await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    }
  } catch (error) {
    if (error?.code !== "42P04") {
      throw error;
    }
  } finally {
    await client.end().catch(() => {});
  }
}

await main();
