import pg from "pg";

/**
 * Vitest `globalSetup` — runs once before any worker boots. We use it to probe
 * the configured Postgres before suites load, then stash the result on
 * `process.env.PLATFORM_API_DB_OK` so each integration suite can do a synchronous
 * `describe.skipIf(...)`.
 *
 * Probing here (instead of inside each suite's `beforeAll`) means:
 *   - Suites that depend on the DB skip *cleanly* — no slow per-suite probe.
 *   - One coherent decision: either all integration suites run, or none do.
 *   - No `process.env.SKIP_DB_TESTS` plumbing is needed.
 *
 * Keto is probed the same way. Authorization is the thing under test here, so a
 * suite that cannot reach it has to skip rather than run against a stub: a
 * stubbed permission store answers whatever the stub was told to, which is the
 * one thing these tests must not do.
 *
 * It also clears what a killed run left behind. A vitest process killed
 * mid-test leaves its backend `idle in transaction`, holding locks that the
 * next run's `TRUNCATE` waits on until the hook times out — thirty seconds per
 * file, reported as a suite failing for no visible reason.
 *
 * Only a transaction idle for a minute, and only once per run before any worker
 * boots. Both bounds matter: a live run's connections are never idle that long,
 * and terminating per file would cut this run's own pool. Two runs at once is a
 * different problem and this does not paper over it — they contend for the same
 * rows whatever the connections do.
 */
export default async function setup(): Promise<void> {
  if (process.env.SKIP_DB_TESTS === "1") {
    process.env.PLATFORM_API_DB_OK = "0";
    process.env.PLATFORM_API_KETO_OK = "0";
    return;
  }
  process.env.PLATFORM_API_KETO_OK = (await ketoReachable()) ? "1" : "0";
  const url =
    process.env.DATABASE_URL ??
    "postgres://auth_app_role:dev@localhost:5433/platform_test";
  const pool = new pg.Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: 1000,
  });
  try {
    await pool.query("select 1");
    process.env.PLATFORM_API_DB_OK = "1";
    await clearStaleBackends(pool, url);
  } catch {
    process.env.PLATFORM_API_DB_OK = "0";
  } finally {
    await pool.end().catch(() => {});
  }
}

/**
 * Every other connection to the test database, gone. Named by the same rule
 * `truncateAll` uses — a database this run may wipe is one it may also
 * disconnect — and never anything else, because the name is the only thing
 * standing between a test run and somebody's dev data.
 */
async function clearStaleBackends(pool: pg.Pool, url: string): Promise<void> {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    return;
  }
  await pool.query(
    `select pg_terminate_backend(pid) from pg_stat_activity
       where datname = $1
         and pid <> pg_backend_pid()
         and state = 'idle in transaction'
         and state_change < now() - interval '60 seconds'`,
    [name]
  );
}

/** Keto's read port, the same one `apps/api` checks against. */
async function ketoReachable(): Promise<boolean> {
  const url = process.env.KETO_READ_URL ?? "http://localhost:4466";
  try {
    const response = await fetch(`${url}/health/ready`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
