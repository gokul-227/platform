import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** Drizzle's default journal table; packages sharing a database override it. */
const DEFAULT_MIGRATIONS_TABLE = "__drizzle_migrations";
/** Drizzle writes its journal table into this schema. */
const MIGRATIONS_SCHEMA = "drizzle";
const SAFE_IDENTIFIER = /^[A-Za-z0-9_]+$/;

interface JournalEntry {
  tag: string;
  when: number;
}

function readJournal(migrationsFolder: string): JournalEntry[] {
  const journalPath = path.join(migrationsFolder, "meta", "_journal.json");
  if (!existsSync(journalPath)) {
    return [];
  }
  const parsed = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries?: JournalEntry[];
  };
  return parsed.entries ?? [];
}

/**
 * What has been applied, and the content it had when it was. Drizzle stores the
 * journal entry's `when` as `created_at` and a sha256 of the migration file as
 * `hash`, so the pair is enough to tell "already applied" from "applied, then
 * edited". A missing table means nothing has been applied yet.
 */
async function appliedMigrations(
  pool: pg.Pool,
  table: string
): Promise<Map<number, string>> {
  if (!SAFE_IDENTIFIER.test(table)) {
    throw new Error(`Unsafe migrations table name: ${table}`);
  }
  try {
    const { rows } = await pool.query<{ created_at: string; hash: string }>(
      `select created_at, hash from "${MIGRATIONS_SCHEMA}"."${table}"`
    );
    return new Map(rows.map((r) => [Number(r.created_at), r.hash]));
  } catch (err) {
    if ((err as { code?: string }).code === "42P01") {
      return new Map();
    }
    throw err;
  }
}

/** Drizzle's own hash: sha256 of the migration file, verbatim. */
function hashMigration(migrationsFolder: string, tag: string): string | null {
  const file = path.join(migrationsFolder, `${tag}.sql`);
  if (!existsSync(file)) {
    return null;
  }
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/**
 * Refuse to run when an already-applied migration is no longer the migration
 * that was applied.
 *
 * Drizzle decides what to apply by comparing the journal's `when` against the
 * highest `created_at` it has recorded, and never looks at the content of what
 * already ran. So editing, renaming or deleting an applied migration is silent:
 * the new SQL never executes, `status` still reports it applied, the deploy goes
 * green, and the schema quietly stops matching the code. The failure surfaces
 * later as an undefined column on a live route.
 *
 * The hash needed to catch it is already in the journal table; nothing read it
 * until now. A changed migration is a new migration, so the fix is always to add
 * one rather than to rewrite history.
 */
function verifyApplied(
  applied: Map<number, string>,
  entries: JournalEntry[],
  migrationsFolder: string
): string[] {
  const byWhen = new Map(entries.map((entry) => [entry.when, entry]));
  const problems: string[] = [];

  for (const [when, appliedHash] of applied) {
    const entry = byWhen.get(when);
    if (!entry) {
      problems.push(
        `a migration applied at ${when} is no longer in the journal: it was deleted, or its "when" was changed`
      );
      continue;
    }
    const current = hashMigration(migrationsFolder, entry.tag);
    if (current === null) {
      problems.push(`${entry.tag}: applied, but its .sql file is missing`);
      continue;
    }
    if (current !== appliedHash) {
      problems.push(
        `${entry.tag}: applied with different content (was ${appliedHash.slice(0, 12)}, now ${current.slice(0, 12)}). ` +
          "The database still has the old schema and nothing will re-run it. Add a new migration instead."
      );
    }
  }
  return problems;
}

/**
 * Shared entrypoint for the per-package drizzle migrate CLIs. `up` applies the
 * package's bundled SQL migrations (`drizzle/`), `status` lists applied vs
 * pending without touching the database. Drizzle has no down migrations; reset
 * a dev database by dropping and recreating it. Exits non-zero on any failure
 * so CI can gate deploys behind it.
 *
 * The migrations folder is resolved relative to the running script (works
 * from `bin/` via tsx and from `dist/bin/` in a container) with a cwd
 * fallback.
 */
/**
 * Accept the current files as the ones that were applied.
 *
 * The deliberate escape hatch from the drift check, and a separate verb because
 * it is not part of deploying: it rewrites history to match the working tree
 * without touching the database's shape. Run it only after establishing what the
 * old files actually did, and alongside a new migration for whatever they missed.
 * Reaching for it to make CI green is how a schema and its migrations part ways
 * for good.
 */
async function reconcile(
  pool: pg.Pool,
  table: string,
  entries: JournalEntry[],
  migrationsFolder: string
): Promise<number> {
  if (!SAFE_IDENTIFIER.test(table)) {
    throw new Error(`Unsafe migrations table name: ${table}`);
  }
  let updated = 0;
  for (const entry of entries) {
    const hash = hashMigration(migrationsFolder, entry.tag);
    if (hash === null) {
      continue;
    }
    const { rowCount } = await pool.query(
      `update "${MIGRATIONS_SCHEMA}"."${table}" set hash = $1 where created_at = $2 and hash <> $1`,
      [hash, entry.when]
    );
    updated += rowCount ?? 0;
  }
  return updated;
}

export async function runMigrateCli(options: {
  /** Env var carrying the database url; `DATABASE_URL` is the fallback. */
  envVar: string;
  /**
   * Journal table name. Packages sharing one logical database MUST set a
   * distinct name (`__drizzle_migrations_<package>`) so their applied sets
   * don't collide; a package owning its database can omit it (drizzle
   * default).
   */
  migrationsTable?: string;
}): Promise<never> {
  const exit = (code: number): never => process.exit(code);

  const action = process.argv[2] ?? "up";
  if (action !== "up" && action !== "status" && action !== "reconcile") {
    console.error(
      `Unknown action: ${action}. Expected 'up', 'status' or 'reconcile'.`
    );
    return exit(1);
  }

  const url = process.env[options.envVar] ?? process.env.DATABASE_URL;
  if (!url) {
    console.error(`${options.envVar} (or DATABASE_URL) is required`);
    return exit(1);
  }

  const script = process.argv[1] ?? process.cwd();
  const candidates = [
    path.resolve(path.dirname(script), "../drizzle"),
    path.resolve(path.dirname(script), "../../drizzle"),
    path.resolve(process.cwd(), "drizzle"),
  ];
  const migrationsFolder = candidates.find((c) => existsSync(c));
  if (!migrationsFolder) {
    console.error(`drizzle migrations folder not found near ${script}`);
    return exit(1);
  }

  const table = options.migrationsTable ?? DEFAULT_MIGRATIONS_TABLE;
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const entries = readJournal(migrationsFolder);
    const applied = await appliedMigrations(pool, table);
    const problems = verifyApplied(applied, entries, migrationsFolder);

    if (action === "status") {
      let pending = 0;
      for (const entry of entries) {
        const isApplied = applied.has(entry.when);
        pending += isApplied ? 0 : 1;
        console.log(`${isApplied ? "applied" : "pending"}  ${entry.tag}`);
      }
      console.log(`${entries.length} migration(s), ${pending} pending`);
      for (const problem of problems) {
        console.error(`drift: ${problem}`);
      }
      return exit(problems.length > 0 ? 3 : 0);
    }

    if (action === "reconcile") {
      if (problems.length === 0) {
        console.log("nothing to reconcile: every applied migration matches");
        return exit(0);
      }
      for (const problem of problems) {
        console.log(`reconciling: ${problem}`);
      }
      const updated = await reconcile(pool, table, entries, migrationsFolder);
      console.log(
        `${updated} journal row(s) updated. The schema was NOT changed: whatever the old files did or failed to do is still the shape of this database. Anything genuinely missing needs a new migration.`
      );
      return exit(0);
    }

    if (problems.length > 0) {
      console.error(
        "refusing to migrate: the database was migrated with different files than these"
      );
      for (const problem of problems) {
        console.error(`  ${problem}`);
      }
      console.error(
        "Fix forward with a new migration. Once the schema is verified, `reconcile` accepts the current files as the applied ones."
      );
      return exit(3);
    }

    await migrate(drizzle(pool), {
      migrationsFolder,
      ...(options.migrationsTable
        ? { migrationsTable: options.migrationsTable }
        : {}),
    });
    console.log("migrations applied");
    return exit(0);
  } catch (err) {
    console.error(`${action} failed:`, err);
    return exit(2);
  } finally {
    await pool.end();
  }
}
